import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import { ApiError } from '../../common/errors/api-error.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import { FulfillmentInventoryGateway } from '../inventory/fulfillment-inventory.gateway.js';
import { OrderNotificationService } from '../notifications/order-notification.service.js';
import { FulfillmentOrderGateway } from '../order-transaction-ports/fulfillment-order.gateway.js';
import { RefundCoreGateway } from '../refunds/refund-core.gateway.js';
import { FulfillmentVoucherGateway } from '../vouchers/fulfillment-voucher.gateway.js';
import { FulfillmentClock } from './fulfillment-clock.service.js';
import { projectBackofficeOrderDetail } from './fulfillment.projector.js';

const EXPIRY_JOB_NAME = 'expirePickupHolds';
const EXPIRY_REASON = 'Quá hạn nhận hàng tại cửa hàng.';
const NOTIFICATION_CONCURRENCY = 10;

export interface PickupExpiryRunResult {
  scanned: number;
  expired: number;
  failed: number;
  skippedOverlap: boolean;
}

@Injectable()
export class PickupExpiryService {
  private readonly logger = new Logger(PickupExpiryService.name);
  private running = false;

  public constructor(
    @Inject(FulfillmentOrderGateway) private readonly orders: FulfillmentOrderGateway,
    @Inject(FulfillmentInventoryGateway)
    private readonly inventory: FulfillmentInventoryGateway,
    @Inject(RefundCoreGateway) private readonly refunds: RefundCoreGateway,
    @Inject(FulfillmentVoucherGateway) private readonly vouchers: FulfillmentVoucherGateway,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(OrderNotificationService) private readonly notifications: OrderNotificationService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(FulfillmentClock) private readonly clock: FulfillmentClock,
  ) {}

  public async expireOrder(
    orderId: string,
    now = this.clock.now(),
    requestId = `job:${EXPIRY_JOB_NAME}:${randomUUID()}`,
  ): Promise<boolean> {
    const expiredOrderId = await this.expireOne(orderId, now, requestId);
    if (expiredOrderId === null) return false;
    const notificationFailed = await this.deliverNotifications([expiredOrderId]);
    if (notificationFailed > 0) {
      this.logger.warn({
        event: 'job.notification_failed',
        job: EXPIRY_JOB_NAME,
        requestId,
        orderId: expiredOrderId,
      });
    }
    return true;
  }

  public async expireDue(now = this.clock.now()): Promise<PickupExpiryRunResult> {
    const runId = randomUUID();
    const requestId = `job:${EXPIRY_JOB_NAME}:${runId}`;
    const startedAt = Date.now();
    if (this.running) {
      this.logger.warn({ event: 'job.skipped_overlap', job: EXPIRY_JOB_NAME, runId, requestId });
      return { scanned: 0, expired: 0, failed: 0, skippedOverlap: true };
    }
    this.running = true;
    this.logger.log({
      event: 'job.started',
      job: EXPIRY_JOB_NAME,
      runId,
      requestId,
      batchSize: this.config.scheduler.batchSize,
    });
    try {
      const candidates = await this.orders.findExpiredPickupCandidates(
        now,
        this.config.scheduler.batchSize,
      );
      const notifications: string[] = [];
      let expired = 0;
      let failed = 0;
      let noop = 0;
      for (const candidate of candidates) {
        try {
          const orderId = await this.expireOne(candidate.id, now, requestId);
          if (orderId === null) {
            noop += 1;
          } else {
            expired += 1;
            notifications.push(orderId);
          }
        } catch (error) {
          failed += 1;
          this.logger.error({
            event: 'job.record_failed',
            job: EXPIRY_JOB_NAME,
            runId,
            requestId,
            orderId: candidate.id,
            orderNumber: candidate.orderNumber,
            errorCategory: error instanceof Error ? error.name : 'UnknownError',
          });
        }
      }
      const notificationFailed = await this.deliverNotifications(notifications);
      this.logger.log({
        event: 'job.completed',
        job: EXPIRY_JOB_NAME,
        runId,
        requestId,
        scanned: candidates.length,
        succeeded: expired,
        noop,
        failed,
        notificationFailed,
        durationMs: Date.now() - startedAt,
      });
      return { scanned: candidates.length, expired, failed, skippedOverlap: false };
    } catch (error) {
      this.logger.error({
        event: 'job.failed',
        job: EXPIRY_JOB_NAME,
        runId,
        requestId,
        durationMs: Date.now() - startedAt,
        errorCategory: error instanceof Error ? error.name : 'UnknownError',
      });
      throw error;
    } finally {
      this.running = false;
    }
  }

  private expireOne(orderId: string, now: Date, requestId: string): Promise<string | null> {
    return this.transactions.run('fulfillment.expire-pickup', async (transaction) => {
      const order = await this.orders.lock(orderId, transaction);
      if (
        order === null ||
        order.fulfillmentType !== 'PICKUP' ||
        order.pickupHoldUntil === null ||
        order.pickupHoldUntil > now ||
        order.status === 'COMPLETED' ||
        order.status === 'CANCELLED' ||
        ['COMPLETED', 'CANCELLED', 'IN_TRANSIT', 'FAILED', 'RETURNED'].includes(
          order.fulfillmentStatus,
        )
      ) {
        return null;
      }
      const refund = await this.refunds.prepareCancellationRefund(
        {
          orderId: order.id,
          reason: EXPIRY_REASON,
          now,
          actor: { requesterType: 'SYSTEM', requesterId: null },
        },
        transaction,
      );
      const reservations = await this.inventory.lockActiveReservations(order.id, transaction);
      this.inventory.assertPickupHold(
        reservations,
        order.id,
        order.items,
        order.fulfillmentLocationId,
        order.pickupHoldUntil,
      );
      await this.inventory.expirePickup(reservations, now, transaction);
      await this.vouchers.release(order.id, now, transaction);
      const cancelled = await transaction.order.updateMany({
        where: {
          id: order.id,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          pickupHoldUntil: { lte: now },
        },
        data: {
          status: 'CANCELLED',
          fulfillmentStatus: 'CANCELLED',
          cancelReason: EXPIRY_REASON,
          cancelledAt: now,
        },
      });
      if (cancelled.count !== 1) {
        throw new ApiError('CONCURRENT_MODIFICATION');
      }
      await this.audit.write(
        transaction,
        { actorType: 'SYSTEM', requestId, ipAddress: 'scheduler' },
        {
          action: 'fulfillment.pickup_expired',
          resourceType: 'Order',
          resourceId: order.id,
          changes: {
            before: { status: order.status, fulfillmentStatus: order.fulfillmentStatus },
            after: {
              status: 'CANCELLED',
              fulfillmentStatus: 'CANCELLED',
              reservationStatus: 'EXPIRED',
            },
          },
          metadata: {
            orderNumber: order.orderNumber,
            reservationCount: reservations.length,
            ...(refund === null ? {} : { refundId: refund.id, refundAmount: refund.amount }),
          },
        },
      );
      return order.id;
    });
  }

  private async deliverNotifications(orderIds: readonly string[]): Promise<number> {
    let failed = 0;
    for (let index = 0; index < orderIds.length; index += NOTIFICATION_CONCURRENCY) {
      const batch = orderIds.slice(index, index + NOTIFICATION_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (orderId) => {
          const order = await this.orders.findById(orderId);
          if (order === null) return;
          await this.notifications.sendCancelled(
            projectBackofficeOrderDetail(order, this.clock.now()),
          );
        }),
      );
      failed += results.filter(({ status }) => status === 'rejected').length;
    }
    return failed;
  }
}
