import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';

export interface Slice09PreflightViolationCount {
  checkName: string;
  count: number;
}

export function findSlice09PreflightViolations(
  prisma: PrismaClient,
): Promise<Slice09PreflightViolationCount[]> {
  return prisma.$queryRaw<Slice09PreflightViolationCount[]>`
    SELECT 'orders_shipping_lifecycle_check' AS "checkName", COUNT(*)::int AS count
    FROM orders
    WHERE fulfillment_type = 'SHIPPING'
      AND (
        (status = 'PLACED' AND fulfillment_status = 'PENDING')
        OR (status = 'CONFIRMED' AND fulfillment_status = 'PENDING')
        OR (status = 'PROCESSING' AND fulfillment_status IN (
          'PREPARING', 'IN_TRANSIT', 'FAILED', 'RETURNED'
        ))
        OR (status = 'COMPLETED' AND fulfillment_status = 'COMPLETED')
        OR (status = 'CANCELLED' AND fulfillment_status = 'CANCELLED')
      ) IS NOT TRUE
    UNION ALL
    SELECT 'orders_shipping_override_check', COUNT(*)::int
    FROM orders
    WHERE (
      (NUM_NONNULLS(
        shipping_fee_override_reason,
        shipping_fee_overridden_by_id,
        shipping_fee_overridden_at
      ) = 0 AND shipping_fee = shipping_fee_original)
      OR (fulfillment_type = 'SHIPPING'
        AND NUM_NONNULLS(
          shipping_fee_override_reason,
          shipping_fee_overridden_by_id,
          shipping_fee_overridden_at
        ) = 3
        AND NULLIF(BTRIM(shipping_fee_override_reason), '') IS NOT NULL
        AND shipping_fee_overridden_at >= placed_at)
    ) IS NOT TRUE
    UNION ALL
    SELECT 'payments_checkout_deposit_check', COUNT(*)::int
    FROM payments
    WHERE method = 'BANK_TRANSFER'
      AND purpose = 'DEPOSIT'
      AND NOT (
        expected_amount > 0
        OR (status = 'CANCELLED' AND expected_amount = 0)
      )
    UNION ALL
    SELECT 'payments_cod_fulfillment_check', COUNT(*)::int
    FROM payments
    WHERE method = 'COD'
      AND (
        purpose = 'BALANCE'
        AND status = 'VERIFIED'
        AND expected_amount > 0
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
    SELECT 'payments_one_cod_balance_per_order', COUNT(*)::int
    FROM (
      SELECT order_id
      FROM payments
      WHERE method = 'COD' AND purpose = 'BALANCE'
      GROUP BY order_id
      HAVING COUNT(*) > 1
    ) AS duplicate_cod_payments
    UNION ALL
    SELECT 'shipments_shape_check', COUNT(*)::int
    FROM shipments
    WHERE (
      NULLIF(BTRIM(carrier_name), '') IS NOT NULL
      AND NULLIF(BTRIM(tracking_code), '') IS NOT NULL
      AND (tracking_url IS NULL OR tracking_url ~ '^https://[^[:space:]]+$')
    ) IS NOT TRUE
    UNION ALL
    SELECT 'shipments_status_timestamp_check', COUNT(*)::int
    FROM shipments
    WHERE (
      (status = 'CREATED'
        AND shipped_at IS NULL AND delivered_at IS NULL AND failed_at IS NULL
        AND returned_at IS NULL AND failure_reason IS NULL
        AND returned_to_location_id IS NULL AND return_note IS NULL)
      OR (status = 'HANDED_TO_CARRIER'
        AND shipped_at IS NOT NULL AND shipped_at >= created_at
        AND delivered_at IS NULL AND failed_at IS NULL AND returned_at IS NULL
        AND failure_reason IS NULL AND returned_to_location_id IS NULL
        AND return_note IS NULL)
      OR (status = 'DELIVERED'
        AND shipped_at IS NOT NULL AND delivered_at IS NOT NULL
        AND shipped_at >= created_at AND delivered_at >= shipped_at
        AND failed_at IS NULL AND returned_at IS NULL AND failure_reason IS NULL
        AND returned_to_location_id IS NULL AND return_note IS NULL)
      OR (status = 'FAILED'
        AND shipped_at IS NOT NULL AND failed_at IS NOT NULL
        AND shipped_at >= created_at AND failed_at >= shipped_at
        AND delivered_at IS NULL AND returned_at IS NULL
        AND NULLIF(BTRIM(failure_reason), '') IS NOT NULL
        AND returned_to_location_id IS NULL AND return_note IS NULL)
      OR (status = 'RETURNED'
        AND shipped_at IS NOT NULL AND failed_at IS NOT NULL AND returned_at IS NOT NULL
        AND shipped_at >= created_at AND failed_at >= shipped_at
        AND returned_at >= failed_at AND delivered_at IS NULL
        AND NULLIF(BTRIM(failure_reason), '') IS NOT NULL
        AND returned_to_location_id IS NOT NULL
        AND NULLIF(BTRIM(return_note), '') IS NOT NULL)
      OR (status = 'CANCELLED'
        AND shipped_at IS NULL AND delivered_at IS NULL AND failed_at IS NULL
        AND returned_at IS NULL AND failure_reason IS NULL
        AND returned_to_location_id IS NULL AND return_note IS NULL)
    ) IS NOT TRUE
    UNION ALL
    SELECT 'shipments_shipping_order_alignment', COUNT(*)::int
    FROM shipments shipment
    JOIN orders shipping_order ON shipping_order.id = shipment.order_id
    JOIN users creator ON creator.id = shipment.created_by_id
    WHERE (
      shipping_order.fulfillment_type = 'SHIPPING'
      AND shipment.attempt_number = 1
      AND creator.role IN ('EMPLOYEE', 'ADMIN')
      AND (
        (shipment.status = 'CREATED'
          AND shipping_order.status = 'PROCESSING'
          AND shipping_order.fulfillment_status = 'PREPARING')
        OR (shipment.status = 'HANDED_TO_CARRIER'
          AND shipping_order.status = 'PROCESSING'
          AND shipping_order.fulfillment_status = 'IN_TRANSIT')
        OR (shipment.status = 'DELIVERED'
          AND shipping_order.status = 'COMPLETED'
          AND shipping_order.fulfillment_status = 'COMPLETED'
          AND shipment.delivered_at = shipping_order.completed_at)
        OR (shipment.status = 'FAILED'
          AND shipping_order.status = 'PROCESSING'
          AND shipping_order.fulfillment_status = 'FAILED')
        OR (shipment.status = 'RETURNED'
          AND shipping_order.status = 'PROCESSING'
          AND shipping_order.fulfillment_status = 'RETURNED')
        OR (shipment.status = 'CANCELLED'
          AND shipping_order.status = 'CANCELLED'
          AND shipping_order.fulfillment_status = 'CANCELLED')
      )
      ) IS NOT TRUE
    UNION ALL
    SELECT 'shipping_order_shipment_mirror', COUNT(*)::int
    FROM orders shipping_order
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) AS shipment_count,
        COUNT(*) FILTER (WHERE shipment.status = 'CREATED') AS created_count,
        COUNT(*) FILTER (WHERE shipment.status = 'HANDED_TO_CARRIER') AS handed_count,
        COUNT(*) FILTER (WHERE shipment.status = 'DELIVERED') AS delivered_count,
        COUNT(*) FILTER (WHERE shipment.status = 'FAILED') AS failed_count,
        COUNT(*) FILTER (WHERE shipment.status = 'RETURNED') AS returned_count,
        COUNT(*) FILTER (WHERE shipment.status = 'CANCELLED') AS cancelled_count
      FROM shipments shipment
      WHERE shipment.order_id = shipping_order.id
    ) shipment_summary ON TRUE
    WHERE shipping_order.fulfillment_type = 'SHIPPING'
      AND (
        (shipping_order.status IN ('PLACED', 'CONFIRMED')
          AND shipment_summary.shipment_count = 0)
        OR (shipping_order.status = 'PROCESSING'
          AND shipping_order.fulfillment_status = 'PREPARING'
          AND shipment_summary.shipment_count IN (0, 1)
          AND shipment_summary.created_count = shipment_summary.shipment_count)
        OR (shipping_order.status = 'PROCESSING'
          AND shipping_order.fulfillment_status = 'IN_TRANSIT'
          AND shipment_summary.shipment_count = 1
          AND shipment_summary.handed_count = 1)
        OR (shipping_order.status = 'PROCESSING'
          AND shipping_order.fulfillment_status = 'FAILED'
          AND shipment_summary.shipment_count = 1
          AND shipment_summary.failed_count = 1)
        OR (shipping_order.status = 'PROCESSING'
          AND shipping_order.fulfillment_status = 'RETURNED'
          AND shipment_summary.shipment_count = 1
          AND shipment_summary.returned_count = 1)
        OR (shipping_order.status = 'COMPLETED'
          AND shipment_summary.shipment_count = 1
          AND shipment_summary.delivered_count = 1)
        OR (shipping_order.status = 'CANCELLED'
          AND shipment_summary.cancelled_count = shipment_summary.shipment_count)
      ) IS NOT TRUE
    UNION ALL
    SELECT 'shipments_return_location_check', COUNT(*)::int
    FROM shipments shipment
    LEFT JOIN inventory_locations return_location
      ON return_location.id = shipment.returned_to_location_id
    WHERE shipment.status = 'RETURNED'
      AND (
        return_location.id IS NOT NULL
        AND return_location.status = 'ACTIVE'
        AND return_location.type IN ('STORE', 'WAREHOUSE')
      ) IS NOT TRUE
    UNION ALL
    SELECT 'shipping_handover_finance_confirmation', COUNT(*)::int
    FROM shipments shipment
    JOIN orders shipping_order ON shipping_order.id = shipment.order_id
    WHERE shipment.status IN ('HANDED_TO_CARRIER', 'DELIVERED', 'FAILED', 'RETURNED')
      AND NOT (
        shipping_order.deposit_required = 0
        OR EXISTS (
          SELECT 1
          FROM payments payment
          WHERE payment.order_id = shipping_order.id
            AND payment.purpose = 'DEPOSIT'
            AND payment.method = 'BANK_TRANSFER'
            AND payment.status = 'VERIFIED'
            AND payment.received_amount >= shipping_order.deposit_required
        )
      )
    UNION ALL
    SELECT 'completed_shipping_finance_projection', COUNT(*)::int
    FROM orders completed_order
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(COALESCE(payment.received_amount, payment.expected_amount)), 0) AS paid
      FROM payments payment
      WHERE payment.order_id = completed_order.id AND payment.status = 'VERIFIED'
    ) payment_total ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(refund.amount), 0) AS refunded
      FROM refunds refund
      WHERE refund.order_id = completed_order.id AND refund.status = 'COMPLETED'
    ) refund_total ON TRUE
    WHERE completed_order.fulfillment_type = 'SHIPPING'
      AND completed_order.status = 'COMPLETED'
      AND (
        completed_order.fulfillment_status = 'COMPLETED'
        AND completed_order.paid_amount = payment_total.paid
        AND completed_order.refunded_amount = refund_total.refunded
        AND completed_order.balance_due = GREATEST(completed_order.grand_total - payment_total.paid, 0)
        AND payment_total.paid >= completed_order.grand_total
        AND completed_order.payment_status = CASE
          WHEN refund_total.refunded > 0 AND refund_total.refunded >= payment_total.paid
            THEN 'REFUNDED'::"OrderPaymentStatus"
          WHEN refund_total.refunded > 0 THEN 'PARTIALLY_REFUNDED'::"OrderPaymentStatus"
          ELSE 'PAID'::"OrderPaymentStatus"
        END
      ) IS NOT TRUE
    UNION ALL
    SELECT 'shipping_handover_inventory_consumption', COUNT(*)::int
    FROM shipments shipment
    JOIN orders shipping_order ON shipping_order.id = shipment.order_id
    WHERE shipment.status IN ('HANDED_TO_CARRIER', 'DELIVERED', 'FAILED', 'RETURNED')
      AND (
        NOT EXISTS (SELECT 1 FROM order_items item WHERE item.order_id = shipping_order.id)
        OR EXISTS (
          SELECT 1
          FROM order_items item
          WHERE item.order_id = shipping_order.id
            AND (
              SELECT COUNT(*)
              FROM inventory_reservations reservation
              LEFT JOIN inventory_units unit ON unit.id = reservation.inventory_unit_id
              LEFT JOIN stock_levels stock ON stock.id = reservation.stock_level_id
              WHERE reservation.order_id = shipping_order.id
                AND reservation.order_item_id = item.id
                AND reservation.status = 'CONSUMED'
                AND reservation.hold_reason = 'FULFILLMENT'
                AND reservation.expires_at IS NULL
                AND reservation.consumed_at = shipment.shipped_at
                AND (
                  (item.inventory_unit_id IS NOT NULL
                    AND reservation.inventory_unit_id = item.inventory_unit_id
                    AND reservation.stock_level_id IS NULL
                    AND reservation.quantity = 1
                    AND unit.variant_id = item.variant_id
                    AND (
                      (shipment.status IN ('HANDED_TO_CARRIER', 'FAILED')
                        AND unit.lifecycle_status = 'IN_TRANSIT')
                      OR (shipment.status = 'DELIVERED'
                        AND unit.lifecycle_status = 'SOLD'
                        AND unit.sold_at = shipment.delivered_at)
                      OR (shipment.status = 'RETURNED'
                        AND unit.lifecycle_status = 'INSPECTING'
                        AND unit.location_id = shipment.returned_to_location_id)
                    )
                    AND NOT EXISTS (
                      SELECT 1 FROM stock_movements movement
                      WHERE movement.type = 'SALE'
                        AND movement.reference_type = 'INVENTORY_RESERVATION'
                        AND movement.reference_id = reservation.id
                    ))
                  OR (item.inventory_unit_id IS NULL
                    AND reservation.inventory_unit_id IS NULL
                    AND reservation.stock_level_id IS NOT NULL
                    AND reservation.quantity = item.quantity
                    AND stock.variant_id = item.variant_id
                    AND stock.location_id = shipping_order.fulfillment_location_id
                    AND (
                      SELECT COUNT(*) FROM stock_movements movement
                      WHERE movement.type = 'SALE'
                        AND movement.reference_type = 'INVENTORY_RESERVATION'
                        AND movement.reference_id = reservation.id
                        AND movement.variant_id = item.variant_id
                        AND movement.from_location_id = shipping_order.fulfillment_location_id
                        AND movement.to_location_id IS NULL
                        AND movement.quantity = reservation.quantity
                    ) = 1)
                )
            ) <> 1
        )
      )
    UNION ALL
    SELECT 'completed_shipping_voucher_consumption', COUNT(*)::int
    FROM orders completed_order
    JOIN voucher_usages usage ON usage.order_id = completed_order.id
    WHERE completed_order.fulfillment_type = 'SHIPPING'
      AND completed_order.status = 'COMPLETED'
      AND usage.status <> 'CONSUMED'
    UNION ALL
    SELECT 'completed_shipping_warranty_issuance', COUNT(*)::int
    FROM order_items item
    JOIN orders completed_order ON completed_order.id = item.order_id
    LEFT JOIN warranties warranty ON warranty.order_item_id = item.id
    WHERE completed_order.fulfillment_type = 'SHIPPING'
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
    UNION ALL
    SELECT 'stock_movements_shipment_return_reference_check', COUNT(*)::int
    FROM stock_movements
    WHERE type = 'RETURN' AND reference_type = 'SHIPMENT'
      AND (
        reference_id IS NOT NULL
        AND from_location_id IS NULL
        AND to_location_id IS NOT NULL
        AND created_by_id IS NOT NULL
        AND NULLIF(BTRIM(reason), '') IS NOT NULL
      ) IS NOT TRUE
    UNION ALL
    SELECT 'stock_movements_one_return_per_shipment_variant', COUNT(*)::int
    FROM (
      SELECT reference_id, variant_id
      FROM stock_movements
      WHERE type = 'RETURN'
        AND reference_type = 'SHIPMENT'
        AND reference_id IS NOT NULL
      GROUP BY reference_id, variant_id
      HAVING COUNT(*) > 1
    ) AS duplicate_shipment_returns
    UNION ALL
    SELECT 'stock_movements_shipment_return_alignment', COUNT(*)::int
    FROM stock_movements movement
    LEFT JOIN shipments shipment ON shipment.id = movement.reference_id
    LEFT JOIN orders shipping_order ON shipping_order.id = shipment.order_id
    LEFT JOIN inventory_locations return_location ON return_location.id = movement.to_location_id
    LEFT JOIN users staff ON staff.id = movement.created_by_id
    WHERE movement.type = 'RETURN' AND movement.reference_type = 'SHIPMENT'
      AND (
        shipment.id IS NOT NULL
        AND shipment.status = 'RETURNED'
        AND shipping_order.fulfillment_type = 'SHIPPING'
        AND movement.to_location_id = shipment.returned_to_location_id
        AND return_location.status = 'ACTIVE'
        AND return_location.type IN ('STORE', 'WAREHOUSE')
        AND staff.role IN ('EMPLOYEE', 'ADMIN')
        AND EXISTS (
          SELECT 1 FROM order_items item
          WHERE item.order_id = shipping_order.id
            AND item.variant_id = movement.variant_id
            AND item.inventory_unit_id IS NULL
            AND item.quantity = movement.quantity
        )
      ) IS NOT TRUE
  `;
}

async function runSlice09Preflight(): Promise<void> {
  loadWorkspaceEnvironment();
  const connectionString = requiredEnvironment('DATABASE_URL');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const violations = await findSlice09PreflightViolations(prisma);
    const failed = violations.filter(({ count }) => count > 0);
    process.stdout.write(`${JSON.stringify({ checks: violations }, null, 2)}\n`);
    if (failed.length > 0) {
      throw new Error(`Slice 09 preflight found ${failed.length.toString()} violated invariant(s)`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for the Slice 09 preflight`);
  }
  return value;
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && import.meta.url === pathToFileURL(resolve(entrypoint)).href;
}

if (isMainModule()) {
  await runSlice09Preflight();
}
