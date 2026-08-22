import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { requestContext } from '../../common/http/request-context.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { FulfillmentInventoryGateway } from '../inventory/fulfillment-inventory.gateway.js';
import { OrderNotificationService } from '../notifications/order-notification.service.js';
import { FulfillmentOrderGateway } from '../order-transaction-ports/fulfillment-order.gateway.js';
import { FulfillmentPaymentGateway } from '../payments/fulfillment-payment.gateway.js';
import { CheckoutSettingsReader } from '../settings/checkout-settings.reader.js';
import { FulfillmentVoucherGateway } from '../vouchers/fulfillment-voucher.gateway.js';
import { WarrantyIssuanceService } from '../warranty/warranty-issuance.service.js';
import type { CompletePickupDto } from './fulfillment.dto.js';
import { FulfillmentClock } from './fulfillment-clock.service.js';
import { projectBackofficeOrderDetail } from './fulfillment.projector.js';
import type { BackofficeOrderDetailDto } from './fulfillment-response.dto.js';
import { assertPickupDeadline } from './pickup-fulfillment.policy.js';

@Injectable()
export class PickupCompletionService {
  public constructor(
    @Inject(FulfillmentOrderGateway) private readonly orders: FulfillmentOrderGateway,
    @Inject(FulfillmentInventoryGateway)
    private readonly inventory: FulfillmentInventoryGateway,
    @Inject(FulfillmentPaymentGateway) private readonly payments: FulfillmentPaymentGateway,
    @Inject(FulfillmentVoucherGateway) private readonly vouchers: FulfillmentVoucherGateway,
    @Inject(WarrantyIssuanceService) private readonly warranties: WarrantyIssuanceService,
    @Inject(CheckoutSettingsReader) private readonly settings: CheckoutSettingsReader,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(OrderNotificationService) private readonly notifications: OrderNotificationService,
    @Inject(FulfillmentClock) private readonly clock: FulfillmentClock,
  ) {}

  public async completePickup(
    id: string,
    input: CompletePickupDto,
    auth: AuthContext,
    request: Request,
  ): Promise<BackofficeOrderDetailDto> {
    const outcome = await this.transactions.run(
      'fulfillment.complete-pickup',
      async (transaction) => {
        const order = await this.orders.lock(id, transaction);
        if (order === null) throw new ApiError('RESOURCE_NOT_FOUND');
        if (order.status === 'COMPLETED' && order.fulfillmentStatus === 'COMPLETED') {
          return { orderId: order.id, changed: false };
        }
        const now = this.clock.now();
        const holdUntil = assertPickupDeadline(order, now);
        if (order.status !== 'PROCESSING' || order.fulfillmentStatus !== 'READY') {
          throw new ApiError('INVALID_STATE_TRANSITION');
        }
        if (
          order.fulfillmentLocation.type !== 'STORE' ||
          order.fulfillmentLocation.status !== 'ACTIVE' ||
          order.pickupLocationId !== order.fulfillmentLocationId
        ) {
          throw new ApiError('INVALID_STATE_TRANSITION');
        }

        const lockedFinance = await this.payments.lockFinance(order.id, transaction);
        const reservations = await this.inventory.lockActiveReservations(order.id, transaction);
        this.inventory.assertPickupHold(reservations, order.items.length, holdUntil);
        const beforeFinance = this.payments.project(
          BigInt(order.grandTotal.toString()),
          lockedFinance,
        );
        if (beforeFinance.balanceDue > 0n && input.confirmCashCollected !== true) {
          throw new ApiError('ORDER_NOT_FULLY_PAID');
        }
        if (beforeFinance.balanceDue === 0n && input.confirmCashCollected === true) {
          throw new ApiError('VALIDATION_FAILED', undefined, [
            {
              field: 'confirmCashCollected',
              code: 'CASH_NOT_REQUIRED',
              message: 'Đơn không còn số dư cần thu tiền mặt.',
            },
          ]);
        }
        if (beforeFinance.balanceDue > 0n) {
          await this.payments.createVerifiedCash(
            order.id,
            beforeFinance.balanceDue,
            auth.userId,
            now,
            transaction,
          );
          lockedFinance.payments.push({
            id: 'pending-cash',
            purpose: 'FULL_PAYMENT',
            method: 'CASH',
            status: 'VERIFIED',
            expectedAmount: beforeFinance.balanceDue.toString(),
            receivedAmount: beforeFinance.balanceDue.toString(),
          });
        }
        const finalFinance = this.payments.project(
          BigInt(order.grandTotal.toString()),
          lockedFinance,
        );
        if (finalFinance.paymentStatus !== 'PAID' || finalFinance.balanceDue !== 0n) {
          throw new ApiError('ORDER_NOT_FULLY_PAID');
        }

        await this.inventory.consumePickup(
          reservations,
          order.fulfillmentLocationId,
          auth.userId,
          now,
          transaction,
        );
        await this.vouchers.consume(order.id, now, transaction);
        const settings = await this.settings.read(transaction);
        const issued = await this.warranties.issueForOrder(
          order.items,
          order.customerId,
          now,
          settings.timezone,
          transaction,
        );
        const completed = await transaction.order.updateMany({
          where: { id: order.id, status: 'PROCESSING', fulfillmentStatus: 'READY' },
          data: {
            status: 'COMPLETED',
            fulfillmentStatus: 'COMPLETED',
            paymentStatus: finalFinance.paymentStatus,
            paidAmount: finalFinance.paidAmount.toString(),
            refundedAmount: finalFinance.refundedAmount.toString(),
            balanceDue: '0',
            pickedUpAt: now,
            completedAt: now,
          },
        });
        if (completed.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
        await this.audit.write(
          transaction,
          { actorUserId: auth.userId, ...requestContext(request) },
          {
            action: 'fulfillment.pickup_completed',
            resourceType: 'Order',
            resourceId: order.id,
            changes: {
              before: {
                status: order.status,
                fulfillmentStatus: order.fulfillmentStatus,
                paymentStatus: order.paymentStatus,
              },
              after: {
                status: 'COMPLETED',
                fulfillmentStatus: 'COMPLETED',
                paymentStatus: finalFinance.paymentStatus,
              },
            },
            metadata: {
              orderNumber: order.orderNumber,
              cashCollected: beforeFinance.balanceDue.toString(),
              reservationCount: reservations.length,
              warrantyCount: issued.length,
            },
          },
        );
        return { orderId: order.id, changed: true };
      },
    );

    const order = await this.orders.findById(outcome.orderId);
    if (order === null) throw new ApiError('RESOURCE_NOT_FOUND');
    const detail = projectBackofficeOrderDetail(order, this.clock.now());
    if (outcome.changed) await this.notifications.sendCompleted(detail);
    return detail;
  }
}
