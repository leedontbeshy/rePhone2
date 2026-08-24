import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { BackofficeRefundListQueryDto } from './refund.dto.js';

const actorSelect = { id: true, fullName: true, employeeCode: true } as const;
const orderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  fulfillmentStatus: true,
  paymentStatus: true,
  customerName: true,
  customerEmail: true,
  grandTotal: true,
  paidAmount: true,
  refundedAmount: true,
  balanceDue: true,
} as const;
const paymentSelect = {
  id: true,
  purpose: true,
  method: true,
  status: true,
  expectedAmount: true,
  receivedAmount: true,
} as const;

export const refundProjectionInclude = {
  order: { select: orderSelect },
  payment: { select: paymentSelect },
  requestedBy: { select: actorSelect },
  processedBy: { select: actorSelect },
  terminalBy: { select: actorSelect },
} satisfies Prisma.RefundInclude;

export type RefundOperationsRecord = Prisma.RefundGetPayload<{
  include: typeof refundProjectionInclude;
}>;

@Injectable()
export class RefundOperationsRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public findById(id: string): Promise<RefundOperationsRecord | null> {
    return this.prisma.refund.findUnique({ where: { id }, include: refundProjectionInclude });
  }

  public async findByIdInTransaction(
    id: string,
    transaction: Prisma.TransactionClient,
  ): Promise<RefundOperationsRecord | null> {
    const refund = await transaction.refund.findUnique({ where: { id } });
    if (refund === null) return null;

    const order = await transaction.order.findUnique({
      where: { id: refund.orderId },
      select: orderSelect,
    });
    if (order === null) return null;
    const payment =
      refund.paymentId === null
        ? null
        : await transaction.payment.findUnique({
            where: { id: refund.paymentId },
            select: paymentSelect,
          });
    const requestedBy =
      refund.requestedById === null
        ? null
        : await transaction.user.findUnique({
            where: { id: refund.requestedById },
            select: actorSelect,
          });
    const processedBy =
      refund.processedById === null
        ? null
        : await transaction.user.findUnique({
            where: { id: refund.processedById },
            select: actorSelect,
          });
    const terminalBy =
      refund.terminalById === null
        ? null
        : await transaction.user.findUnique({
            where: { id: refund.terminalById },
            select: actorSelect,
          });

    return { ...refund, order, payment, requestedBy, processedBy, terminalBy };
  }

  public async findOrderId(id: string): Promise<string | null> {
    const refund = await this.prisma.refund.findUnique({
      where: { id },
      select: { orderId: true },
    });
    return refund?.orderId ?? null;
  }

  public async list(query: BackofficeRefundListQueryDto): Promise<{
    refunds: RefundOperationsRecord[];
    totalItems: number;
  }> {
    const where: Prisma.RefundWhereInput = {
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.method === undefined ? {} : { method: query.method }),
      ...(query.orderNumber === undefined
        ? {}
        : {
            order: {
              orderNumber: { startsWith: query.orderNumber.toUpperCase(), mode: 'insensitive' },
            },
          }),
      ...(query.createdFrom === undefined && query.createdTo === undefined
        ? {}
        : {
            createdAt: {
              ...(query.createdFrom === undefined ? {} : { gte: new Date(query.createdFrom) }),
              ...(query.createdTo === undefined ? {} : { lte: new Date(query.createdTo) }),
            },
          }),
    };
    const orderBy = refundOrderBy(query.sortBy, query.sortOrder);
    const [refunds, totalItems] = await Promise.all([
      this.prisma.refund.findMany({
        where,
        include: refundProjectionInclude,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.refund.count({ where }),
    ]);
    return { refunds, totalItems };
  }
}

function refundOrderBy(
  sortBy: BackofficeRefundListQueryDto['sortBy'],
  sortOrder: BackofficeRefundListQueryDto['sortOrder'],
): Prisma.RefundOrderByWithRelationInput[] {
  const primary =
    sortBy === 'processingAt'
      ? { processingAt: { sort: sortOrder, nulls: 'last' as const } }
      : { [sortBy]: sortOrder };
  return [primary, { id: sortOrder }] as Prisma.RefundOrderByWithRelationInput[];
}
