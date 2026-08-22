import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { requestContext } from '../../common/http/request-context.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { CheckoutInventoryGateway } from '../inventory/checkout-inventory.gateway.js';
import { PaymentLifecycleNotificationService } from '../notifications/payment-lifecycle-notification.service.js';
import { CheckoutVoucherGateway } from '../vouchers/checkout-voucher.gateway.js';
import type { RejectPaymentDto, VerifyPaymentDto } from './payment-operation.dto.js';
import { projectPaymentPublic, projectReviewOrder } from './payment-operation.projector.js';
import type { PaymentReviewResultDto } from './payment-operation-response.dto.js';
import {
  PaymentOperationsRepository,
  type PaymentOperationsRecord,
} from './payment-operations.repository.js';
import { PaymentClock } from './payment-clock.service.js';
import {
  deriveOrderPaymentStatus,
  normalizeOptionalText,
  validateVerificationAmounts,
} from './payment-review-policy.js';

interface ReviewOutcome {
  payment: PaymentOperationsRecord;
  replayed: boolean;
  action: 'VERIFIED' | 'REJECTED';
}

@Injectable()
export class PaymentReviewCommandService {
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

  public async verify(
    id: string,
    input: VerifyPaymentDto,
    auth: AuthContext,
    request: Request,
  ): Promise<PaymentReviewResultDto> {
    const outcome = await this.transactions.run('payments.verify', async (transaction) => {
      const payment = await this.requireLocked(id, transaction);
      const normalizedNote = normalizeOptionalText(input.note);
      const receivedAmount = BigInt(input.receivedAmount);
      const replayed = this.isVerifyReplay(payment, auth.userId, receivedAmount, normalizedNote);
      if (replayed) return { payment, replayed: true, action: 'VERIFIED' } satisfies ReviewOutcome;
      this.assertReviewable(payment);
      const amounts = validateVerificationAmounts({
        receivedAmount: input.receivedAmount,
        requiredAmount: payment.order.depositRequired.toString(),
        expectedAmount: payment.expectedAmount.toString(),
        ...(input.note === undefined ? {} : { note: input.note }),
      });
      const now = this.clock.now();
      await this.payments.lockActiveReservations(payment.order.id, transaction);
      const reviewed = await transaction.payment.updateMany({
        where: { id: payment.id, status: 'UNDER_REVIEW' },
        data: {
          status: 'VERIFIED',
          receivedAmount: amounts.receivedAmount.toString(),
          reviewedById: auth.userId,
          reviewedAt: now,
          note: amounts.note,
          rejectionReason: null,
        },
      });
      if (reviewed.count !== 1) throw new ApiError('PAYMENT_ALREADY_REVIEWED');
      await this.inventory.transitionOrderReservationReason(
        payment.order.id,
        'REVIEW',
        'FULFILLMENT',
        null,
        transaction,
      );
      await this.updateOrderFinance(payment.order.id, now, transaction, true);
      await this.audit.write(
        transaction,
        { actorUserId: auth.userId, ...requestContext(request) },
        {
          action: 'payment.verified',
          resourceType: 'Payment',
          resourceId: payment.id,
          changes: {
            before: { paymentStatus: payment.status, orderStatus: payment.order.status },
            after: { paymentStatus: 'VERIFIED', orderStatus: 'CONFIRMED' },
          },
          metadata: {
            orderNumber: payment.order.orderNumber,
            expectedAmount: payment.expectedAmount.toString(),
            receivedAmount: amounts.receivedAmount.toString(),
          },
        },
      );
      const updated = await this.payments.findById(payment.id, transaction);
      if (updated === null) throw new ApiError('INTERNAL_ERROR');
      return { payment: updated, replayed: false, action: 'VERIFIED' } satisfies ReviewOutcome;
    });
    const notificationDelivery = outcome.replayed
      ? 'SKIPPED_REPLAY'
      : await this.notifications.sendVerified(notificationContext(outcome.payment));
    return this.toResult(outcome.payment, notificationDelivery);
  }

  public async reject(
    id: string,
    input: RejectPaymentDto,
    auth: AuthContext,
    request: Request,
  ): Promise<PaymentReviewResultDto> {
    const reason = input.reason.trim();
    const outcome = await this.transactions.run('payments.reject', async (transaction) => {
      const payment = await this.requireLocked(id, transaction);
      const replayed = this.isRejectReplay(payment, auth.userId, reason);
      if (replayed) return { payment, replayed: true, action: 'REJECTED' } satisfies ReviewOutcome;
      this.assertReviewable(payment);
      const now = this.clock.now();
      await this.payments.lockActiveReservations(payment.order.id, transaction);
      const reviewed = await transaction.payment.updateMany({
        where: { id: payment.id, status: 'UNDER_REVIEW' },
        data: {
          status: 'REJECTED',
          reviewedById: auth.userId,
          reviewedAt: now,
          rejectionReason: reason,
          note: null,
          receivedAmount: null,
        },
      });
      if (reviewed.count !== 1) throw new ApiError('PAYMENT_ALREADY_REVIEWED');
      const cancelled = await transaction.order.updateMany({
        where: {
          id: payment.order.id,
          status: { notIn: ['CANCELLED', 'COMPLETED'] },
        },
        data: {
          status: 'CANCELLED',
          fulfillmentStatus: 'CANCELLED',
          cancelReason: reason,
          cancelledAt: now,
        },
      });
      if (cancelled.count !== 1) throw new ApiError('INVALID_STATE_TRANSITION');
      await this.inventory.releaseOrderReservations(payment.order.id, now, transaction);
      await this.vouchers.release(payment.order.id, now, transaction);
      await this.audit.write(
        transaction,
        { actorUserId: auth.userId, ...requestContext(request) },
        {
          action: 'payment.rejected',
          resourceType: 'Payment',
          resourceId: payment.id,
          changes: {
            before: {
              paymentStatus: payment.status,
              orderStatus: payment.order.status,
              fulfillmentStatus: payment.order.fulfillmentStatus,
            },
            after: {
              paymentStatus: 'REJECTED',
              orderStatus: 'CANCELLED',
              fulfillmentStatus: 'CANCELLED',
            },
          },
          metadata: { orderNumber: payment.order.orderNumber, reason },
        },
      );
      const updated = await this.payments.findById(payment.id, transaction);
      if (updated === null) throw new ApiError('INTERNAL_ERROR');
      return { payment: updated, replayed: false, action: 'REJECTED' } satisfies ReviewOutcome;
    });
    const notificationDelivery = outcome.replayed
      ? 'SKIPPED_REPLAY'
      : await this.notifications.sendRejected(notificationContext(outcome.payment));
    return this.toResult(outcome.payment, notificationDelivery);
  }

  private async requireLocked(
    id: string,
    transaction: Prisma.TransactionClient,
  ): Promise<PaymentOperationsRecord> {
    const payment = await this.payments.lockPaymentRoot(id, transaction);
    if (payment === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return payment;
  }

  private assertReviewable(payment: PaymentOperationsRecord): void {
    if (payment.status !== 'UNDER_REVIEW') throw new ApiError('PAYMENT_ALREADY_REVIEWED');
    if (
      payment.purpose !== 'DEPOSIT' ||
      payment.method !== 'BANK_TRANSFER' ||
      payment.evidenceBucket === null ||
      payment.evidenceObjectPath === null ||
      payment.submittedAt === null ||
      payment.order.status !== 'PLACED' ||
      payment.order.fulfillmentStatus !== 'PENDING'
    ) {
      throw new ApiError('INVALID_STATE_TRANSITION');
    }
  }

  private isVerifyReplay(
    payment: PaymentOperationsRecord,
    actorUserId: string,
    receivedAmount: bigint,
    note: string | null,
  ): boolean {
    if (payment.status !== 'VERIFIED') return false;
    if (
      payment.reviewedById === actorUserId &&
      payment.receivedAmount !== null &&
      BigInt(payment.receivedAmount.toString()) === receivedAmount &&
      normalizeOptionalText(payment.note) === note
    ) {
      return true;
    }
    throw new ApiError('PAYMENT_ALREADY_REVIEWED');
  }

  private isRejectReplay(
    payment: PaymentOperationsRecord,
    actorUserId: string,
    reason: string,
  ): boolean {
    if (payment.status !== 'REJECTED') return false;
    if (payment.reviewedById === actorUserId && payment.rejectionReason?.trim() === reason) {
      return true;
    }
    throw new ApiError('PAYMENT_ALREADY_REVIEWED');
  }

  private async updateOrderFinance(
    orderId: string,
    now: Date,
    transaction: Prisma.TransactionClient,
    confirm: boolean,
  ): Promise<void> {
    const order = await transaction.order.findUnique({
      where: { id: orderId },
      select: { grandTotal: true, status: true },
    });
    if (order === null) throw new ApiError('INTERNAL_ERROR');
    if (confirm && order.status !== 'PLACED') throw new ApiError('INVALID_STATE_TRANSITION');
    const [verifiedPayments, completedRefunds] = await Promise.all([
      transaction.payment.findMany({
        where: { orderId, status: 'VERIFIED' },
        select: { receivedAmount: true },
      }),
      transaction.refund.findMany({
        where: { orderId, status: 'COMPLETED' },
        select: { amount: true },
      }),
    ]);
    const paidAmount = verifiedPayments.reduce(
      (sum, payment) => sum + BigInt(payment.receivedAmount?.toString() ?? '0'),
      0n,
    );
    const refundedAmount = completedRefunds.reduce(
      (sum, refund) => sum + BigInt(refund.amount.toString()),
      0n,
    );
    const grandTotal = BigInt(order.grandTotal.toString());
    const balanceDue = grandTotal > paidAmount ? grandTotal - paidAmount : 0n;
    await transaction.order.update({
      where: { id: orderId },
      data: {
        paidAmount: paidAmount.toString(),
        refundedAmount: refundedAmount.toString(),
        balanceDue: balanceDue.toString(),
        paymentStatus: deriveOrderPaymentStatus(paidAmount, refundedAmount, grandTotal),
        ...(confirm ? { status: 'CONFIRMED' as const, confirmedAt: now } : {}),
      },
    });
  }

  private toResult(
    payment: PaymentOperationsRecord,
    notificationDelivery: PaymentReviewResultDto['notificationDelivery'],
  ): PaymentReviewResultDto {
    return {
      payment: projectPaymentPublic(payment, this.config, this.clock.now()),
      order: projectReviewOrder(payment),
      notificationDelivery,
    };
  }
}

function notificationContext(payment: PaymentOperationsRecord) {
  return {
    paymentId: payment.id,
    orderNumber: payment.order.orderNumber,
    customerEmail: payment.order.customerEmail,
    expectedAmount: payment.expectedAmount.toString(),
    ...(payment.receivedAmount === null
      ? {}
      : { receivedAmount: payment.receivedAmount.toString() }),
    ...(payment.rejectionReason === null ? {} : { rejectionReason: payment.rejectionReason }),
  };
}
