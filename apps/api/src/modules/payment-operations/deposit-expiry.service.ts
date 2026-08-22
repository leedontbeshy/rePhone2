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
    if (this.running) return { scanned: 0, expired: 0, failed: 0, skippedOverlap: true };
    this.running = true;
    try {
      const candidates = await this.payments.findExpiredDepositCandidates(
        now,
        this.config.scheduler.batchSize,
      );
      let expired = 0;
      let failed = 0;
      for (const candidate of candidates) {
        try {
          const outcome = await this.expireOne(candidate.id, now);
          if (outcome !== null) {
            expired += 1;
            await this.notifications.sendExpired(notificationContext(outcome));
          }
        } catch (error) {
          failed += 1;
          this.logger.error({
            event: 'payment.deposit_expiry.failed',
            paymentId: candidate.id,
            orderId: candidate.orderId,
            errorCategory: error instanceof Error ? error.name : 'UnknownError',
          });
        }
      }
      return {
        scanned: candidates.length,
        expired,
        failed,
        skippedOverlap: false,
      };
    } finally {
      this.running = false;
    }
  }

  private expireOne(paymentId: string, now: Date): Promise<PaymentOperationsRecord | null> {
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
          requestId: `scheduler:expire-deposits:${now.toISOString()}`,
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
}

function notificationContext(payment: PaymentOperationsRecord) {
  return {
    paymentId: payment.id,
    orderNumber: payment.order.orderNumber,
    customerEmail: payment.order.customerEmail,
    expectedAmount: payment.expectedAmount.toString(),
  };
}
