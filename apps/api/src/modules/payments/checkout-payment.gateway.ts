import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import type { Prisma } from '../../generated/prisma/client.js';

export interface CreateDepositPaymentInput {
  orderId: string;
  expectedAmount: string;
  transferContent: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  bankQrBucket: string | null;
  bankQrObjectPath: string | null;
  reviewWindowMinutes: number;
  expiresAt: Date;
}

export interface CheckoutCancellationFinanceResult {
  refund: { id: string; amount: string } | null;
}

@Injectable()
export class CheckoutPaymentGateway {
  public createDeposit(input: CreateDepositPaymentInput, transaction: Prisma.TransactionClient) {
    return transaction.payment.create({
      data: {
        orderId: input.orderId,
        purpose: 'DEPOSIT',
        method: 'BANK_TRANSFER',
        expectedAmount: input.expectedAmount,
        status: 'AWAITING_PROOF',
        transferContent: input.transferContent,
        bankNameSnapshot: input.bankName,
        bankAccountNumberSnapshot: input.bankAccountNumber,
        bankAccountHolderSnapshot: input.bankAccountHolder,
        bankQrBucketSnapshot: input.bankQrBucket,
        bankQrObjectPathSnapshot: input.bankQrObjectPath,
        reviewWindowMinutesSnapshot: input.reviewWindowMinutes,
        expiresAt: input.expiresAt,
      },
    });
  }

  public async cancelAndPrepareRefund(
    orderId: string,
    customerId: string | null,
    reason: string,
    now: Date,
    transaction: Prisma.TransactionClient,
  ): Promise<CheckoutCancellationFinanceResult> {
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
    for (const payment of payments) {
      await transaction.$queryRaw`SELECT id FROM payments WHERE id = ${payment.id}::uuid FOR UPDATE`;
    }
    if (payments.some(({ status }) => status === 'UNDER_REVIEW')) {
      throw new ApiError('INVALID_STATE_TRANSITION');
    }
    await transaction.payment.updateMany({
      where: { orderId, status: 'AWAITING_PROOF' },
      data: { status: 'CANCELLED' },
    });

    const verified = payments.filter(({ status }) => status === 'VERIFIED');
    const verifiedTotal = verified.reduce(
      (sum, payment) => sum + BigInt((payment.receivedAmount ?? payment.expectedAmount).toString()),
      0n,
    );
    const existingRefunds = await transaction.refund.findMany({
      where: { orderId, status: { in: ['REQUESTED', 'PROCESSING', 'COMPLETED'] } },
      select: { amount: true },
    });
    const covered = existingRefunds.reduce(
      (sum, refund) => sum + BigInt(refund.amount.toString()),
      0n,
    );
    const refundable = verifiedTotal - covered;
    if (refundable <= 0n) return { refund: null };
    const method =
      verified.length === 1 && verified[0]?.method === 'BANK_TRANSFER'
        ? 'BANK_TRANSFER'
        : verified.length === 1 && verified[0]?.method === 'CASH'
          ? 'CASH'
          : 'OTHER';
    const refund = await transaction.refund.create({
      data: {
        orderId,
        paymentId: verified.length === 1 ? (verified[0]?.id ?? null) : null,
        amount: refundable.toString(),
        method,
        status: 'REQUESTED',
        reason,
        requestedByType: 'CUSTOMER',
        requestedById: customerId,
        createdAt: now,
      },
    });
    return { refund: { id: refund.id, amount: refund.amount.toString() } };
  }
}
