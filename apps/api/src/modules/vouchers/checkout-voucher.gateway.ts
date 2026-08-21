import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  calculateVoucherDiscount,
  parseVoucherScope,
  type VoucherDiscountResult,
  type VoucherLine,
} from './voucher-policy.js';

export interface CheckoutVoucherResult extends VoucherDiscountResult {
  id: string;
  code: string;
  name: string;
}

@Injectable()
export class CheckoutVoucherGateway {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async preview(
    code: string | undefined,
    lines: readonly VoucherLine[],
    customerId: string | null,
    now: Date,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<CheckoutVoucherResult | null> {
    if (code === undefined) return null;
    const voucher = await client.voucher.findUnique({
      where: { normalizedCode: normalizeCode(code) },
    });
    if (
      voucher === null ||
      voucher.status !== 'ACTIVE' ||
      voucher.startsAt > now ||
      voucher.endsAt <= now ||
      (voucher.visibility === 'ACCOUNT_ONLY' && customerId === null)
    ) {
      throw new ApiError('VOUCHER_NOT_APPLICABLE');
    }
    await this.assertQuota(voucher, customerId, client);
    const result = calculateVoucherDiscount(
      {
        discountType: voucher.discountType,
        discountValue: voucher.discountValue.toString(),
        maxDiscountAmount: voucher.maxDiscountAmount?.toString() ?? null,
        minimumOrderAmount: voucher.minimumOrderAmount.toString(),
        scope: parseVoucherScope(voucher.scopeType, voucher.scopeConfig),
      },
      lines,
    );
    return { id: voucher.id, code: voucher.code, name: voucher.name, ...result };
  }

  public async reserve(
    voucherId: string,
    orderId: string,
    customerId: string | null,
    now: Date,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await transaction.$queryRaw`SELECT id FROM vouchers WHERE id = ${voucherId}::uuid FOR UPDATE`;
    const voucher = await transaction.voucher.findUnique({ where: { id: voucherId } });
    if (
      voucher === null ||
      voucher.status !== 'ACTIVE' ||
      voucher.startsAt > now ||
      voucher.endsAt <= now ||
      (voucher.visibility === 'ACCOUNT_ONLY' && customerId === null)
    ) {
      throw new ApiError('VOUCHER_NOT_APPLICABLE');
    }
    await this.assertQuota(voucher, customerId, transaction);
    await transaction.voucherUsage.create({
      data: { voucherId, orderId, customerId, status: 'RESERVED' },
    });
  }

  public async release(
    orderId: string,
    now: Date,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    const usage = await transaction.voucherUsage.findUnique({
      where: { orderId },
      select: { voucherId: true },
    });
    if (usage === null) return;
    await transaction.$queryRaw`SELECT id FROM vouchers WHERE id = ${usage.voucherId}::uuid FOR UPDATE`;
    await transaction.voucherUsage.updateMany({
      where: { orderId, status: 'RESERVED' },
      data: { status: 'RELEASED', releasedAt: now },
    });
  }

  private async assertQuota(
    voucher: {
      id: string;
      totalUsageLimit: number | null;
      perCustomerLimit: number | null;
    },
    customerId: string | null,
    client: Prisma.TransactionClient | PrismaService,
  ): Promise<void> {
    const countedStatuses = ['RESERVED', 'CONSUMED'] as const;
    const total = await client.voucherUsage.count({
      where: { voucherId: voucher.id, status: { in: [...countedStatuses] } },
    });
    if (voucher.totalUsageLimit !== null && total >= voucher.totalUsageLimit) {
      throw new ApiError('VOUCHER_USAGE_LIMIT_REACHED');
    }
    if (voucher.perCustomerLimit !== null && customerId !== null) {
      const customerTotal = await client.voucherUsage.count({
        where: {
          voucherId: voucher.id,
          customerId,
          status: { in: [...countedStatuses] },
        },
      });
      if (customerTotal >= voucher.perCustomerLimit) {
        throw new ApiError('VOUCHER_USAGE_LIMIT_REACHED');
      }
    }
  }
}

function normalizeCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (normalized.length < 1 || normalized.length > 64) {
    throw new ApiError('VOUCHER_NOT_APPLICABLE');
  }
  return normalized;
}
