import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';

export interface Slice08PreflightViolationCount {
  checkName: string;
  count: number;
}

export function findSlice08PreflightViolations(
  prisma: PrismaClient,
): Promise<Slice08PreflightViolationCount[]> {
  return prisma.$queryRaw<Slice08PreflightViolationCount[]>`
    SELECT 'orders_pickup_lifecycle_check' AS "checkName", COUNT(*)::int AS count
    FROM orders
    WHERE fulfillment_type = 'PICKUP'
      AND (
        (status = 'PLACED' AND fulfillment_status = 'PENDING')
        OR (status = 'CONFIRMED' AND fulfillment_status = 'PENDING')
        OR (status = 'PROCESSING' AND fulfillment_status IN ('PREPARING', 'READY'))
        OR (status = 'COMPLETED' AND fulfillment_status = 'COMPLETED')
        OR (status = 'CANCELLED' AND fulfillment_status = 'CANCELLED')
      ) IS NOT TRUE
    UNION ALL
    SELECT 'orders_pickup_deadline_timestamps_check', COUNT(*)::int
    FROM orders
    WHERE fulfillment_type = 'PICKUP'
      AND (
        pickup_hold_until > placed_at
        AND (confirmed_at IS NULL OR (
          confirmed_at >= placed_at
          AND confirmed_at < pickup_hold_until
        ))
        AND (pickup_ready_at IS NULL OR (
          confirmed_at IS NOT NULL
          AND pickup_ready_at >= confirmed_at
          AND pickup_ready_at < pickup_hold_until
        ))
        AND (picked_up_at IS NULL OR (
          pickup_ready_at IS NOT NULL
          AND picked_up_at >= pickup_ready_at
          AND picked_up_at < pickup_hold_until
        ))
        AND (cancelled_at IS NULL OR cancelled_at >= COALESCE(
          pickup_ready_at,
          confirmed_at,
          placed_at
        ))
        AND (
          (status = 'PLACED'
            AND confirmed_at IS NULL
            AND pickup_ready_at IS NULL
            AND picked_up_at IS NULL
            AND completed_at IS NULL
            AND cancelled_at IS NULL)
          OR (status = 'CONFIRMED'
            AND confirmed_at IS NOT NULL
            AND pickup_ready_at IS NULL
            AND picked_up_at IS NULL
            AND completed_at IS NULL
            AND cancelled_at IS NULL)
          OR (status = 'PROCESSING' AND fulfillment_status = 'PREPARING'
            AND confirmed_at IS NOT NULL
            AND pickup_ready_at IS NULL
            AND picked_up_at IS NULL
            AND completed_at IS NULL
            AND cancelled_at IS NULL)
          OR (status = 'PROCESSING' AND fulfillment_status = 'READY'
            AND confirmed_at IS NOT NULL
            AND pickup_ready_at IS NOT NULL
            AND picked_up_at IS NULL
            AND completed_at IS NULL
            AND cancelled_at IS NULL)
          OR (status = 'COMPLETED'
            AND confirmed_at IS NOT NULL
            AND pickup_ready_at IS NOT NULL
            AND picked_up_at IS NOT NULL
            AND completed_at IS NOT NULL
            AND completed_at = picked_up_at
            AND cancelled_at IS NULL)
          OR (status = 'CANCELLED'
            AND picked_up_at IS NULL
            AND completed_at IS NULL
            AND cancelled_at IS NOT NULL)
        )
      ) IS NOT TRUE
    UNION ALL
    SELECT 'inventory_reservations_one_active_per_order_item', COUNT(*)::int
    FROM (
      SELECT order_item_id
      FROM inventory_reservations
      WHERE status = 'ACTIVE'
      GROUP BY order_item_id
      HAVING COUNT(*) > 1
    ) AS duplicate_active_reservations
    UNION ALL
    SELECT 'payments_cash_fulfillment_check', COUNT(*)::int
    FROM payments
    WHERE method = 'CASH'
      AND (
        purpose = 'FULL_PAYMENT'
        AND status = 'VERIFIED'
        AND expected_amount > 0
        AND received_amount IS NOT NULL
        AND received_amount = expected_amount
        AND reviewed_by_id IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND transfer_content IS NULL
        AND bank_name_snapshot IS NULL
        AND bank_account_number_snapshot IS NULL
        AND bank_account_holder_snapshot IS NULL
        AND bank_qr_bucket_snapshot IS NULL
        AND bank_qr_object_path_snapshot IS NULL
        AND review_window_minutes_snapshot IS NULL
        AND evidence_bucket IS NULL
        AND evidence_object_path IS NULL
        AND customer_declared_at IS NULL
        AND expires_at IS NULL
        AND submitted_at IS NULL
        AND rejection_reason IS NULL
      ) IS NOT TRUE
    UNION ALL
    SELECT 'payments_one_cash_full_payment_per_order', COUNT(*)::int
    FROM (
      SELECT order_id
      FROM payments
      WHERE method = 'CASH' AND purpose = 'FULL_PAYMENT'
      GROUP BY order_id
      HAVING COUNT(*) > 1
    ) AS duplicate_cash_payments
    UNION ALL
    SELECT 'stock_movements_sale_reference_check', COUNT(*)::int
    FROM stock_movements
    WHERE type = 'SALE'
      AND (
        from_location_id IS NOT NULL
        AND to_location_id IS NULL
        AND reference_type IS NOT NULL
        AND reference_type = 'INVENTORY_RESERVATION'
        AND reference_id IS NOT NULL
      ) IS NOT TRUE
    UNION ALL
    SELECT 'stock_movements_one_sale_per_reservation', COUNT(*)::int
    FROM (
      SELECT reference_id
      FROM stock_movements
      WHERE type = 'SALE'
        AND reference_type = 'INVENTORY_RESERVATION'
        AND reference_id IS NOT NULL
      GROUP BY reference_id
      HAVING COUNT(*) > 1
    ) AS duplicate_sale_movements
    UNION ALL
    SELECT 'warranties_interval_check', COUNT(*)::int
    FROM warranties
    WHERE (
      days_snapshot > 0
      AND end_at = start_at + (days_snapshot * INTERVAL '1 day')
      AND NULLIF(BTRIM(terms_snapshot), '') IS NOT NULL
    ) IS NOT TRUE
  `;
}

async function runSlice08Preflight(): Promise<void> {
  loadWorkspaceEnvironment();
  const connectionString = requiredEnvironment('DATABASE_URL');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const violations = await findSlice08PreflightViolations(prisma);
    const failed = violations.filter(({ count }) => count > 0);
    process.stdout.write(`${JSON.stringify({ checks: violations }, null, 2)}\n`);
    if (failed.length > 0) {
      throw new Error(`Slice 08 preflight found ${failed.length.toString()} violated invariant(s)`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for the Slice 08 preflight`);
  }
  return value;
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && import.meta.url === pathToFileURL(resolve(entrypoint)).href;
}

if (isMainModule()) {
  await runSlice08Preflight();
}
