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
import type { Prisma } from '../../generated/prisma/client.js';
import type { CreateShipmentDto } from './fulfillment.dto.js';
import { FulfillmentClock } from './fulfillment-clock.service.js';
import {
  projectBackofficeOrderDetail,
  projectBackofficeShipment,
} from './fulfillment.projector.js';
import type {
  BackofficeOrderDetailDto,
  BackofficeOrderShipmentDto,
} from './fulfillment-response.dto.js';
import { ShipmentGateway, type ShipmentRecord } from './shipment.gateway.js';

export interface CreateShipmentResult {
  shipment: BackofficeOrderShipmentDto;
  created: boolean;
}

@Injectable()
export class ShipmentPreparationService {
  public constructor(
    @Inject(FulfillmentOrderGateway) private readonly orders: FulfillmentOrderGateway,
    @Inject(ShipmentGateway) private readonly shipments: ShipmentGateway,
    @Inject(FulfillmentPaymentGateway) private readonly payments: FulfillmentPaymentGateway,
    @Inject(FulfillmentInventoryGateway)
    private readonly inventory: FulfillmentInventoryGateway,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(OrderNotificationService) private readonly notifications: OrderNotificationService,
    @Inject(FulfillmentClock) private readonly clock: FulfillmentClock,
  ) {}

  public async create(
    orderId: string,
    input: CreateShipmentDto,
    auth: AuthContext,
    request: Request,
  ): Promise<CreateShipmentResult> {
    const normalized = {
      carrierName: input.carrierName.trim(),
      trackingCode: input.trackingCode.trim(),
      trackingUrl: input.trackingUrl?.trim() ?? null,
    };
    let outcome: { shipmentId: string; changed: boolean };
    try {
      outcome = await this.transactions.run('fulfillment.create-shipment', async (transaction) => {
        const order = await this.orders.lock(orderId, transaction);
        if (order === null) throw new ApiError('RESOURCE_NOT_FOUND');
        const existing = order.shipments[0];
        if (existing !== undefined) {
          if (isExactCreateReplay(existing, normalized)) {
            return { shipmentId: existing.id, changed: false };
          }
          throw new ApiError('DUPLICATE_RESOURCE');
        }
        assertPreparingShippingOrder(order);
        const finance = await this.payments.lockFinance(order.id, transaction);
        assertVerifiedDeposit(order, finance);
        const reservations = await this.inventory.lockActiveReservations(order.id, transaction);
        this.inventory.assertShippingHold(
          reservations,
          order.id,
          order.items,
          order.fulfillmentLocationId,
        );
        const shipment = await this.shipments.create(
          { orderId: order.id, ...normalized, createdById: auth.userId },
          transaction,
        );
        await this.audit.write(
          transaction,
          { actorUserId: auth.userId, ...requestContext(request) },
          {
            action: 'shipment.created',
            resourceType: 'Shipment',
            resourceId: shipment.id,
            changes: {
              after: {
                status: shipment.status,
                attemptNumber: shipment.attemptNumber,
                carrierName: shipment.carrierName,
                trackingCode: shipment.trackingCode,
              },
            },
            metadata: { orderNumber: order.orderNumber },
          },
        );
        return { shipmentId: shipment.id, changed: true };
      });
    } catch (error) {
      if (isUniqueError(error)) {
        const winner = await this.shipments.findByOrderId(orderId);
        if (winner !== null && isExactCreateReplay(winner, normalized)) {
          return { shipment: projectBackofficeShipment(winner), created: false };
        }
        throw new ApiError('DUPLICATE_RESOURCE');
      }
      throw error;
    }
    const shipment = await this.shipments.findById(outcome.shipmentId);
    if (shipment === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return { shipment: projectBackofficeShipment(shipment), created: outcome.changed };
  }

  public async handOver(
    shipmentId: string,
    auth: AuthContext,
    request: Request,
  ): Promise<BackofficeOrderDetailDto> {
    const candidate = await this.shipments.findOrderId(shipmentId);
    if (candidate === null) throw new ApiError('RESOURCE_NOT_FOUND');
    const outcome = await this.transactions.run('fulfillment.hand-over-shipment', async (tx) => {
      const order = await this.orders.lock(candidate.orderId, tx);
      if (order === null) throw new ApiError('RESOURCE_NOT_FOUND');
      const shipment = await this.shipments.lock(shipmentId, order.id, tx);
      if (shipment === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (
        shipment.status === 'HANDED_TO_CARRIER' &&
        order.status === 'PROCESSING' &&
        order.fulfillmentStatus === 'IN_TRANSIT'
      ) {
        return { orderId: order.id, changed: false };
      }
      assertPreparingShippingOrder(order);
      if (shipment.status !== 'CREATED') throw new ApiError('INVALID_STATE_TRANSITION');

      const finance = await this.payments.lockFinance(order.id, tx);
      assertVerifiedDeposit(order, finance);
      const reservations = await this.inventory.lockActiveReservations(order.id, tx);
      this.inventory.assertShippingHold(
        reservations,
        order.id,
        order.items,
        order.fulfillmentLocationId,
      );
      const now = this.clock.now();
      await this.inventory.handoverShipping(
        reservations,
        order.fulfillmentLocationId,
        auth.userId,
        now,
        tx,
      );
      const shipmentUpdated = await tx.shipment.updateMany({
        where: { id: shipment.id, orderId: order.id, status: 'CREATED' },
        data: { status: 'HANDED_TO_CARRIER', shippedAt: now },
      });
      if (shipmentUpdated.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
      const orderUpdated = await tx.order.updateMany({
        where: { id: order.id, status: 'PROCESSING', fulfillmentStatus: 'PREPARING' },
        data: { fulfillmentStatus: 'IN_TRANSIT' },
      });
      if (orderUpdated.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
      await this.writeHandoverAudit(tx, order, shipment, auth, request, reservations.length, now);
      return { orderId: order.id, changed: true };
    });

    const detail = await this.project(outcome.orderId);
    if (outcome.changed) await this.notifications.sendShipmentHandedOver(detail);
    return detail;
  }

  private async project(id: string): Promise<BackofficeOrderDetailDto> {
    const order = await this.orders.findById(id);
    if (order === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return projectBackofficeOrderDetail(order, this.clock.now());
  }

  private writeHandoverAudit(
    transaction: Prisma.TransactionClient,
    order: FulfillmentOrderRecord,
    shipment: ShipmentRecord,
    auth: AuthContext,
    request: Request,
    reservationCount: number,
    now: Date,
  ) {
    return this.audit.write(
      transaction,
      { actorUserId: auth.userId, ...requestContext(request) },
      {
        action: 'shipment.handed_over',
        resourceType: 'Shipment',
        resourceId: shipment.id,
        changes: {
          before: { shipmentStatus: shipment.status, fulfillmentStatus: order.fulfillmentStatus },
          after: { shipmentStatus: 'HANDED_TO_CARRIER', fulfillmentStatus: 'IN_TRANSIT' },
        },
        metadata: {
          orderNumber: order.orderNumber,
          shippedAt: now.toISOString(),
          reservationCount,
        },
      },
    );
  }
}

function assertPreparingShippingOrder(order: FulfillmentOrderRecord): void {
  if (
    order.fulfillmentType !== 'SHIPPING' ||
    order.status !== 'PROCESSING' ||
    order.fulfillmentStatus !== 'PREPARING'
  ) {
    throw new ApiError('INVALID_STATE_TRANSITION');
  }
}

function assertVerifiedDeposit(
  order: FulfillmentOrderRecord,
  finance: Awaited<ReturnType<FulfillmentPaymentGateway['lockFinance']>>,
): void {
  const depositRequired = BigInt(order.depositRequired.toString());
  if (depositRequired === 0n && BigInt(order.grandTotal.toString()) === 0n) return;
  const verifiedDeposit = finance.payments.find(
    ({ purpose, method, status }) =>
      purpose === 'DEPOSIT' && method === 'BANK_TRANSFER' && status === 'VERIFIED',
  );
  if (
    verifiedDeposit === undefined ||
    BigInt(verifiedDeposit.receivedAmount ?? '0') < depositRequired
  ) {
    throw new ApiError('INVALID_STATE_TRANSITION');
  }
}

function isExactCreateReplay(
  shipment: ShipmentRecord,
  input: { carrierName: string; trackingCode: string; trackingUrl: string | null },
): boolean {
  return (
    shipment.status === 'CREATED' &&
    shipment.attemptNumber === 1 &&
    shipment.carrierName === input.carrierName &&
    shipment.trackingCode === input.trackingCode &&
    shipment.trackingUrl === input.trackingUrl
  );
}

function isUniqueError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}
