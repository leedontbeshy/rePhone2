import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import type { Prisma } from '../../generated/prisma/client.js';

export interface LockedRefundPayment {
  id: string;
  method: 'BANK_TRANSFER' | 'CASH' | 'COD' | 'OTHER';
  status: 'AWAITING_PROOF' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
  expectedAmount: string;
  receivedAmount: string | null;
}

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
  public async lockFinance(
    orderId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<LockedRefundFinance> {
    const paymentIds = await transaction.payment.findMany({
      where: { orderId },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    for (const { id } of paymentIds) {
      await transaction.$queryRaw`SELECT id FROM payments WHERE id = ${id}::uuid FOR UPDATE`;
    }

    const refundIds = await transaction.refund.findMany({
      where: { orderId },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    for (const { id } of refundIds) {
      await transaction.$queryRaw`SELECT id FROM refunds WHERE id = ${id}::uuid FOR UPDATE`;
    }

    const payments = await transaction.payment.findMany({
      where: { orderId },
      select: {
        id: true,
        method: true,
        status: true,
        expectedAmount: true,
        receivedAmount: true,
      },
      orderBy: { id: 'asc' },
    });
    const refunds = await transaction.refund.findMany({
      where: { orderId },
      select: { id: true, paymentId: true, amount: true, method: true, status: true },
      orderBy: { id: 'asc' },
    });

    return {
      payments: payments.map((payment) => ({
        ...payment,
        expectedAmount: payment.expectedAmount.toString(),
        receivedAmount: payment.receivedAmount?.toString() ?? null,
      })),
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
    await transaction.payment.updateMany({
      where: { orderId: input.orderId, status: 'AWAITING_PROOF' },
      data: { status: 'CANCELLED' },
    });
    if (refundable === 0n) return null;

    const verified = finance.payments.filter(({ status }) => status === 'VERIFIED');
    const refund = await transaction.refund.create({
      data: {
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
