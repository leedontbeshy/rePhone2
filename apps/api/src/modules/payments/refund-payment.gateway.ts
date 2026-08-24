import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';

export interface LockedRefundPayment {
  id: string;
  method: 'BANK_TRANSFER' | 'CASH' | 'COD' | 'OTHER';
  status: 'AWAITING_PROOF' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
  expectedAmount: string;
  receivedAmount: string | null;
}

@Injectable()
export class RefundPaymentGateway {
  public async lockForRefund(
    orderId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<LockedRefundPayment[]> {
    const paymentIds = await transaction.payment.findMany({
      where: { orderId },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    for (const { id } of paymentIds) {
      await transaction.$queryRaw`SELECT id FROM payments WHERE id = ${id}::uuid FOR UPDATE`;
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
    return payments.map((payment) => ({
      ...payment,
      expectedAmount: payment.expectedAmount.toString(),
      receivedAmount: payment.receivedAmount?.toString() ?? null,
    }));
  }

  public cancelAwaitingProof(orderId: string, transaction: Prisma.TransactionClient) {
    return transaction.payment.updateMany({
      where: { orderId, status: 'AWAITING_PROOF' },
      data: { status: 'CANCELLED' },
    });
  }
}
