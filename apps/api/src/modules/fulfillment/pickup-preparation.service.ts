import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { requestContext } from '../../common/http/request-context.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { FulfillmentInventoryGateway } from '../inventory/fulfillment-inventory.gateway.js';
import { OrderNotificationService } from '../notifications/order-notification.service.js';
import {
  FulfillmentOrderGateway,
  type FulfillmentOrderRecord,
} from '../order-transaction-ports/fulfillment-order.gateway.js';
import { CheckoutSettingsReader } from '../settings/checkout-settings.reader.js';
import type { ExtendPickupHoldDto } from './fulfillment.dto.js';
import { FulfillmentClock } from './fulfillment-clock.service.js';
import { projectBackofficeOrderDetail } from './fulfillment.projector.js';
import type { BackofficeOrderDetailDto } from './fulfillment-response.dto.js';
import { assertPickupDeadline, validatePickupHoldExtension } from './pickup-fulfillment.policy.js';

interface CommandOutcome {
  orderId: string;
  changed: boolean;
}

@Injectable()
export class PickupPreparationService {
  public constructor(
    @Inject(FulfillmentOrderGateway) private readonly orders: FulfillmentOrderGateway,
    @Inject(FulfillmentInventoryGateway)
    private readonly inventory: FulfillmentInventoryGateway,
    @Inject(CheckoutSettingsReader) private readonly settings: CheckoutSettingsReader,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(OrderNotificationService) private readonly notifications: OrderNotificationService,
    @Inject(FulfillmentClock) private readonly clock: FulfillmentClock,
  ) {}

  public confirm(
    id: string,
    auth: AuthContext,
    request: Request,
  ): Promise<BackofficeOrderDetailDto> {
    return this.runCommand('fulfillment.confirm-pickup', id, async (order, transaction) => {
      const now = this.clock.now();
      const holdUntil = assertPickupDeadline(order, now);
      const reservations = await this.inventory.lockActiveReservations(order.id, transaction);
      this.inventory.assertPickupHold(reservations, order.items.length, holdUntil);
      if (order.status === 'CONFIRMED' && order.fulfillmentStatus === 'PENDING') return false;
      if (order.status !== 'PLACED' || order.fulfillmentStatus !== 'PENDING') {
        throw new ApiError('INVALID_STATE_TRANSITION');
      }
      const updated = await transaction.order.updateMany({
        where: { id: order.id, status: 'PLACED', fulfillmentStatus: 'PENDING' },
        data: { status: 'CONFIRMED', confirmedAt: now },
      });
      if (updated.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
      await this.writeTransitionAudit(
        transaction,
        auth,
        request,
        order,
        'fulfillment.pickup_confirmed',
        { status: 'CONFIRMED', fulfillmentStatus: 'PENDING' },
      );
      return true;
    });
  }

  public startPreparing(
    id: string,
    auth: AuthContext,
    request: Request,
  ): Promise<BackofficeOrderDetailDto> {
    return this.runCommand('fulfillment.start-preparing', id, async (order, transaction) => {
      const now = this.clock.now();
      const replayed = order.status === 'PROCESSING' && order.fulfillmentStatus === 'PREPARING';
      const transitional =
        order.status === 'CONFIRMED' && ['PENDING', 'PREPARING'].includes(order.fulfillmentStatus);
      if (!replayed && !transitional) throw new ApiError('INVALID_STATE_TRANSITION');
      const reservations = await this.inventory.lockActiveReservations(order.id, transaction);
      if (reservations.length !== order.items.length || reservations.length === 0) {
        throw new ApiError('INVENTORY_NOT_AVAILABLE');
      }
      if (order.fulfillmentType === 'PICKUP') {
        const holdUntil = assertPickupDeadline(order, now);
        this.inventory.assertPickupHold(reservations, order.items.length, holdUntil);
      } else if (
        reservations.some(
          ({ holdReason, expiresAt }) => holdReason !== 'FULFILLMENT' || expiresAt !== null,
        )
      ) {
        throw new ApiError('INVALID_STATE_TRANSITION');
      }
      if (replayed) return false;
      const updated = await transaction.order.updateMany({
        where: {
          id: order.id,
          status: 'CONFIRMED',
          fulfillmentStatus: { in: ['PENDING', 'PREPARING'] },
        },
        data: { status: 'PROCESSING', fulfillmentStatus: 'PREPARING' },
      });
      if (updated.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
      await this.writeTransitionAudit(
        transaction,
        auth,
        request,
        order,
        'fulfillment.preparation_started',
        { status: 'PROCESSING', fulfillmentStatus: 'PREPARING' },
      );
      return true;
    });
  }

  public async markPickupReady(
    id: string,
    auth: AuthContext,
    request: Request,
  ): Promise<BackofficeOrderDetailDto> {
    const outcome = await this.execute('fulfillment.mark-pickup-ready', id, async (order, tx) => {
      const now = this.clock.now();
      const holdUntil = assertPickupDeadline(order, now);
      const reservations = await this.inventory.lockActiveReservations(order.id, tx);
      this.inventory.assertPickupHold(reservations, order.items.length, holdUntil);
      if (order.status === 'PROCESSING' && order.fulfillmentStatus === 'READY') return false;
      if (order.status !== 'PROCESSING' || order.fulfillmentStatus !== 'PREPARING') {
        throw new ApiError('INVALID_STATE_TRANSITION');
      }
      const updated = await tx.order.updateMany({
        where: { id: order.id, status: 'PROCESSING', fulfillmentStatus: 'PREPARING' },
        data: { fulfillmentStatus: 'READY', pickupReadyAt: now },
      });
      if (updated.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
      await this.writeTransitionAudit(tx, auth, request, order, 'fulfillment.pickup_ready', {
        status: 'PROCESSING',
        fulfillmentStatus: 'READY',
      });
      return true;
    });
    const detail = await this.project(outcome.orderId);
    if (outcome.changed) {
      const settings = await this.settings.read();
      await this.notifications.sendPickupReady({
        id: detail.id,
        orderNumber: detail.orderNumber,
        contact: detail.contact,
        location: detail.location,
        pickupHoldUntil: detail.pickupHoldUntil,
        storeAddress: settings.storeAddress,
      });
    }
    return detail;
  }

  public extendPickupHold(
    id: string,
    input: ExtendPickupHoldDto,
    auth: AuthContext,
    request: Request,
  ): Promise<BackofficeOrderDetailDto> {
    const requested = new Date(input.holdUntil);
    return this.runCommand('fulfillment.extend-pickup-hold', id, async (order, transaction) => {
      const now = this.clock.now();
      const validation = validatePickupHoldExtension(order, requested, now);
      const reservations = await this.inventory.lockActiveReservations(order.id, transaction);
      this.inventory.assertPickupHold(reservations, order.items.length, validation.current);
      if (validation.replayed) return false;
      const updated = await transaction.order.updateMany({
        where: { id: order.id, pickupHoldUntil: validation.current },
        data: { pickupHoldUntil: requested },
      });
      if (updated.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
      await this.inventory.extendPickupHold(order.id, requested, reservations.length, transaction);
      await this.audit.write(
        transaction,
        { actorUserId: auth.userId, ...requestContext(request) },
        {
          action: 'fulfillment.pickup_hold_extended',
          resourceType: 'Order',
          resourceId: order.id,
          changes: {
            before: { pickupHoldUntil: validation.current.toISOString() },
            after: { pickupHoldUntil: requested.toISOString() },
          },
          metadata: { orderNumber: order.orderNumber, reason: input.reason.trim() },
        },
      );
      return true;
    });
  }

  private async runCommand(
    operation: string,
    id: string,
    work: (
      order: FulfillmentOrderRecord,
      transaction: Prisma.TransactionClient,
    ) => Promise<boolean>,
  ): Promise<BackofficeOrderDetailDto> {
    const outcome = await this.execute(operation, id, work);
    return this.project(outcome.orderId);
  }

  private execute(
    operation: string,
    id: string,
    work: (
      order: FulfillmentOrderRecord,
      transaction: Prisma.TransactionClient,
    ) => Promise<boolean>,
  ): Promise<CommandOutcome> {
    return this.transactions.run(operation, async (transaction) => {
      const order = await this.orders.lock(id, transaction);
      if (order === null) throw new ApiError('RESOURCE_NOT_FOUND');
      return { orderId: order.id, changed: await work(order, transaction) };
    });
  }

  private async project(id: string): Promise<BackofficeOrderDetailDto> {
    const order = await this.orders.findById(id);
    if (order === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return projectBackofficeOrderDetail(order, this.clock.now());
  }

  private writeTransitionAudit(
    transaction: Prisma.TransactionClient,
    auth: AuthContext,
    request: Request,
    order: FulfillmentOrderRecord,
    action: string,
    after: { status: string; fulfillmentStatus: string },
  ) {
    return this.audit.write(
      transaction,
      { actorUserId: auth.userId, ...requestContext(request) },
      {
        action,
        resourceType: 'Order',
        resourceId: order.id,
        changes: {
          before: { status: order.status, fulfillmentStatus: order.fulfillmentStatus },
          after,
        },
        metadata: { orderNumber: order.orderNumber },
      },
    );
  }
}
