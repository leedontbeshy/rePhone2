import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';

export interface FinancialAggregateRow {
  date: string;
  channel: 'STOREFRONT' | 'DEALER';
  grossRevenue: string;
  refunds: string;
  shippingRevenue: string;
  discounts: string;
  orderCount: number;
  unitsSold: number;
  knownCost: string;
  missingCostItems: number;
}
interface PositionRow {
  receivables: string;
  stockUnits: number;
  stockCapitalKnown: string;
  stockCostMissing: number;
}

@Injectable()
export class FinancialReportRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async read(start: Date, end: Date, admin: boolean) {
    // Keep order-level totals separate from item aggregation to prevent multiplying revenue.
    const salesQuery = Prisma.sql`
      WITH completed AS (
        SELECT * FROM orders WHERE status = 'COMPLETED' AND completed_at >= ${start} AND completed_at < ${end}
      ), items AS (
        SELECT item.order_id,
          SUM(CASE WHEN item.product_type_snapshot = 'IPHONE' THEN item.quantity ELSE 0 END)::int AS units,
          ${admin ? Prisma.sql`COALESCE(SUM((unit.acquisition_cost + unit.additional_cost) * item.quantity) FILTER (WHERE unit.acquisition_cost IS NOT NULL), 0)` : Prisma.sql`0`} AS cost,
          ${admin ? Prisma.sql`COALESCE(SUM(item.quantity) FILTER (WHERE unit.acquisition_cost IS NULL), 0)::int` : Prisma.sql`0`} AS missing
        FROM order_items item JOIN completed o ON o.id = item.order_id
        LEFT JOIN inventory_units unit ON unit.id = item.inventory_unit_id
        GROUP BY item.order_id
      )
      SELECT TO_CHAR(o.completed_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS date,
        o.channel::text AS channel, COUNT(*)::int AS "orderCount",
        COALESCE(SUM(items.units),0)::int AS "unitsSold",
        COALESCE(SUM(o.grand_total),0)::text AS "grossRevenue",
        COALESCE(SUM(o.refunded_amount),0)::text AS refunds,
        COALESCE(SUM(o.shipping_fee),0)::text AS "shippingRevenue",
        COALESCE(SUM(o.item_discount_amount + o.voucher_discount_amount),0)::text AS discounts,
        COALESCE(SUM(items.cost),0)::text AS "knownCost",
        COALESCE(SUM(items.missing),0)::int AS "missingCostItems"
      FROM completed o LEFT JOIN items ON items.order_id = o.id
      GROUP BY date, o.channel ORDER BY date, o.channel`;
    const positionQuery = Prisma.sql`
      SELECT
        (SELECT COALESCE(SUM(balance_due),0)::text FROM orders WHERE status <> 'CANCELLED' AND balance_due > 0) AS receivables,
        COUNT(*)::int AS "stockUnits",
        ${admin ? Prisma.sql`COALESCE(SUM(acquisition_cost + additional_cost) FILTER (WHERE acquisition_cost IS NOT NULL),0)::text` : Prisma.sql`'0'`} AS "stockCapitalKnown",
        ${admin ? Prisma.sql`COUNT(*) FILTER (WHERE acquisition_cost IS NULL)::int` : Prisma.sql`0`} AS "stockCostMissing"
      FROM inventory_units WHERE lifecycle_status NOT IN ('SOLD', 'WRITTEN_OFF')`;
    // One repeatable-read snapshot keeps cards/charts and totals coherent during order updates.
    const [rows, positions] = await this.prisma.$transaction(
      [
        this.prisma.$queryRaw<FinancialAggregateRow[]>(salesQuery),
        this.prisma.$queryRaw<PositionRow[]>(positionQuery),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      rows,
      position: positions[0] ?? {
        receivables: '0',
        stockUnits: 0,
        stockCapitalKnown: '0',
        stockCostMissing: 0,
      },
    };
  }
}
