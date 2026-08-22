import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const fulfillmentOrderInclude = {
  items: {
    include: { warranty: true },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
  payments: {
    include: { reviewedBy: { select: { id: true, fullName: true, employeeCode: true } } },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
  refunds: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
  reservations: { orderBy: { id: 'asc' as const } },
  shipments: { orderBy: { attemptNumber: 'desc' as const } },
  pickupLocation: { select: { id: true, code: true, name: true, type: true, status: true } },
  fulfillmentLocation: { select: { id: true, code: true, name: true, type: true, status: true } },
  voucherUsage: { select: { id: true, status: true, voucherId: true } },
} satisfies Prisma.OrderInclude;

export type FulfillmentOrderRecord = Prisma.OrderGetPayload<{
  include: typeof fulfillmentOrderInclude;
}>;

export interface FulfillmentOrderListInput {
  q?: string;
  status?: 'PLACED' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
  fulfillmentStatus?:
    | 'PENDING'
    | 'PREPARING'
    | 'READY'
    | 'IN_TRANSIT'
    | 'COMPLETED'
    | 'FAILED'
    | 'RETURNED'
    | 'CANCELLED';
  paymentStatus?: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
  fulfillmentType?: 'PICKUP' | 'SHIPPING';
  locationId?: string;
  placedFrom?: Date;
  placedTo?: Date;
  pickupOverdue?: boolean;
  page: number;
  pageSize: number;
  sortBy: 'placedAt' | 'updatedAt' | 'grandTotal' | 'pickupHoldUntil';
  sortOrder: 'asc' | 'desc';
  now: Date;
}

@Injectable()
export class FulfillmentOrderGateway {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public findById(
    id: string,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<FulfillmentOrderRecord | null> {
    return client.order.findUnique({ where: { id }, include: fulfillmentOrderInclude });
  }

  public async lock(
    id: string,
    transaction: Prisma.TransactionClient,
  ): Promise<FulfillmentOrderRecord | null> {
    const locked = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE
    `;
    if (locked.length === 0) return null;
    return this.findById(id, transaction);
  }

  public async list(input: FulfillmentOrderListInput): Promise<{
    orders: FulfillmentOrderRecord[];
    totalItems: number;
  }> {
    const where = buildWhere(input);
    const orderBy = buildOrderBy(input.sortBy, input.sortOrder);
    const [orders, totalItems] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: fulfillmentOrderInclude,
        orderBy,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { orders, totalItems };
  }

  public findExpiredPickupCandidates(now: Date, batchSize: number) {
    return this.prisma.order.findMany({
      where: {
        fulfillmentType: 'PICKUP',
        pickupHoldUntil: { lte: now },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        fulfillmentStatus: {
          notIn: ['COMPLETED', 'CANCELLED', 'IN_TRANSIT', 'FAILED', 'RETURNED'],
        },
      },
      select: { id: true, orderNumber: true },
      orderBy: [{ pickupHoldUntil: 'asc' }, { id: 'asc' }],
      take: batchSize,
    });
  }
}

function buildWhere(input: FulfillmentOrderListInput): Prisma.OrderWhereInput {
  const q = input.q?.trim();
  const overdueFilter: Prisma.OrderWhereInput | undefined =
    input.pickupOverdue === undefined
      ? undefined
      : input.pickupOverdue
        ? {
            fulfillmentType: 'PICKUP',
            pickupHoldUntil: { lte: input.now },
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
            fulfillmentStatus: {
              notIn: ['COMPLETED', 'CANCELLED', 'IN_TRANSIT', 'FAILED', 'RETURNED'],
            },
          }
        : {
            NOT: {
              fulfillmentType: 'PICKUP',
              pickupHoldUntil: { lte: input.now },
              status: { notIn: ['COMPLETED', 'CANCELLED'] },
              fulfillmentStatus: {
                notIn: ['COMPLETED', 'CANCELLED', 'IN_TRANSIT', 'FAILED', 'RETURNED'],
              },
            },
          };
  return {
    ...(q === undefined || q.length === 0
      ? {}
      : {
          OR: [
            { orderNumber: { startsWith: q.toUpperCase(), mode: 'insensitive' as const } },
            { customerName: { contains: q, mode: 'insensitive' as const } },
            { customerEmail: { contains: q.toLowerCase(), mode: 'insensitive' as const } },
            { customerPhone: { contains: q } },
          ],
        }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.fulfillmentStatus === undefined
      ? {}
      : { fulfillmentStatus: input.fulfillmentStatus }),
    ...(input.paymentStatus === undefined ? {} : { paymentStatus: input.paymentStatus }),
    ...(input.fulfillmentType === undefined ? {} : { fulfillmentType: input.fulfillmentType }),
    ...(input.locationId === undefined ? {} : { fulfillmentLocationId: input.locationId }),
    ...(input.placedFrom === undefined && input.placedTo === undefined
      ? {}
      : {
          placedAt: {
            ...(input.placedFrom === undefined ? {} : { gte: input.placedFrom }),
            ...(input.placedTo === undefined ? {} : { lte: input.placedTo }),
          },
        }),
    ...(overdueFilter === undefined ? {} : overdueFilter),
  };
}

function buildOrderBy(
  sortBy: FulfillmentOrderListInput['sortBy'],
  sortOrder: FulfillmentOrderListInput['sortOrder'],
): Prisma.OrderOrderByWithRelationInput[] {
  const primary =
    sortBy === 'pickupHoldUntil'
      ? { pickupHoldUntil: { sort: sortOrder, nulls: 'last' as const } }
      : { [sortBy]: sortOrder };
  return [primary, { id: sortOrder }] as Prisma.OrderOrderByWithRelationInput[];
}
