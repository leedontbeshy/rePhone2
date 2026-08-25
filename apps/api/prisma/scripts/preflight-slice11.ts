import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';

export interface Slice11PreflightViolationCount {
  checkName: string;
  count: number;
}

export function findSlice11PreflightViolations(
  prisma: PrismaClient,
  configuredPrivateBucket: string,
): Promise<Slice11PreflightViolationCount[]> {
  return prisma.$queryRaw<Slice11PreflightViolationCount[]>`
    SELECT 'warranty_policies_values_check' AS "checkName", COUNT(*)::int AS count
    FROM warranty_policies
    WHERE (
      CHAR_LENGTH(BTRIM(code)) BETWEEN 1 AND 64
      AND code = UPPER(BTRIM(code))
      AND CHAR_LENGTH(BTRIM(name)) BETWEEN 1 AND 255
      AND default_days BETWEEN 0 AND 3650
      AND CHAR_LENGTH(BTRIM(terms)) BETWEEN 1 AND 10000
    ) IS NOT TRUE
    UNION ALL
    SELECT 'warranty_policies_lifecycle_check', COUNT(*)::int
    FROM warranty_policies
    WHERE (archived_at IS NULL OR status = 'INACTIVE') IS NOT TRUE
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
    SELECT 'warranties_void_check', COUNT(*)::int
    FROM warranties
    WHERE (
      (status = 'ACTIVE'
        AND void_reason IS NULL AND voided_by_id IS NULL AND voided_at IS NULL)
      OR (status = 'VOIDED'
        AND CHAR_LENGTH(BTRIM(void_reason)) BETWEEN 5 AND 500
        AND voided_by_id IS NOT NULL
        AND voided_at IS NOT NULL
        AND voided_at >= start_at)
    ) IS NOT TRUE
    UNION ALL
    SELECT 'warranties_order_item_alignment', COUNT(*)::int
    FROM warranties warranty
    JOIN order_items item ON item.id = warranty.order_item_id
    JOIN orders warranty_order ON warranty_order.id = item.order_id
    WHERE (
      warranty.customer_id IS NOT DISTINCT FROM warranty_order.customer_id
      AND (
        warranty.inventory_unit_id IS NOT DISTINCT FROM item.inventory_unit_id
        OR EXISTS (
          SELECT 1
          FROM after_sales_requests request
          WHERE request.order_item_id = item.id
            AND request.warranty_id = warranty.id
            AND request.status = 'RESOLVED'
            AND request.resolution_type = 'REPLACED'
            AND request.replacement_inventory_unit_id = warranty.inventory_unit_id
        )
      )
    ) IS NOT TRUE
    UNION ALL
    SELECT 'after_sales_requests_values_check', COUNT(*)::int
    FROM after_sales_requests request
    WHERE (
      request_number ~ '^RPH-AS-[0-9]{8}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$'
      AND CHAR_LENGTH(BTRIM(issue_description)) BETWEEN 10 AND 2000
      AND (requested_resolution IS NULL
        OR CHAR_LENGTH(BTRIM(requested_resolution)) BETWEEN 1 AND 500)
      AND ((TO_JSONB(request) ->> 'receive_note') IS NULL
        OR CHAR_LENGTH(BTRIM(TO_JSONB(request) ->> 'receive_note')) BETWEEN 5 AND 1000)
      AND (inspection_summary IS NULL
        OR CHAR_LENGTH(BTRIM(inspection_summary)) BETWEEN 10 AND 2000)
      AND (decision_note IS NULL
        OR CHAR_LENGTH(BTRIM(decision_note)) BETWEEN 5 AND 2000)
      AND (resolution_note IS NULL
        OR CHAR_LENGTH(BTRIM(resolution_note)) BETWEEN 5 AND 2000)
      AND (return_note IS NULL
        OR CHAR_LENGTH(BTRIM(return_note)) BETWEEN 5 AND 1000)
      AND (cancel_reason IS NULL
        OR CHAR_LENGTH(BTRIM(cancel_reason)) BETWEEN 5 AND 500)
      AND requested_at >= created_at
    ) IS NOT TRUE
    UNION ALL
    SELECT 'after_sales_requests_attachment_check', COUNT(*)::int
    FROM after_sales_requests request
    WHERE request.attachments IS NOT NULL
      AND (
        JSONB_TYPEOF(request.attachments) <> 'array'
        OR JSONB_ARRAY_LENGTH(request.attachments) > 5
        OR EXISTS (
          SELECT 1
          FROM JSONB_ARRAY_ELEMENTS(request.attachments) AS attachment(value)
          WHERE (
            JSONB_TYPEOF(attachment.value) = 'object'
            AND attachment.value ->> 'id' ~ '^[0-9a-fA-F-]{36}$'
            AND attachment.value ->> 'bucket' = ${configuredPrivateBucket}
            AND attachment.value ->> 'objectPath'
              ~ ('^after-sales/' || request.id::text || '/[^/]+$')
            AND attachment.value ->> 'mimeType' IN (
              'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
            )
            AND attachment.value ->> 'fileSize' ~ '^[0-9]+$'
            AND (attachment.value ->> 'fileSize')::bigint BETWEEN 1 AND 10485760
            AND attachment.value ->> 'uploadedByType' IN ('USER', 'GUEST')
            AND (
              (attachment.value ->> 'uploadedByType' = 'USER'
                AND NULLIF(attachment.value ->> 'uploadedById', '') IS NOT NULL)
              OR (attachment.value ->> 'uploadedByType' = 'GUEST'
                AND attachment.value ->> 'uploadedById' IS NULL)
            )
            AND NULLIF(attachment.value ->> 'uploadedAt', '') IS NOT NULL
          ) IS NOT TRUE
        )
      )
    UNION ALL
    SELECT 'after_sales_requests_warranty_type_check', COUNT(*)::int
    FROM after_sales_requests
    WHERE (
      (type = 'WARRANTY' AND warranty_id IS NOT NULL)
      OR (type IN ('RETURN', 'EXCHANGE') AND warranty_id IS NULL)
    ) IS NOT TRUE
    UNION ALL
    SELECT 'after_sales_requests_resolution_reference_check', COUNT(*)::int
    FROM after_sales_requests
    WHERE (
      (resolution_type = 'REPLACED'
        AND replacement_inventory_unit_id IS NOT NULL AND refund_id IS NULL)
      OR (resolution_type = 'REFUNDED'
        AND replacement_inventory_unit_id IS NULL AND refund_id IS NOT NULL)
      OR (resolution_type IS NULL
        AND replacement_inventory_unit_id IS NULL AND refund_id IS NULL)
      OR (resolution_type IN ('REPAIRED', 'RETURNED_UNCHANGED', 'OTHER')
        AND replacement_inventory_unit_id IS NULL AND refund_id IS NULL)
    ) IS NOT TRUE
    UNION ALL
    SELECT 'after_sales_requests_status_check', COUNT(*)::int
    FROM after_sales_requests request
    WHERE (
      (status = 'REQUESTED'
        AND NUM_NONNULLS(received_location_id, received_by_id, received_at) = 0
        AND (TO_JSONB(request) ->> 'receive_note') IS NULL
        AND inspected_at IS NULL AND inspection_summary IS NULL
        AND inventory_inspection_id IS NULL
        AND NUM_NONNULLS(decision_note, decided_by_id, decided_at) = 0
        AND NUM_NONNULLS(resolution_type, resolution_note, resolved_by_id, resolved_at) = 0
        AND NUM_NONNULLS(replacement_inventory_unit_id, refund_id) = 0
        AND NUM_NONNULLS(return_note, returned_at) = 0
        AND NUM_NONNULLS(cancel_reason, cancelled_at) = 0)
      OR (status = 'RECEIVED'
        AND NUM_NONNULLS(received_location_id, received_by_id, received_at) = 3
        AND received_at >= requested_at
        AND inspected_at IS NULL AND inspection_summary IS NULL
        AND inventory_inspection_id IS NULL
        AND NUM_NONNULLS(decision_note, decided_by_id, decided_at) = 0
        AND NUM_NONNULLS(resolution_type, resolution_note, resolved_by_id, resolved_at) = 0
        AND NUM_NONNULLS(replacement_inventory_unit_id, refund_id) = 0
        AND NUM_NONNULLS(return_note, returned_at) = 0
        AND NUM_NONNULLS(cancel_reason, cancelled_at) = 0)
      OR (status = 'INSPECTING'
        AND NUM_NONNULLS(received_location_id, received_by_id, received_at) = 3
        AND received_at >= requested_at
        AND inspected_at IS NOT NULL AND inspected_at >= received_at
        AND NUM_NONNULLS(decision_note, decided_by_id, decided_at) = 0
        AND NUM_NONNULLS(resolution_type, resolution_note, resolved_by_id, resolved_at) = 0
        AND NUM_NONNULLS(replacement_inventory_unit_id, refund_id) = 0
        AND NUM_NONNULLS(return_note, returned_at) = 0
        AND NUM_NONNULLS(cancel_reason, cancelled_at) = 0)
      OR (status = 'APPROVED'
        AND NUM_NONNULLS(received_location_id, received_by_id, received_at) = 3
        AND received_at >= requested_at
        AND inspected_at IS NOT NULL AND inspected_at >= received_at
        AND NUM_NONNULLS(decision_note, decided_by_id, decided_at) = 3
        AND decided_at >= inspected_at
        AND NUM_NONNULLS(resolution_type, resolution_note, resolved_by_id, resolved_at) = 0
        AND NUM_NONNULLS(replacement_inventory_unit_id, refund_id) = 0
        AND NUM_NONNULLS(return_note, returned_at) = 0
        AND NUM_NONNULLS(cancel_reason, cancelled_at) = 0)
      OR (status = 'REJECTED'
        AND NUM_NONNULLS(received_location_id, received_by_id, received_at) = 3
        AND received_at >= requested_at
        AND inspected_at IS NOT NULL AND inspected_at >= received_at
        AND NUM_NONNULLS(decision_note, decided_by_id, decided_at) = 3
        AND decided_at >= inspected_at
        AND NUM_NONNULLS(resolution_type, resolution_note, resolved_by_id, resolved_at) = 0
        AND NUM_NONNULLS(replacement_inventory_unit_id, refund_id) = 0
        AND NUM_NONNULLS(return_note, returned_at) IN (0, 2)
        AND (returned_at IS NULL OR returned_at >= decided_at)
        AND NUM_NONNULLS(cancel_reason, cancelled_at) = 0)
      OR (status = 'RESOLVED'
        AND NUM_NONNULLS(received_location_id, received_by_id, received_at) = 3
        AND received_at >= requested_at
        AND inspected_at IS NOT NULL AND inspected_at >= received_at
        AND NUM_NONNULLS(decision_note, decided_by_id, decided_at) = 3
        AND decided_at >= inspected_at
        AND NUM_NONNULLS(resolution_type, resolution_note, resolved_by_id, resolved_at) = 4
        AND resolved_at >= decided_at
        AND NUM_NONNULLS(return_note, returned_at) IN (0, 2)
        AND (returned_at IS NULL
          OR (returned_at >= decided_at AND returned_at <= resolved_at))
        AND NUM_NONNULLS(cancel_reason, cancelled_at) = 0)
      OR (status = 'CANCELLED'
        AND NUM_NONNULLS(received_location_id, received_by_id, received_at) = 0
        AND (TO_JSONB(request) ->> 'receive_note') IS NULL
        AND inspected_at IS NULL AND inspection_summary IS NULL
        AND inventory_inspection_id IS NULL
        AND NUM_NONNULLS(decision_note, decided_by_id, decided_at) = 0
        AND NUM_NONNULLS(resolution_type, resolution_note, resolved_by_id, resolved_at) = 0
        AND NUM_NONNULLS(replacement_inventory_unit_id, refund_id) = 0
        AND NUM_NONNULLS(return_note, returned_at) = 0
        AND NUM_NONNULLS(cancel_reason, cancelled_at) = 2
        AND cancelled_at >= requested_at)
    ) IS NOT TRUE
    UNION ALL
    SELECT 'after_sales_requests_one_open_per_order_item', COUNT(*)::int
    FROM (
      SELECT order_item_id
      FROM after_sales_requests
      WHERE status IN ('REQUESTED', 'RECEIVED', 'INSPECTING', 'APPROVED')
      GROUP BY order_item_id
      HAVING COUNT(*) > 1
    ) duplicate_open_requests
    UNION ALL
    SELECT 'after_sales_requests_one_per_inventory_inspection', COUNT(*)::int
    FROM (
      SELECT inventory_inspection_id
      FROM after_sales_requests
      WHERE inventory_inspection_id IS NOT NULL
      GROUP BY inventory_inspection_id
      HAVING COUNT(*) > 1
    ) duplicate_inspections
    UNION ALL
    SELECT 'after_sales_requests_one_per_refund', COUNT(*)::int
    FROM (
      SELECT refund_id
      FROM after_sales_requests
      WHERE refund_id IS NOT NULL
      GROUP BY refund_id
      HAVING COUNT(*) > 1
    ) duplicate_refunds
    UNION ALL
    SELECT 'after_sales_requests_order_warranty_alignment', COUNT(*)::int
    FROM after_sales_requests request
    JOIN order_items item ON item.id = request.order_item_id
    JOIN orders request_order ON request_order.id = item.order_id
    LEFT JOIN warranties warranty ON warranty.id = request.warranty_id
    WHERE (
      request.customer_id IS NOT DISTINCT FROM request_order.customer_id
      AND (request.warranty_id IS NULL OR warranty.order_item_id = request.order_item_id)
    ) IS NOT TRUE
    UNION ALL
    SELECT 'after_sales_requests_actor_alignment', COUNT(*)::int
    FROM after_sales_requests request
    LEFT JOIN users customer ON customer.id = request.customer_id
    LEFT JOIN users assignee ON assignee.id = request.assigned_to_id
    LEFT JOIN users receiver ON receiver.id = request.received_by_id
    LEFT JOIN users decider ON decider.id = request.decided_by_id
    LEFT JOIN users resolver ON resolver.id = request.resolved_by_id
    WHERE (
      (request.customer_id IS NULL OR customer.role = 'CUSTOMER')
      AND (request.assigned_to_id IS NULL
        OR (assignee.role = 'EMPLOYEE' AND assignee.status = 'ACTIVE'))
      AND (request.received_by_id IS NULL OR receiver.role IN ('EMPLOYEE', 'ADMIN'))
      AND (request.decided_by_id IS NULL OR decider.role IN ('EMPLOYEE', 'ADMIN'))
      AND (request.resolved_by_id IS NULL OR resolver.role IN ('EMPLOYEE', 'ADMIN'))
    ) IS NOT TRUE
    UNION ALL
    SELECT 'after_sales_requests_inspection_alignment', COUNT(*)::int
    FROM after_sales_requests request
    JOIN order_items item ON item.id = request.order_item_id
    LEFT JOIN inventory_inspections inspection ON inspection.id = request.inventory_inspection_id
    WHERE request.status IN ('INSPECTING', 'APPROVED', 'REJECTED', 'RESOLVED')
      AND (
        (item.product_type_snapshot = 'IPHONE'
          AND item.inventory_unit_id IS NOT NULL
          AND inspection.id IS NOT NULL
          AND inspection.inventory_unit_id = item.inventory_unit_id
          AND inspection.inspection_type = CASE
            WHEN request.type = 'WARRANTY' THEN 'WARRANTY'::"InspectionType"
            ELSE 'RETURN'::"InspectionType"
          END
          AND (request.status = 'INSPECTING' OR inspection.status = 'COMPLETED'))
        OR (item.product_type_snapshot = 'ACCESSORY'
          AND request.inventory_inspection_id IS NULL)
      ) IS NOT TRUE
    UNION ALL
    SELECT 'after_sales_requests_replacement_alignment', COUNT(*)::int
    FROM after_sales_requests request
    JOIN order_items item ON item.id = request.order_item_id
    LEFT JOIN inventory_units replacement ON replacement.id = request.replacement_inventory_unit_id
    LEFT JOIN product_variants replacement_variant ON replacement_variant.id = replacement.variant_id
    LEFT JOIN warranties warranty ON warranty.id = request.warranty_id
    WHERE request.status = 'RESOLVED' AND request.resolution_type = 'REPLACED'
      AND (
        item.product_type_snapshot = 'IPHONE'
        AND item.inventory_unit_id IS NOT NULL
        AND replacement.id IS NOT NULL
        AND replacement.id <> item.inventory_unit_id
        AND replacement_variant.product_id = item.product_id
        AND replacement.lifecycle_status = 'SOLD'
        AND NOT EXISTS (
          SELECT 1 FROM inventory_reservations reservation
          WHERE reservation.inventory_unit_id = replacement.id
            AND reservation.status = 'ACTIVE'
        )
        AND (warranty.id IS NULL OR warranty.inventory_unit_id = replacement.id)
      ) IS NOT TRUE
    UNION ALL
    SELECT 'after_sales_requests_refund_alignment', COUNT(*)::int
    FROM after_sales_requests request
    JOIN order_items item ON item.id = request.order_item_id
    LEFT JOIN refunds refund ON refund.id = request.refund_id
    LEFT JOIN warranties warranty ON warranty.id = request.warranty_id
    WHERE request.status = 'RESOLVED' AND request.resolution_type = 'REFUNDED'
      AND (
        refund.id IS NOT NULL
        AND refund.order_id = item.order_id
        AND refund.status = 'COMPLETED'
        AND refund.amount > 0
        AND (warranty.id IS NULL OR warranty.status = 'VOIDED')
      ) IS NOT TRUE
    UNION ALL
    SELECT 'after_sales_requests_inventory_outcome_alignment', COUNT(*)::int
    FROM after_sales_requests request
    JOIN order_items item ON item.id = request.order_item_id
    LEFT JOIN inventory_units original ON original.id = item.inventory_unit_id
    WHERE item.product_type_snapshot = 'IPHONE'
      AND (
        (request.status = 'REJECTED'
          AND original.lifecycle_status = 'SOLD'
          AND request.return_note IS NOT NULL
          AND request.returned_at IS NOT NULL)
        OR (request.status = 'RESOLVED'
          AND request.resolution_type IN ('REPAIRED', 'RETURNED_UNCHANGED')
          AND original.lifecycle_status = 'SOLD'
          AND request.return_note IS NOT NULL
          AND request.returned_at IS NOT NULL)
        OR (request.status = 'RESOLVED'
          AND request.resolution_type IN ('REPLACED', 'REFUNDED')
          AND original.lifecycle_status = 'INSPECTING')
        OR request.status NOT IN ('REJECTED', 'RESOLVED')
        OR (request.status = 'RESOLVED' AND request.resolution_type = 'OTHER')
      ) IS NOT TRUE
  `;
}

async function runSlice11Preflight(): Promise<void> {
  loadWorkspaceEnvironment();
  const connectionString = requiredEnvironment('DATABASE_URL');
  const configuredPrivateBucket = requiredEnvironment('SUPABASE_PRIVATE_BUCKET');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const violations = await findSlice11PreflightViolations(prisma, configuredPrivateBucket);
    const failed = violations.filter(({ count }) => count > 0);
    process.stdout.write(`${JSON.stringify({ checks: violations }, null, 2)}\n`);
    if (failed.length > 0) {
      throw new Error(`Slice 11 preflight found ${failed.length.toString()} violated invariant(s)`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for the Slice 11 preflight`);
  }
  return value;
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && import.meta.url === pathToFileURL(resolve(entrypoint)).href;
}

if (isMainModule()) {
  await runSlice11Preflight();
}
