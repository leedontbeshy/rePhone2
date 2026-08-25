import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { BackofficePaymentListQueryDto } from './payment-operation.dto.js';
import { calculateReviewSlaDueAt } from './payment-operation.projector.js';

export const paymentProjectionInclude = {
  reviewedBy: { select: { id: true, fullName: true, employeeCode: true } },
  order: {
    include: {
      items: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
      sourceCart: { select: { guestTokenHash: true, expiresAt: true, status: true } },
    },
  },
} satisfies Prisma.PaymentInclude;

export type PaymentOperationsRecord = Prisma.PaymentGetPayload<{
  include: typeof paymentProjectionInclude;
}>;

export interface PaymentListPage {
  payments: PaymentOperationsRecord[];
  totalItems: number;
}

export interface OverduePaymentReviewCandidate {
  id: string;
  orderId: string;
  reviewDueAt: Date;
}

@Injectable()
export class PaymentOperationsRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public findById(
    id: string,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<PaymentOperationsRecord | null> {
    return client.payment.findUnique({ where: { id }, include: paymentProjectionInclude });
  }

  public async list(query: BackofficePaymentListQueryDto, now: Date): Promise<PaymentListPage> {
    const where: Prisma.PaymentWhereInput = {
      status: query.status ?? 'UNDER_REVIEW',
      ...(query.purpose === undefined ? {} : { purpose: query.purpose }),
      ...(query.method === undefined ? {} : { method: query.method }),
      ...(query.orderNumber === undefined
        ? {}
        : {
            order: {
              orderNumber: { contains: query.orderNumber, mode: 'insensitive' as const },
            },
          }),
      ...(query.submittedFrom === undefined && query.submittedTo === undefined
        ? {}
        : {
            submittedAt: {
              ...(query.submittedFrom === undefined ? {} : { gte: new Date(query.submittedFrom) }),
              ...(query.submittedTo === undefined ? {} : { lte: new Date(query.submittedTo) }),
            },
          }),
    };
    const orderBy = paymentOrderBy(query.sortBy, query.sortOrder);

    if (query.reviewOverdue === undefined) {
      const [payments, totalItems] = await Promise.all([
        this.prisma.payment.findMany({
          where,
          include: paymentProjectionInclude,
          orderBy,
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.payment.count({ where }),
      ]);
      return { payments, totalItems };
    }

    const candidates = await this.prisma.payment.findMany({
      where,
      include: paymentProjectionInclude,
      orderBy,
    });
    const filtered = candidates.filter((payment) => {
      const deadline = calculateReviewSlaDueAt(payment);
      const overdue = payment.status === 'UNDER_REVIEW' && deadline !== null && deadline <= now;
      return overdue === query.reviewOverdue;
    });
    const offset = (query.page - 1) * query.pageSize;
    return {
      payments: filtered.slice(offset, offset + query.pageSize),
      totalItems: filtered.length,
    };
  }

  public async lockPaymentRoot(
    paymentId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<PaymentOperationsRecord | null> {
    const orders = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT orders.id
      FROM orders
      INNER JOIN payments ON payments.order_id = orders.id
      WHERE payments.id = ${paymentId}::uuid
      FOR UPDATE OF orders
    `;
    if (orders.length === 0) return null;
    await transaction.$queryRaw`
      SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE
    `;
    return this.findById(paymentId, transaction);
  }

  public async lockActiveReservations(
    orderId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await transaction.$queryRaw`
      SELECT id
      FROM inventory_reservations
      WHERE order_id = ${orderId}::uuid AND status = 'ACTIVE'
      ORDER BY id
      FOR UPDATE
    `;
  }

  public findExpiredDepositCandidates(now: Date, batchSize: number) {
    return this.prisma.payment.findMany({
      where: {
        purpose: 'DEPOSIT',
        method: 'BANK_TRANSFER',
        status: 'AWAITING_PROOF',
        expiresAt: { lte: now },
      },
      select: { id: true, orderId: true },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      take: batchSize,
    });
  }

  public findOverdueReviewCandidates(
    now: Date,
    batchSize: number,
  ): Promise<OverduePaymentReviewCandidate[]> {
    return this.prisma.$queryRaw<OverduePaymentReviewCandidate[]>`
      SELECT
        id,
        order_id AS "orderId",
        submitted_at + review_window_minutes_snapshot * INTERVAL '1 minute' AS "reviewDueAt"
      FROM payments
      WHERE purpose = 'DEPOSIT'
        AND status = 'UNDER_REVIEW'
        AND submitted_at IS NOT NULL
        AND review_window_minutes_snapshot IS NOT NULL
        AND review_window_minutes_snapshot > 0
        AND submitted_at + review_window_minutes_snapshot * INTERVAL '1 minute' <= ${now}
      ORDER BY "reviewDueAt" ASC, id ASC
      LIMIT ${batchSize}
    `;
  }
}

function paymentOrderBy(
  sortBy: BackofficePaymentListQueryDto['sortBy'],
  sortOrder: BackofficePaymentListQueryDto['sortOrder'],
): Prisma.PaymentOrderByWithRelationInput[] {
  const primary =
    sortBy === 'submittedAt' || sortBy === 'expiresAt'
      ? { [sortBy]: { sort: sortOrder, nulls: 'last' as const } }
      : { [sortBy]: sortOrder };
  return [primary, { id: sortOrder }] as Prisma.PaymentOrderByWithRelationInput[];
}
