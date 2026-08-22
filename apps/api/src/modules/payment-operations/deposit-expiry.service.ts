import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import { CheckoutInventoryGateway } from '../inventory/checkout-inventory.gateway.js';
import { PaymentLifecycleNotificationService } from '../notifications/payment-lifecycle-notification.service.js';
import { CheckoutVoucherGateway } from '../vouchers/checkout-voucher.gateway.js';
import { PaymentClock } from './payment-clock.service.js';
import {
  PaymentOperationsRepository,
  type PaymentOperationsRecord,
} from './payment-operations.repository.js';

const EXPIRY_REASON = 'Quá hạn nộp bằng chứng thanh toán cọc.';
const EXPIRY_JOB_NAME = 'expireDepositProofs';
const NOTIFICATION_CONCURRENCY = 10;

export interface DepositExpiryRunResult {
  scanned: number;
  expired: number;
  failed: number;
  skippedOverlap: boolean;
}

@Injectable()
export class DepositExpiryService {
  private readonly logger = new Logger(DepositExpiryService.name);
  private running = false;

  public constructor(
    @Inject(PaymentOperationsRepository)
    private readonly payments: PaymentOperationsRepository,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(CheckoutInventoryGateway)
    private readonly inventory: CheckoutInventoryGateway,
    @Inject(CheckoutVoucherGateway)
    private readonly vouchers: CheckoutVoucherGateway,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(PaymentLifecycleNotificationService)
    private readonly notifications: PaymentLifecycleNotificationService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PaymentClock) private readonly clock: PaymentClock,
  ) {}

  public async expireDue(now = this.clock.now()): Promise<DepositExpiryRunResult> {
    const runId = randomUUID();
    const requestId = `job:${EXPIRY_JOB_NAME}:${runId}`;
    const startedAt = Date.now();
    if (this.running) {
      this.logger.warn({
        event: 'job.skipped_overlap',
        job: EXPIRY_JOB_NAME,
        runId,
        requestId,
      });
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
      const candidates = await this.payments.findExpiredDepositCandidates(
        now,
        this.config.scheduler.batchSize,
      );
      let expired = 0;
      let failed = 0;
      let noop = 0;
      const pendingNotifications: PaymentNotificationContext[] = [];
      for (const candidate of candidates) {
        try {
          const outcome = await this.expireOne(candidate.id, now, requestId);
          if (outcome !== null) {
            expired += 1;
            pendingNotifications.push(notificationContext(outcome));
          } else {
            noop += 1;
          }
        } catch (error) {
          failed += 1;
          this.logger.error({
            event: 'job.record_failed',
            job: EXPIRY_JOB_NAME,
            runId,
            requestId,
            paymentId: candidate.id,
            orderId: candidate.orderId,
            errorCategory: error instanceof Error ? error.name : 'UnknownError',
          });
        }
      }

      const notificationFailed = await this.deliverNotifications(pendingNotifications);
      const result = {
        scanned: candidates.length,
        expired,
        failed,
        skippedOverlap: false,
      };
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
      return result;
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

  private expireOne(
    paymentId: string,
    now: Date,
    requestId: string,
  ): Promise<PaymentOperationsRecord | null> {
    return this.transactions.run('payments.expire-deposit', async (transaction) => {
      const payment = await this.payments.lockPaymentRoot(paymentId, transaction);
      if (payment === null) return null;
      if (
        payment.status !== 'AWAITING_PROOF' ||
        payment.purpose !== 'DEPOSIT' ||
        payment.method !== 'BANK_TRANSFER' ||
        payment.expiresAt === null ||
        payment.expiresAt > now
      ) {
        return null;
      }
      if (payment.order.status !== 'PLACED' || payment.order.fulfillmentStatus !== 'PENDING') {
        throw new ApiError('INVALID_STATE_TRANSITION');
      }
      await this.payments.lockActiveReservations(payment.order.id, transaction);
      const expired = await transaction.payment.updateMany({
        where: {
          id: payment.id,
          status: 'AWAITING_PROOF',
          expiresAt: { lte: now },
        },
        data: { status: 'EXPIRED' },
      });
      if (expired.count !== 1) return null;
      const cancelled = await transaction.order.updateMany({
        where: { id: payment.order.id, status: 'PLACED' },
        data: {
          status: 'CANCELLED',
          fulfillmentStatus: 'CANCELLED',
          cancelReason: EXPIRY_REASON,
          cancelledAt: now,
        },
      });
      if (cancelled.count !== 1) throw new ApiError('INVALID_STATE_TRANSITION');
      await this.inventory.releaseOrderReservations(payment.order.id, now, transaction, 'EXPIRED');
      await this.vouchers.release(payment.order.id, now, transaction);
      await this.audit.write(
        transaction,
        {
          actorType: 'SYSTEM',
          requestId,
          ipAddress: 'scheduler',
        },
        {
          action: 'payment.expired',
          resourceType: 'Payment',
          resourceId: payment.id,
          changes: {
            before: {
              paymentStatus: payment.status,
              orderStatus: payment.order.status,
              reservationReason: 'DEPOSIT',
            },
            after: {
              paymentStatus: 'EXPIRED',
              orderStatus: 'CANCELLED',
              reservationStatus: 'EXPIRED',
            },
          },
          metadata: { orderNumber: payment.order.orderNumber },
        },
      );
      const updated = await this.payments.findById(payment.id, transaction);
      if (updated === null) throw new ApiError('INTERNAL_ERROR');
      return updated;
    });
  }

  private async deliverNotifications(contexts: PaymentNotificationContext[]): Promise<number> {
    let failed = 0;
    for (let index = 0; index < contexts.length; index += NOTIFICATION_CONCURRENCY) {
      const batch = contexts.slice(index, index + NOTIFICATION_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((context) =>
          Promise.resolve().then(() => this.notifications.sendExpired(context)),
        ),
      );
      failed += results.filter(
        (result) => result.status === 'rejected' || result.value === 'FAILED',
      ).length;
    }
    return failed;
  }
}

type PaymentNotificationContext = Parameters<PaymentLifecycleNotificationService['sendExpired']>[0];

function notificationContext(payment: PaymentOperationsRecord): PaymentNotificationContext {
  return {
    paymentId: payment.id,
    orderNumber: payment.order.orderNumber,
    customerEmail: payment.order.customerEmail,
    expectedAmount: payment.expectedAmount.toString(),
  };
}
