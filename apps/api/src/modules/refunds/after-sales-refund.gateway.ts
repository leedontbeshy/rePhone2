import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';

export interface CompletedAfterSalesRefund {
  id: string;
  orderId: string;
  paymentId: string | null;
  amount: string;
  method: 'BANK_TRANSFER' | 'CASH' | 'OTHER';
  completedAt: Date;
}

@Injectable()
export class AfterSalesRefundGateway {
  public async lockCompletedForOrder(
    refundId: string,
    orderId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<CompletedAfterSalesRefund | null> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM refunds WHERE id = ${refundId}::uuid FOR UPDATE
    `;
    if (rows.length !== 1) return null;
    const refund = await transaction.refund.findFirst({
      where: { id: refundId, orderId, status: 'COMPLETED', completedAt: { not: null } },
      select: {
        id: true,
        orderId: true,
        paymentId: true,
        amount: true,
        method: true,
        completedAt: true,
      },
    });
    if (refund === null || refund.completedAt === null || refund.orderId === null) return null;
    return {
      ...refund,
      orderId: refund.orderId,
      amount: refund.amount.toString(),
      completedAt: refund.completedAt,
    };
  }
}
