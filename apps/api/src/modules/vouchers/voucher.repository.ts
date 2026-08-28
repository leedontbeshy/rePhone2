import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  BackofficeVoucherListQueryDto,
  PublicVoucherListQueryDto,
  VoucherUsageListQueryDto,
} from './voucher.dto.js';

type DbClient = PrismaService | Prisma.TransactionClient;

const voucherInclude = {
  usages: { select: { status: true } },
} satisfies Prisma.VoucherInclude;

export type VoucherRecord = Prisma.VoucherGetPayload<{ include: typeof voucherInclude }>;

const voucherUsageSelect = {
  id: true,
  orderId: true,
  customerId: true,
  status: true,
  createdAt: true,
  consumedAt: true,
  releasedAt: true,
  order: { select: { orderNumber: true } },
  customer: { select: { fullName: true, email: true } },
} satisfies Prisma.VoucherUsageSelect;

export type VoucherUsageRecord = Prisma.VoucherUsageGetPayload<{
  select: typeof voucherUsageSelect;
}>;

@Injectable()
export class VoucherRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async listPublic(
    query: PublicVoucherListQueryDto,
    allowedVisibilities: Array<'PUBLIC' | 'ACCOUNT_ONLY'>,
  ) {
    const now = new Date();
    const where: Prisma.VoucherWhereInput = {
      status: 'ACTIVE',
      startsAt: { lte: now },
      endsAt: { gt: now },
      visibility: { in: allowedVisibilities },
      ...(query.visibility === undefined ? {} : { visibility: query.visibility }),
    };
    const [items, totalItems] = await Promise.all([
      this.prisma.voucher.findMany({
        where,
        include: voucherInclude,
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.voucher.count({ where }),
    ]);
    return { items, totalItems };
  }

  public async listBackoffice(query: BackofficeVoucherListQueryDto) {
    const where: Prisma.VoucherWhereInput = {
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { code: { contains: query.q, mode: 'insensitive' } },
              { name: { contains: query.q, mode: 'insensitive' } },
            ],
          }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.visibility === undefined ? {} : { visibility: query.visibility }),
      ...(query.discountType === undefined ? {} : { discountType: query.discountType }),
      ...(query.scopeType === undefined ? {} : { scopeType: query.scopeType }),
    };
    const [items, totalItems] = await Promise.all([
      this.prisma.voucher.findMany({
        where,
        include: voucherInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.voucher.count({ where }),
    ]);
    return { items, totalItems };
  }

  public find(id: string, client: DbClient = this.prisma) {
    return client.voucher.findUnique({ where: { id }, include: voucherInclude });
  }

  public async listUsages(id: string, query: VoucherUsageListQueryDto) {
    const where: Prisma.VoucherUsageWhereInput = {
      voucherId: id,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.orderId === undefined ? {} : { orderId: query.orderId }),
      ...(query.customerId === undefined ? {} : { customerId: query.customerId }),
    };
    const [items, totalItems] = await Promise.all([
      this.prisma.voucherUsage.findMany({
        where,
        select: voucherUsageSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.voucherUsage.count({ where }),
    ]);
    return { items, totalItems };
  }

  public lock(id: string, client: Prisma.TransactionClient): Promise<unknown> {
    return client.$queryRaw`SELECT id FROM vouchers WHERE id = ${id}::uuid FOR UPDATE`;
  }
}
