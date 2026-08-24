import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { projectOrderFinance, type OrderFinanceProjection } from './payment-finance.policy.js';

export interface LockedOrderFinance {
  payments: Array<{
    id: string;
    purpose: 'DEPOSIT' | 'BALANCE' | 'FULL_PAYMENT';
    method: 'BANK_TRANSFER' | 'CASH' | 'COD' | 'OTHER';
    status: 'AWAITING_PROOF' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
    expectedAmount: string;
    receivedAmount: string | null;
  }>;
  refunds: Array<{
    id: string;
    paymentId: string | null;
    status: 'REQUESTED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
    amount: string;
  }>;
}

@Injectable()
export class FulfillmentPaymentGateway {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async lockFinance(
    orderId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<LockedOrderFinance> {
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
        purpose: true,
        method: true,
        status: true,
        expectedAmount: true,
        receivedAmount: true,
      },
      orderBy: { id: 'asc' },
    });
    const refunds = await transaction.refund.findMany({
      where: { orderId },
      select: { id: true, paymentId: true, status: true, amount: true },
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

  public project(grandTotal: bigint, finance: LockedOrderFinance): OrderFinanceProjection {
    return projectOrderFinance(
      grandTotal,
      finance.payments.flatMap((payment) =>
        payment.status === 'VERIFIED'
          ? [BigInt(payment.receivedAmount ?? payment.expectedAmount)]
          : [],
      ),
      finance.refunds.flatMap((refund) =>
        refund.status === 'COMPLETED' ? [BigInt(refund.amount)] : [],
      ),
    );
  }

  public async createVerifiedCash(
    orderId: string,
    amount: bigint,
    staffUserId: string,
    now: Date,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    if (amount <= 0n) throw new ApiError('VALIDATION_FAILED');
    await transaction.payment.create({
      data: {
        orderId,
        purpose: 'FULL_PAYMENT',
        method: 'CASH',
        expectedAmount: amount.toString(),
        receivedAmount: amount.toString(),
        status: 'VERIFIED',
        reviewedById: staffUserId,
        reviewedAt: now,
      },
    });
  }

  public async updateAwaitingDeposit(
    orderId: string,
    paymentId: string,
    expectedAmount: bigint,
    cancel: boolean,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    if (expectedAmount < 0n || (expectedAmount === 0n && !cancel)) {
      throw new ApiError('VALIDATION_FAILED');
    }
    const updated = await transaction.payment.updateMany({
      where: {
        id: paymentId,
        orderId,
        purpose: 'DEPOSIT',
        method: 'BANK_TRANSFER',
        status: 'AWAITING_PROOF',
        evidenceBucket: null,
        evidenceObjectPath: null,
        submittedAt: null,
        reviewedAt: null,
      },
      data: {
        expectedAmount: expectedAmount.toString(),
        ...(cancel ? { status: 'CANCELLED' as const } : {}),
      },
    });
    if (updated.count !== 1) throw new ApiError('INVALID_STATE_TRANSITION');
  }

  public async createVerifiedCod(
    orderId: string,
    amount: bigint,
    staffUserId: string,
    now: Date,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    if (amount <= 0n) throw new ApiError('VALIDATION_FAILED');
    await transaction.payment.create({
      data: {
        orderId,
        purpose: 'BALANCE',
        method: 'COD',
        expectedAmount: amount.toString(),
        receivedAmount: amount.toString(),
        status: 'VERIFIED',
        reviewedById: staffUserId,
        reviewedAt: now,
      },
    });
  }

}
