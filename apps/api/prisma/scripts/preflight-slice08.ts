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
    SELECT 'inventory_reservations_order_item_alignment', COUNT(*)::int
    FROM inventory_reservations reservation
    JOIN order_items item ON item.id = reservation.order_item_id
    LEFT JOIN inventory_units unit ON unit.id = reservation.inventory_unit_id
    LEFT JOIN stock_levels stock ON stock.id = reservation.stock_level_id
    WHERE (
      reservation.order_id = item.order_id
      AND reservation.quantity = item.quantity
      AND (
        (item.inventory_unit_id IS NOT NULL
          AND reservation.inventory_unit_id = item.inventory_unit_id
          AND reservation.stock_level_id IS NULL
          AND reservation.quantity = 1
          AND unit.variant_id = item.variant_id)
        OR (item.inventory_unit_id IS NULL
          AND reservation.inventory_unit_id IS NULL
          AND reservation.stock_level_id IS NOT NULL
          AND stock.variant_id = item.variant_id)
      )
    ) IS NOT TRUE
    UNION ALL
    SELECT 'pickup_location_shape', COUNT(*)::int
    FROM orders pickup_order
    JOIN inventory_locations location ON location.id = pickup_order.fulfillment_location_id
    WHERE pickup_order.fulfillment_type = 'PICKUP'
      AND (
        pickup_order.pickup_location_id IS DISTINCT FROM pickup_order.fulfillment_location_id
        OR location.type <> 'STORE'
        OR (pickup_order.status NOT IN ('COMPLETED', 'CANCELLED') AND location.status <> 'ACTIVE')
      )
    UNION ALL
    SELECT 'pickup_active_reservation_mirror', COUNT(*)::int
    FROM orders pickup_order
    WHERE pickup_order.fulfillment_type = 'PICKUP'
      AND (
        (pickup_order.status NOT IN ('COMPLETED', 'CANCELLED') AND (
          NOT EXISTS (
            SELECT 1 FROM order_items item WHERE item.order_id = pickup_order.id
          )
          OR EXISTS (
            SELECT 1
            FROM order_items item
            WHERE item.order_id = pickup_order.id
              AND (
                SELECT COUNT(*)
                FROM inventory_reservations reservation
                LEFT JOIN inventory_units unit ON unit.id = reservation.inventory_unit_id
                LEFT JOIN stock_levels stock ON stock.id = reservation.stock_level_id
                WHERE reservation.order_id = pickup_order.id
                  AND reservation.order_item_id = item.id
                  AND reservation.status = 'ACTIVE'
                  AND reservation.hold_reason = 'PICKUP'
                  AND reservation.expires_at = pickup_order.pickup_hold_until
                  AND (
                    (item.inventory_unit_id IS NOT NULL
                      AND reservation.inventory_unit_id = item.inventory_unit_id
                      AND reservation.stock_level_id IS NULL
                      AND reservation.quantity = 1
                      AND unit.variant_id = item.variant_id
                      AND unit.location_id = pickup_order.fulfillment_location_id)
                    OR (item.inventory_unit_id IS NULL
                      AND reservation.inventory_unit_id IS NULL
                      AND reservation.stock_level_id IS NOT NULL
                      AND reservation.quantity = item.quantity
                      AND stock.variant_id = item.variant_id
                      AND stock.location_id = pickup_order.fulfillment_location_id)
                  )
              ) <> 1
          )
        ))
        OR (pickup_order.status IN ('COMPLETED', 'CANCELLED') AND EXISTS (
          SELECT 1
          FROM inventory_reservations reservation
          WHERE reservation.order_id = pickup_order.id
            AND reservation.status = 'ACTIVE'
        ))
      )
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
    SELECT 'stock_movements_sale_reservation_alignment', COUNT(*)::int
    FROM stock_movements movement
    LEFT JOIN inventory_reservations reservation
      ON reservation.id = movement.reference_id
      AND movement.reference_type = 'INVENTORY_RESERVATION'
    LEFT JOIN order_items item ON item.id = reservation.order_item_id
    LEFT JOIN orders sale_order ON sale_order.id = reservation.order_id
    LEFT JOIN stock_levels stock ON stock.id = reservation.stock_level_id
    LEFT JOIN users staff ON staff.id = movement.created_by_id
    WHERE movement.type = 'SALE'
      AND (
        reservation.id IS NOT NULL
        AND reservation.order_id = item.order_id
        AND reservation.status = 'CONSUMED'
        AND reservation.inventory_unit_id IS NULL
        AND reservation.stock_level_id IS NOT NULL
        AND reservation.quantity = item.quantity
        AND movement.variant_id = item.variant_id
        AND movement.variant_id = stock.variant_id
        AND movement.from_location_id = sale_order.fulfillment_location_id
        AND movement.from_location_id = stock.location_id
        AND movement.to_location_id IS NULL
        AND movement.quantity = reservation.quantity
        AND staff.role IN ('EMPLOYEE', 'ADMIN')
      ) IS NOT TRUE
    UNION ALL
    SELECT 'warranties_interval_check', COUNT(*)::int
    FROM warranties
    WHERE (
      days_snapshot > 0
      AND end_at = start_at + (days_snapshot * INTERVAL '1 day')
      AND NULLIF(BTRIM(terms_snapshot), '') IS NOT NULL
    ) IS NOT TRUE
    UNION ALL
    SELECT 'warranties_code_shape_check', COUNT(*)::int
    FROM warranties
    WHERE warranty_code !~ '^RPH-W-[0-9]{8}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'
    UNION ALL
    SELECT 'completed_pickup_finance_projection', COUNT(*)::int
    FROM orders completed_order
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(COALESCE(payment.received_amount, payment.expected_amount)), 0) AS paid
      FROM payments payment
      WHERE payment.order_id = completed_order.id
        AND payment.status = 'VERIFIED'
    ) payment_total ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(refund.amount), 0) AS refunded
      FROM refunds refund
      WHERE refund.order_id = completed_order.id
        AND refund.status = 'COMPLETED'
    ) refund_total ON TRUE
    WHERE completed_order.fulfillment_type = 'PICKUP'
      AND completed_order.status = 'COMPLETED'
      AND (
        completed_order.paid_amount = payment_total.paid
        AND completed_order.refunded_amount = refund_total.refunded
        AND completed_order.balance_due = GREATEST(
          completed_order.grand_total - payment_total.paid,
          0
        )
        AND payment_total.paid >= completed_order.grand_total
        AND completed_order.payment_status = CASE
          WHEN refund_total.refunded > 0 AND refund_total.refunded >= payment_total.paid
            THEN 'REFUNDED'::"OrderPaymentStatus"
          WHEN refund_total.refunded > 0 THEN 'PARTIALLY_REFUNDED'::"OrderPaymentStatus"
          ELSE 'PAID'::"OrderPaymentStatus"
        END
      ) IS NOT TRUE
    UNION ALL
    SELECT 'completed_pickup_inventory_consumption', COUNT(*)::int
    FROM orders completed_order
    WHERE completed_order.fulfillment_type = 'PICKUP'
      AND completed_order.status = 'COMPLETED'
      AND (
        NOT EXISTS (
          SELECT 1 FROM order_items item WHERE item.order_id = completed_order.id
        )
        OR EXISTS (
          SELECT 1
          FROM inventory_reservations reservation
          WHERE reservation.order_id = completed_order.id
            AND reservation.status <> 'CONSUMED'
        )
        OR EXISTS (
          SELECT 1
          FROM order_items item
          WHERE item.order_id = completed_order.id
            AND (
              SELECT COUNT(*)
              FROM inventory_reservations reservation
              LEFT JOIN inventory_units unit ON unit.id = reservation.inventory_unit_id
              LEFT JOIN stock_levels stock ON stock.id = reservation.stock_level_id
              WHERE reservation.order_id = completed_order.id
                AND reservation.order_item_id = item.id
                AND reservation.status = 'CONSUMED'
                AND reservation.hold_reason = 'PICKUP'
                AND reservation.expires_at IS NOT DISTINCT FROM completed_order.pickup_hold_until
                AND reservation.consumed_at = completed_order.completed_at
                AND (
                  (item.inventory_unit_id IS NOT NULL
                    AND reservation.inventory_unit_id = item.inventory_unit_id
                    AND reservation.stock_level_id IS NULL
                    AND reservation.quantity = 1
                    AND unit.variant_id = item.variant_id
                    AND unit.location_id = completed_order.fulfillment_location_id
                    AND unit.lifecycle_status = 'SOLD'
                    AND unit.sold_at = completed_order.completed_at
                    AND NOT EXISTS (
                      SELECT 1
                      FROM stock_movements movement
                      WHERE movement.type = 'SALE'
                        AND movement.reference_type = 'INVENTORY_RESERVATION'
                        AND movement.reference_id = reservation.id
                    ))
                  OR (item.inventory_unit_id IS NULL
                    AND reservation.inventory_unit_id IS NULL
                    AND reservation.stock_level_id IS NOT NULL
                    AND reservation.quantity = item.quantity
                    AND stock.variant_id = item.variant_id
                    AND stock.location_id = completed_order.fulfillment_location_id
                    AND (
                      SELECT COUNT(*)
                      FROM stock_movements movement
                      WHERE movement.type = 'SALE'
                        AND movement.reference_type = 'INVENTORY_RESERVATION'
                        AND movement.reference_id = reservation.id
                        AND movement.variant_id = item.variant_id
                        AND movement.from_location_id = completed_order.fulfillment_location_id
                        AND movement.to_location_id IS NULL
                        AND movement.quantity = reservation.quantity
                    ) = 1)
                )
            ) <> 1
        )
      )
    UNION ALL
    SELECT 'completed_pickup_voucher_consumption', COUNT(*)::int
    FROM orders completed_order
    JOIN voucher_usages usage ON usage.order_id = completed_order.id
    WHERE completed_order.fulfillment_type = 'PICKUP'
      AND completed_order.status = 'COMPLETED'
      AND usage.status <> 'CONSUMED'
    UNION ALL
    SELECT 'completed_pickup_warranty_issuance', COUNT(*)::int
    FROM order_items item
    JOIN orders completed_order ON completed_order.id = item.order_id
    LEFT JOIN warranties warranty ON warranty.order_item_id = item.id
    WHERE completed_order.fulfillment_type = 'PICKUP'
      AND completed_order.status = 'COMPLETED'
      AND (
        (item.warranty_days_snapshot = 0 AND warranty.id IS NULL)
        OR (item.warranty_days_snapshot > 0
          AND warranty.id IS NOT NULL
          AND warranty.warranty_code ~ '^RPH-W-[0-9]{8}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'
          AND warranty.customer_id IS NOT DISTINCT FROM completed_order.customer_id
          AND warranty.inventory_unit_id IS NOT DISTINCT FROM item.inventory_unit_id
          AND warranty.policy_id IS NULL
          AND warranty.days_snapshot = item.warranty_days_snapshot
          AND warranty.terms_snapshot = item.warranty_terms_snapshot
          AND warranty.start_at = completed_order.completed_at
          AND warranty.end_at = completed_order.completed_at
            + (item.warranty_days_snapshot * INTERVAL '1 day'))
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
