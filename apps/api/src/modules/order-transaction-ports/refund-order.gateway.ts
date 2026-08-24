import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';

export interface RefundOrderLock {
  id: string;
  orderNumber: string;
  status: string;
  grandTotal: string;
}

@Injectable()
export class RefundOrderGateway {
  public async lockById(
    orderId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<RefundOrderLock | null> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE
    `;
    if (rows.length === 0) return null;
    return this.findById(orderId, transaction);
  }

  public async findById(
    orderId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<RefundOrderLock | null> {
    const order = await transaction.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true, status: true, grandTotal: true },
    });
    return order === null
      ? null
      : { ...order, grandTotal: order.grandTotal.toString() };
  }

  public markCancelled(
    orderId: string,
    reason: string,
    now: Date,
    transaction: Prisma.TransactionClient,
  ) {
    return transaction.order.updateMany({
      where: { id: orderId, status: { in: ['PLACED', 'CONFIRMED', 'PROCESSING'] } },
      data: {
        status: 'CANCELLED',
        fulfillmentStatus: 'CANCELLED',
        cancelReason: reason,
        cancelledAt: now,
      },
    });
  }

  public updateFinance(
    orderId: string,
    finance: {
      paidAmount: string;
      refundedAmount: string;
      balanceDue: string;
      paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
    },
    transaction: Prisma.TransactionClient,
  ) {
    return transaction.order.update({ where: { id: orderId }, data: finance });
  }
}
