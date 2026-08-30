import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

interface OverviewAggregateRow {
  activeOrders: number;
  paymentsUnderReview: number;
  openAfterSales: number;
  lowStockLevels: number;
  overduePaymentReviews: number;
  oldestOverduePaymentAt: Date | null;
  overduePickups: number;
  oldestOverduePickupAt: Date | null;
  requestedRefunds: number;
  oldestRequestedRefundAt: Date | null;
  requestedAfterSales: number;
  oldestRequestedAfterSalesAt: Date | null;
}

const recentOrderSelect = {
  id: true,
  orderNumber: true,
  customerName: true,
  status: true,
  fulfillmentStatus: true,
  paymentStatus: true,
  grandTotal: true,
  placedAt: true,
} as const;

export type OverviewRecentOrderRecord = Awaited<
  ReturnType<OperationsOverviewRepository['recentOrders']>
>[number];

@Injectable()
export class OperationsOverviewRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async read(now: Date) {
    const [rows, recentOrders] = await Promise.all([
      this.prisma.$queryRaw<OverviewAggregateRow[]>`
        SELECT
          (
            SELECT COUNT(*)::int
            FROM orders
            WHERE status IN ('PLACED', 'CONFIRMED', 'PROCESSING')
          ) AS "activeOrders",
          (
            SELECT COUNT(*)::int
            FROM payments
            WHERE status = 'UNDER_REVIEW'
          ) AS "paymentsUnderReview",
          (
            SELECT COUNT(*)::int
            FROM after_sales_requests
            WHERE status IN ('REQUESTED', 'RECEIVED', 'INSPECTING', 'APPROVED')
          ) AS "openAfterSales",
          (
            SELECT COUNT(*)::int
            FROM stock_levels
            WHERE quantity_on_hand - quantity_reserved <= reorder_threshold
          ) AS "lowStockLevels",
          (
            SELECT COUNT(*)::int
            FROM payments
            WHERE status = 'UNDER_REVIEW'
              AND submitted_at IS NOT NULL
              AND review_window_minutes_snapshot IS NOT NULL
              AND submitted_at + make_interval(mins => review_window_minutes_snapshot) <= ${now}
          ) AS "overduePaymentReviews",
          (
            SELECT MIN(submitted_at + make_interval(mins => review_window_minutes_snapshot))
            FROM payments
            WHERE status = 'UNDER_REVIEW'
              AND submitted_at IS NOT NULL
              AND review_window_minutes_snapshot IS NOT NULL
              AND submitted_at + make_interval(mins => review_window_minutes_snapshot) <= ${now}
          ) AS "oldestOverduePaymentAt",
          (
            SELECT COUNT(*)::int
            FROM orders
            WHERE fulfillment_type = 'PICKUP'
              AND pickup_hold_until <= ${now}
              AND status NOT IN ('COMPLETED', 'CANCELLED')
              AND fulfillment_status NOT IN (
                'COMPLETED', 'CANCELLED', 'IN_TRANSIT', 'FAILED', 'RETURNED'
              )
          ) AS "overduePickups",
          (
            SELECT MIN(pickup_hold_until)
            FROM orders
            WHERE fulfillment_type = 'PICKUP'
              AND pickup_hold_until <= ${now}
              AND status NOT IN ('COMPLETED', 'CANCELLED')
              AND fulfillment_status NOT IN (
                'COMPLETED', 'CANCELLED', 'IN_TRANSIT', 'FAILED', 'RETURNED'
              )
          ) AS "oldestOverduePickupAt",
          (
            SELECT COUNT(*)::int
            FROM refunds
            WHERE status = 'REQUESTED'
          ) AS "requestedRefunds",
          (
            SELECT MIN(created_at)
            FROM refunds
            WHERE status = 'REQUESTED'
          ) AS "oldestRequestedRefundAt",
          (
            SELECT COUNT(*)::int
            FROM after_sales_requests
            WHERE status = 'REQUESTED'
          ) AS "requestedAfterSales",
          (
            SELECT MIN(requested_at)
            FROM after_sales_requests
            WHERE status = 'REQUESTED'
          ) AS "oldestRequestedAfterSalesAt"
      `,
      this.recentOrders(),
    ]);

    const aggregates = rows[0];
    if (aggregates === undefined) throw new Error('operations overview aggregate returned no row');
    return { aggregates, recentOrders };
  }

  public recentOrders() {
    return this.prisma.order.findMany({
      select: recentOrderSelect,
      orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
      take: 5,
    });
  }
}
