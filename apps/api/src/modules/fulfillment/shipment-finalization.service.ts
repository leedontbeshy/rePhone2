import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { requestContext } from '../../common/http/request-context.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { FulfillmentInventoryGateway } from '../inventory/fulfillment-inventory.gateway.js';
import { OrderNotificationService } from '../notifications/order-notification.service.js';
import {
  FulfillmentOrderGateway,
  type FulfillmentOrderRecord,
} from '../order-transaction-ports/fulfillment-order.gateway.js';
import { FulfillmentPaymentGateway } from '../payments/fulfillment-payment.gateway.js';
import { CheckoutSettingsReader } from '../settings/checkout-settings.reader.js';
import { FulfillmentVoucherGateway } from '../vouchers/fulfillment-voucher.gateway.js';
import { WarrantyIssuanceService } from '../warranty/warranty-issuance.service.js';
import type {
  MarkShipmentDeliveredDto,
  MarkShipmentFailedDto,
  MarkShipmentReturnedDto,
} from './fulfillment.dto.js';
import { FulfillmentClock } from './fulfillment-clock.service.js';
import { projectBackofficeOrderDetail } from './fulfillment.projector.js';
import type { BackofficeOrderDetailDto } from './fulfillment-response.dto.js';
import { ShipmentGateway } from './shipment.gateway.js';

@Injectable()
export class ShipmentFinalizationService {
  public constructor(
    @Inject(FulfillmentOrderGateway) private readonly orders: FulfillmentOrderGateway,
    @Inject(ShipmentGateway) private readonly shipments: ShipmentGateway,
    @Inject(FulfillmentPaymentGateway) private readonly payments: FulfillmentPaymentGateway,
    @Inject(FulfillmentInventoryGateway)
    private readonly inventory: FulfillmentInventoryGateway,
    @Inject(FulfillmentVoucherGateway) private readonly vouchers: FulfillmentVoucherGateway,
    @Inject(WarrantyIssuanceService) private readonly warranties: WarrantyIssuanceService,
    @Inject(CheckoutSettingsReader) private readonly settings: CheckoutSettingsReader,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(OrderNotificationService) private readonly notifications: OrderNotificationService,
    @Inject(FulfillmentClock) private readonly clock: FulfillmentClock,
  ) {}

  public async markDelivered(
    shipmentId: string,
    input: MarkShipmentDeliveredDto,
    auth: AuthContext,
    request: Request,
  ): Promise<BackofficeOrderDetailDto> {
    const candidate = await this.requireCandidate(shipmentId);
    const outcome = await this.transactions.run(
      'fulfillment.mark-shipment-delivered',
      async (tx) => {
        const order = await this.orders.lock(candidate.orderId, tx);
        if (order === null) throw new ApiError('RESOURCE_NOT_FOUND');
        const shipment = await this.shipments.lock(shipmentId, order.id, tx);
        if (shipment === null) throw new ApiError('RESOURCE_NOT_FOUND');
        if (
          shipment.status === 'DELIVERED' &&
          order.status === 'COMPLETED' &&
          order.fulfillmentStatus === 'COMPLETED'
        ) {
          return { orderId: order.id, changed: false };
        }
        assertInTransitOrder(order);
        if (shipment.status !== 'HANDED_TO_CARRIER' || shipment.shippedAt === null) {
          throw new ApiError('INVALID_STATE_TRANSITION');
        }

        const finance = await this.payments.lockFinance(order.id, tx, order.channel);
        if (
          order.channel === 'DEALER' &&
          (finance.dealer?.fullyFunded !== true || input.confirmCodCollected === true)
        )
          throw new ApiError('ORDER_NOT_FULLY_PAID');
        const proof = await this.inventory.lockShippingCompletionProof(order.id, tx);
        this.inventory.assertShippingCompletionProof(
          proof.reservations,
          proof.movements,
          order.id,
          order.items,
          order.fulfillmentLocationId,
          shipment.shippedAt,
        );
        const beforeFinance = this.payments.project(BigInt(order.grandTotal.toString()), finance);
        validateCodConfirmation(beforeFinance.balanceDue, input.confirmCodCollected);
        const now = this.clock.now();
        if (beforeFinance.balanceDue > 0n) {
          await this.payments.createVerifiedCod(
            order.id,
            beforeFinance.balanceDue,
            auth.userId,
            now,
            tx,
          );
          finance.payments.push({
            id: 'pending-cod',
            purpose: 'BALANCE',
            method: 'COD',
            status: 'VERIFIED',
            expectedAmount: beforeFinance.balanceDue.toString(),
            receivedAmount: beforeFinance.balanceDue.toString(),
          });
        }
        const finalFinance = this.payments.project(BigInt(order.grandTotal.toString()), finance);
        if (finalFinance.paymentStatus !== 'PAID' || finalFinance.balanceDue !== 0n) {
          throw new ApiError('ORDER_NOT_FULLY_PAID');
        }

        await this.inventory.completeShipping(order.items, order.fulfillmentLocationId, now, tx);
        await this.vouchers.consume(order.id, now, tx);
        const settings = await this.settings.read(tx);
        const issued = await this.warranties.issueForOrder(
          order.items,
          order.customerId,
          now,
          settings.timezone,
          tx,
        );
        const shipmentUpdated = await tx.shipment.updateMany({
          where: { id: shipment.id, orderId: order.id, status: 'HANDED_TO_CARRIER' },
          data: { status: 'DELIVERED', deliveredAt: now },
        });
        if (shipmentUpdated.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
        const orderUpdated = await tx.order.updateMany({
          where: { id: order.id, status: 'PROCESSING', fulfillmentStatus: 'IN_TRANSIT' },
          data: {
            status: 'COMPLETED',
            fulfillmentStatus: 'COMPLETED',
            paymentStatus: finalFinance.paymentStatus,
            paidAmount: finalFinance.paidAmount.toString(),
            refundedAmount: finalFinance.refundedAmount.toString(),
            balanceDue: '0',
            completedAt: now,
          },
        });
        if (orderUpdated.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
        await this.audit.write(
          tx,
          { actorUserId: auth.userId, ...requestContext(request) },
          {
            action: 'shipment.delivered',
            resourceType: 'Shipment',
            resourceId: shipment.id,
            changes: {
              before: {
                shipmentStatus: shipment.status,
                orderStatus: order.status,
                fulfillmentStatus: order.fulfillmentStatus,
                paymentStatus: order.paymentStatus,
              },
              after: {
                shipmentStatus: 'DELIVERED',
                orderStatus: 'COMPLETED',
                fulfillmentStatus: 'COMPLETED',
                paymentStatus: finalFinance.paymentStatus,
              },
            },
            metadata: {
              orderNumber: order.orderNumber,
              codCollected: beforeFinance.balanceDue.toString(),
              warrantyCount: issued.length,
            },
          },
        );
        return { orderId: order.id, changed: true };
      },
    );

    const detail = await this.project(outcome.orderId);
    if (outcome.changed) await this.notifications.sendCompleted(detail);
    return detail;
  }

  public async markFailed(
    shipmentId: string,
    input: MarkShipmentFailedDto,
    auth: AuthContext,
    request: Request,
  ): Promise<BackofficeOrderDetailDto> {
    const candidate = await this.requireCandidate(shipmentId);
    const reason = input.reason.trim();
    const outcome = await this.transactions.run('fulfillment.mark-shipment-failed', async (tx) => {
      const order = await this.orders.lock(candidate.orderId, tx);
      if (order === null) throw new ApiError('RESOURCE_NOT_FOUND');
      const shipment = await this.shipments.lock(shipmentId, order.id, tx);
      if (shipment === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (
        shipment.status === 'FAILED' &&
        shipment.failureReason?.trim() === reason &&
        order.status === 'PROCESSING' &&
        order.fulfillmentStatus === 'FAILED'
      ) {
        return { orderId: order.id, changed: false };
      }
      assertInTransitOrder(order);
      if (shipment.status !== 'HANDED_TO_CARRIER') {
        throw new ApiError('INVALID_STATE_TRANSITION');
      }
      const now = this.clock.now();
      const shipmentUpdated = await tx.shipment.updateMany({
        where: { id: shipment.id, orderId: order.id, status: 'HANDED_TO_CARRIER' },
        data: { status: 'FAILED', failedAt: now, failureReason: reason },
      });
      if (shipmentUpdated.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
      const orderUpdated = await tx.order.updateMany({
        where: { id: order.id, status: 'PROCESSING', fulfillmentStatus: 'IN_TRANSIT' },
        data: { fulfillmentStatus: 'FAILED' },
      });
      if (orderUpdated.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
      await this.audit.write(
        tx,
        { actorUserId: auth.userId, ...requestContext(request) },
        {
          action: 'shipment.failed',
          resourceType: 'Shipment',
          resourceId: shipment.id,
          changes: {
            before: { shipmentStatus: shipment.status, fulfillmentStatus: order.fulfillmentStatus },
            after: { shipmentStatus: 'FAILED', fulfillmentStatus: 'FAILED' },
          },
          metadata: { orderNumber: order.orderNumber, reason },
        },
      );
      return { orderId: order.id, changed: true };
    });

    const detail = await this.project(outcome.orderId);
    return detail;
  }

  public async markReturned(
    shipmentId: string,
    input: MarkShipmentReturnedDto,
    auth: AuthContext,
    request: Request,
  ): Promise<BackofficeOrderDetailDto> {
    const candidate = await this.requireCandidate(shipmentId);
    const reason = input.reason.trim();
    const outcome = await this.transactions.run(
      'fulfillment.mark-shipment-returned',
      async (tx) => {
        const order = await this.orders.lock(candidate.orderId, tx);
        if (order === null) throw new ApiError('RESOURCE_NOT_FOUND');
        const shipment = await this.shipments.lock(shipmentId, order.id, tx);
        if (shipment === null) throw new ApiError('RESOURCE_NOT_FOUND');
        if (
          shipment.status === 'RETURNED' &&
          shipment.returnedToLocationId === input.returnedToLocationId &&
          shipment.returnNote?.trim() === reason &&
          order.status === 'PROCESSING' &&
          order.fulfillmentStatus === 'RETURNED'
        ) {
          return { orderId: order.id, changed: false };
        }
        if (
          order.fulfillmentType !== 'SHIPPING' ||
          order.status !== 'PROCESSING' ||
          order.fulfillmentStatus !== 'FAILED' ||
          shipment.status !== 'FAILED'
        ) {
          throw new ApiError('INVALID_STATE_TRANSITION');
        }
        const location = await tx.inventoryLocation.findUnique({
          where: { id: input.returnedToLocationId },
          select: { id: true, status: true, type: true },
        });
        if (location === null) throw new ApiError('RESOURCE_NOT_FOUND');
        if (location.status !== 'ACTIVE' || !isReturnLocationType(location.type)) {
          throw new ApiError('INVALID_STATE_TRANSITION');
        }

        await this.inventory.returnShipping(
          order.items,
          order.fulfillmentLocationId,
          location.id,
          tx,
        );
        const now = this.clock.now();
        const shipmentUpdated = await tx.shipment.updateMany({
          where: { id: shipment.id, orderId: order.id, status: 'FAILED' },
          data: {
            status: 'RETURNED',
            returnedAt: now,
            returnedToLocationId: location.id,
            returnNote: reason,
          },
        });
        if (shipmentUpdated.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
        const orderUpdated = await tx.order.updateMany({
          where: { id: order.id, status: 'PROCESSING', fulfillmentStatus: 'FAILED' },
          data: { fulfillmentStatus: 'RETURNED' },
        });
        if (orderUpdated.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
        await this.audit.write(
          tx,
          { actorUserId: auth.userId, ...requestContext(request) },
          {
            action: 'shipment.returned',
            resourceType: 'Shipment',
            resourceId: shipment.id,
            changes: {
              before: {
                shipmentStatus: shipment.status,
                fulfillmentStatus: order.fulfillmentStatus,
              },
              after: {
                shipmentStatus: 'RETURNED',
                fulfillmentStatus: 'RETURNED',
                returnedToLocationId: location.id,
              },
            },
            metadata: { orderNumber: order.orderNumber, reason },
          },
        );
        return { orderId: order.id, changed: true };
      },
    );

    const detail = await this.project(outcome.orderId);
    return detail;
  }

  private async requireCandidate(shipmentId: string): Promise<{ orderId: string }> {
    const candidate = await this.shipments.findOrderId(shipmentId);
    if (candidate === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return candidate;
  }

  private async project(id: string): Promise<BackofficeOrderDetailDto> {
    const order = await this.orders.findById(id);
    if (order === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return projectBackofficeOrderDetail(order, this.clock.now());
  }
}

function assertInTransitOrder(order: FulfillmentOrderRecord): void {
  if (
    order.fulfillmentType !== 'SHIPPING' ||
    order.status !== 'PROCESSING' ||
    order.fulfillmentStatus !== 'IN_TRANSIT'
  ) {
    throw new ApiError('INVALID_STATE_TRANSITION');
  }
}

function validateCodConfirmation(balanceDue: bigint, confirmed: boolean | undefined): void {
  if (balanceDue > 0n && confirmed !== true) throw new ApiError('ORDER_NOT_FULLY_PAID');
  if (balanceDue === 0n && confirmed === true) {
    throw new ApiError('VALIDATION_FAILED', undefined, [
      {
        field: 'confirmCodCollected',
        code: 'COD_NOT_REQUIRED',
        message: 'Đơn không còn số dư cần thu COD.',
      },
    ]);
  }
}

function isReturnLocationType(value: string): boolean {
  return value === 'STORE' || value === 'WAREHOUSE';
}
