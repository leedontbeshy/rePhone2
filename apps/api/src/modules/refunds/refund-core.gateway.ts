import { AffiliateLedgerService } from '../affiliate-core/affiliate-ledger.service.js';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  RefundPaymentGateway,
  type LockedRefundPayment,
} from '../payments/refund-payment.gateway.js';

export type { LockedRefundPayment } from '../payments/refund-payment.gateway.js';

export interface LockedRefundRecord {
  id: string;
  paymentId: string | null;
  amount: string;
  method: 'BANK_TRANSFER' | 'CASH' | 'OTHER';
  status: 'REQUESTED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
}

export interface LockedRefundFinance {
  payments: LockedRefundPayment[];
  refunds: LockedRefundRecord[];
}

export interface RefundObligationActor {
  requesterType: 'CUSTOMER' | 'STAFF' | 'SYSTEM';
  requesterId: string | null;
}

@Injectable()
export class RefundCoreGateway {
  public constructor(
    @Inject(RefundPaymentGateway)
    private readonly payments: RefundPaymentGateway,
    @Optional()
    @Inject(AffiliateLedgerService)
    private readonly affiliates?: AffiliateLedgerService,
  ) {}

  public async lockFinance(
    orderId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<LockedRefundFinance> {
    const payments = await this.payments.lockForRefund(orderId, transaction);
    const refundIds = await transaction.refund.findMany({
      where: { orderId },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    for (const { id } of refundIds) {
      await transaction.$queryRaw`SELECT id FROM refunds WHERE id = ${id}::uuid FOR UPDATE`;
    }

    const refunds = await transaction.refund.findMany({
      where: { orderId },
      select: { id: true, paymentId: true, amount: true, method: true, status: true },
      orderBy: { id: 'asc' },
    });

    return {
      payments,
      refunds: refunds.map((refund) => ({ ...refund, amount: refund.amount.toString() })),
    };
  }

  public verifiedTotal(finance: LockedRefundFinance): bigint {
    return finance.payments
      .filter(({ status }) => status === 'VERIFIED')
      .reduce((sum, payment) => {
        if (payment.receivedAmount === null) throw new ApiError('INTERNAL_ERROR');
        return sum + BigInt(payment.receivedAmount);
      }, 0n);
  }

  public coveredTotal(finance: LockedRefundFinance): bigint {
    return finance.refunds
      .filter(({ status }) => ['REQUESTED', 'PROCESSING', 'COMPLETED'].includes(status))
      .reduce((sum, refund) => sum + BigInt(refund.amount), 0n);
  }

  public completedTotal(finance: LockedRefundFinance, completingRefundId?: string): bigint {
    return finance.refunds.reduce(
      (sum, refund) =>
        refund.status === 'COMPLETED' || refund.id === completingRefundId
          ? sum + BigInt(refund.amount)
          : sum,
      0n,
    );
  }

  public availableTotal(finance: LockedRefundFinance): bigint {
    const available = this.verifiedTotal(finance) - this.coveredTotal(finance);
    if (available < 0n) throw new ApiError('INTERNAL_ERROR');
    return available;
  }

  public availableForPayment(finance: LockedRefundFinance, paymentId: string): bigint {
    const payment = finance.payments.find(({ id }) => id === paymentId);
    if (payment?.status !== 'VERIFIED' || payment.receivedAmount === null) {
      throw new ApiError('VALIDATION_FAILED', undefined, [
        {
          field: 'paymentId',
          code: 'PAYMENT_NOT_REFUNDABLE',
          message: 'Payment phải thuộc đơn và đã được xác minh.',
        },
      ]);
    }
    const covered = finance.refunds
      .filter(
        (refund) =>
          refund.paymentId === paymentId &&
          ['REQUESTED', 'PROCESSING', 'COMPLETED'].includes(refund.status),
      )
      .reduce((sum, refund) => sum + BigInt(refund.amount), 0n);
    const available = BigInt(payment.receivedAmount) - covered;
    if (available < 0n) throw new ApiError('INTERNAL_ERROR');
    return available;
  }

  public async prepareCancellationRefund(
    input: {
      orderId: string;
      reason: string;
      now: Date;
      actor: RefundObligationActor;
    },
    transaction: Prisma.TransactionClient,
  ): Promise<{ id: string; amount: string } | null> {
    const finance = await this.lockFinance(input.orderId, transaction);
    if (finance.payments.some(({ status }) => status === 'UNDER_REVIEW')) {
      throw new ApiError('INVALID_STATE_TRANSITION');
    }
    const refundable = this.availableTotal(finance);
    await this.payments.cancelAwaitingProof(input.orderId, transaction);
    if (refundable === 0n) return null;

    const verified = finance.payments.filter(({ status }) => status === 'VERIFIED');
    const allocations = await this.affiliates?.cancellationAllocations(
      transaction,
      input.orderId,
      refundable,
    );
    const refund = await transaction.refund.create({
      data: {
        ...(allocations
          ? { affiliateAllocations: allocations as unknown as Prisma.InputJsonArray }
          : {}),
        orderId: input.orderId,
        paymentId: verified.length === 1 ? (verified[0]?.id ?? null) : null,
        amount: refundable.toString(),
        method: 'BANK_TRANSFER',
        status: 'REQUESTED',
        reason: input.reason,
        requestedByType: input.actor.requesterType,
        requestedById: input.actor.requesterId,
        createdAt: input.now,
      },
    });
    return { id: refund.id, amount: refund.amount.toString() };
  }
}
