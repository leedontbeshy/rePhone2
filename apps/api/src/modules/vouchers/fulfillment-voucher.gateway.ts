import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import type { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class FulfillmentVoucherGateway {
  public async consume(
    orderId: string,
    now: Date,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    const usage = await this.lockUsage(orderId, transaction);
    if (usage === null) return;
    if (usage.status === 'CONSUMED') return;
    if (usage.status !== 'RESERVED') throw new ApiError('INVALID_STATE_TRANSITION');
    const consumed = await transaction.voucherUsage.updateMany({
      where: { id: usage.id, status: 'RESERVED' },
      data: { status: 'CONSUMED', consumedAt: now },
    });
    if (consumed.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
  }

  public async release(
    orderId: string,
    now: Date,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    const usage = await this.lockUsage(orderId, transaction);
    if (usage === null || usage.status === 'RELEASED') return;
    if (usage.status !== 'RESERVED') throw new ApiError('INVALID_STATE_TRANSITION');
    const released = await transaction.voucherUsage.updateMany({
      where: { id: usage.id, status: 'RESERVED' },
      data: { status: 'RELEASED', releasedAt: now },
    });
    if (released.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
  }

  private async lockUsage(orderId: string, transaction: Prisma.TransactionClient) {
    const usage = await transaction.voucherUsage.findUnique({
      where: { orderId },
      select: { id: true, voucherId: true, status: true },
    });
    if (usage === null) return null;
    await transaction.$queryRaw`SELECT id FROM vouchers WHERE id = ${usage.voucherId}::uuid FOR UPDATE`;
    await transaction.$queryRaw`SELECT id FROM voucher_usages WHERE id = ${usage.id}::uuid FOR UPDATE`;
    return transaction.voucherUsage.findUnique({
      where: { id: usage.id },
      select: { id: true, voucherId: true, status: true },
    });
  }
}
