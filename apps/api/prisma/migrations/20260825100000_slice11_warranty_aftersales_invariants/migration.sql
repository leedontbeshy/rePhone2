-- Slice 11 warranty and after-sales invariants. Forward-only; run the exact Slice 11 preflight first.

-- A physical iPhone may be sold again after a terminal warranty/return flow. Warranty history
-- remains attached to its OrderItem, so inventory_unit_id is intentionally non-unique.
DROP INDEX IF EXISTS "warranties_inventory_unit_id_key";

-- requestedResolution is optional in the HTTP/data contract.
ALTER TABLE "after_sales_requests"
  ALTER COLUMN "requested_resolution" DROP NOT NULL,
  ADD COLUMN "receive_note" TEXT;

-- New policies are opt-in for future catalog sales; activation is always a named Admin command.
ALTER TABLE "warranty_policies" ALTER COLUMN "status" SET DEFAULT 'INACTIVE';

-- A case may only link a Warranty issued for the same OrderItem. Optional inspection/refund
-- links are one-to-one so terminal evidence cannot be reused across cases.
ALTER TABLE "warranties"
  ADD CONSTRAINT "warranties_id_order_item_id_key" UNIQUE ("id", "order_item_id");
ALTER TABLE "after_sales_requests"
  ADD CONSTRAINT "after_sales_requests_warranty_id_order_item_id_fkey"
  FOREIGN KEY ("warranty_id", "order_item_id")
  REFERENCES "warranties"("id", "order_item_id")
  ON DELETE RESTRICT ON UPDATE CASCADE
  NOT VALID;
ALTER TABLE "after_sales_requests"
  VALIDATE CONSTRAINT "after_sales_requests_warranty_id_order_item_id_fkey";
ALTER TABLE "after_sales_requests" DROP CONSTRAINT "after_sales_requests_warranty_id_fkey";

CREATE UNIQUE INDEX "after_sales_requests_inventory_inspection_id_key"
  ON "after_sales_requests"("inventory_inspection_id");
CREATE UNIQUE INDEX "after_sales_requests_refund_id_key"
  ON "after_sales_requests"("refund_id");

ALTER TABLE "warranty_policies" DROP CONSTRAINT "warranty_policies_values_check";
ALTER TABLE "warranty_policies" ADD CONSTRAINT "warranty_policies_values_check" CHECK (
  CHAR_LENGTH(BTRIM("code")) BETWEEN 1 AND 64
  AND "code" = UPPER(BTRIM("code"))
  AND CHAR_LENGTH(BTRIM("name")) BETWEEN 1 AND 255
  AND "default_days" BETWEEN 0 AND 3650
  AND CHAR_LENGTH(BTRIM("terms")) BETWEEN 1 AND 10000
) NOT VALID;
ALTER TABLE "warranty_policies" VALIDATE CONSTRAINT "warranty_policies_values_check";

ALTER TABLE "warranty_policies" ADD CONSTRAINT "warranty_policies_lifecycle_check" CHECK (
  "archived_at" IS NULL OR "status" = 'INACTIVE'
) NOT VALID;
ALTER TABLE "warranty_policies" VALIDATE CONSTRAINT "warranty_policies_lifecycle_check";

ALTER TABLE "warranties" DROP CONSTRAINT "warranties_void_check";
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_void_check" CHECK (
  (
    "status" = 'ACTIVE'
    AND "void_reason" IS NULL
    AND "voided_by_id" IS NULL
    AND "voided_at" IS NULL
  )
  OR (
    "status" = 'VOIDED'
    AND CHAR_LENGTH(BTRIM("void_reason")) BETWEEN 5 AND 500
    AND "voided_by_id" IS NOT NULL
    AND "voided_at" IS NOT NULL
    AND "voided_at" >= "start_at"
  )
) NOT VALID;
ALTER TABLE "warranties" VALIDATE CONSTRAINT "warranties_void_check";

ALTER TABLE "after_sales_requests" ADD CONSTRAINT "after_sales_requests_values_check" CHECK (
  "request_number" ~ '^RPH-AS-[0-9]{8}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$'
  AND CHAR_LENGTH(BTRIM("issue_description")) BETWEEN 10 AND 2000
  AND (
    "requested_resolution" IS NULL
    OR CHAR_LENGTH(BTRIM("requested_resolution")) BETWEEN 1 AND 500
  )
  AND (
    "receive_note" IS NULL
    OR CHAR_LENGTH(BTRIM("receive_note")) BETWEEN 5 AND 1000
  )
  AND (
    "inspection_summary" IS NULL
    OR CHAR_LENGTH(BTRIM("inspection_summary")) BETWEEN 10 AND 2000
  )
  AND (
    "decision_note" IS NULL
    OR CHAR_LENGTH(BTRIM("decision_note")) BETWEEN 5 AND 2000
  )
  AND (
    "resolution_note" IS NULL
    OR CHAR_LENGTH(BTRIM("resolution_note")) BETWEEN 5 AND 2000
  )
  AND (
    "return_note" IS NULL
    OR CHAR_LENGTH(BTRIM("return_note")) BETWEEN 5 AND 1000
  )
  AND (
    "cancel_reason" IS NULL
    OR CHAR_LENGTH(BTRIM("cancel_reason")) BETWEEN 5 AND 500
  )
  AND "requested_at" >= "created_at"
) NOT VALID;
ALTER TABLE "after_sales_requests" VALIDATE CONSTRAINT "after_sales_requests_values_check";

ALTER TABLE "after_sales_requests" DROP CONSTRAINT "after_sales_requests_attachment_check";
ALTER TABLE "after_sales_requests" ADD CONSTRAINT "after_sales_requests_attachment_check" CHECK (
  "attachments" IS NULL
  OR (
    JSONB_TYPEOF("attachments") = 'array'
    AND JSONB_ARRAY_LENGTH("attachments") <= 5
  )
) NOT VALID;
ALTER TABLE "after_sales_requests" VALIDATE CONSTRAINT "after_sales_requests_attachment_check";

ALTER TABLE "after_sales_requests" ADD CONSTRAINT "after_sales_requests_warranty_type_check" CHECK (
  ("type" = 'WARRANTY' AND "warranty_id" IS NOT NULL)
  OR ("type" IN ('RETURN', 'EXCHANGE') AND "warranty_id" IS NULL)
) NOT VALID;
ALTER TABLE "after_sales_requests" VALIDATE CONSTRAINT "after_sales_requests_warranty_type_check";

ALTER TABLE "after_sales_requests" DROP CONSTRAINT "after_sales_requests_replacement_check";
ALTER TABLE "after_sales_requests" ADD CONSTRAINT "after_sales_requests_resolution_reference_check" CHECK (
  (
    "resolution_type" = 'REPLACED'
    AND "replacement_inventory_unit_id" IS NOT NULL
    AND "refund_id" IS NULL
  )
  OR (
    "resolution_type" = 'REFUNDED'
    AND "replacement_inventory_unit_id" IS NULL
    AND "refund_id" IS NOT NULL
  )
  OR (
    "resolution_type" IS NULL
    AND "replacement_inventory_unit_id" IS NULL
    AND "refund_id" IS NULL
  )
  OR (
    "resolution_type" IN ('REPAIRED', 'RETURNED_UNCHANGED', 'OTHER')
    AND "replacement_inventory_unit_id" IS NULL
    AND "refund_id" IS NULL
  )
) NOT VALID;
ALTER TABLE "after_sales_requests" VALIDATE CONSTRAINT "after_sales_requests_resolution_reference_check";

ALTER TABLE "after_sales_requests" DROP CONSTRAINT "after_sales_requests_status_check";
ALTER TABLE "after_sales_requests" ADD CONSTRAINT "after_sales_requests_status_check" CHECK (
  (
    "status" = 'REQUESTED'
    AND NUM_NONNULLS("received_location_id", "received_by_id", "received_at") = 0
    AND "receive_note" IS NULL
    AND "inspected_at" IS NULL
    AND "inspection_summary" IS NULL
    AND "inventory_inspection_id" IS NULL
    AND NUM_NONNULLS("decision_note", "decided_by_id", "decided_at") = 0
    AND NUM_NONNULLS("resolution_type", "resolution_note", "resolved_by_id", "resolved_at") = 0
    AND NUM_NONNULLS("replacement_inventory_unit_id", "refund_id") = 0
    AND NUM_NONNULLS("return_note", "returned_at") = 0
    AND NUM_NONNULLS("cancel_reason", "cancelled_at") = 0
  )
  OR (
    "status" = 'RECEIVED'
    AND NUM_NONNULLS("received_location_id", "received_by_id", "received_at") = 3
    AND "received_at" >= "requested_at"
    AND "inspected_at" IS NULL
    AND "inspection_summary" IS NULL
    AND "inventory_inspection_id" IS NULL
    AND NUM_NONNULLS("decision_note", "decided_by_id", "decided_at") = 0
    AND NUM_NONNULLS("resolution_type", "resolution_note", "resolved_by_id", "resolved_at") = 0
    AND NUM_NONNULLS("replacement_inventory_unit_id", "refund_id") = 0
    AND NUM_NONNULLS("return_note", "returned_at") = 0
    AND NUM_NONNULLS("cancel_reason", "cancelled_at") = 0
  )
  OR (
    "status" = 'INSPECTING'
    AND NUM_NONNULLS("received_location_id", "received_by_id", "received_at") = 3
    AND "received_at" >= "requested_at"
    AND "inspected_at" IS NOT NULL
    AND "inspected_at" >= "received_at"
    AND NUM_NONNULLS("decision_note", "decided_by_id", "decided_at") = 0
    AND NUM_NONNULLS("resolution_type", "resolution_note", "resolved_by_id", "resolved_at") = 0
    AND NUM_NONNULLS("replacement_inventory_unit_id", "refund_id") = 0
    AND NUM_NONNULLS("return_note", "returned_at") = 0
    AND NUM_NONNULLS("cancel_reason", "cancelled_at") = 0
  )
  OR (
    "status" = 'APPROVED'
    AND NUM_NONNULLS("received_location_id", "received_by_id", "received_at") = 3
    AND "received_at" >= "requested_at"
    AND "inspected_at" IS NOT NULL
    AND "inspected_at" >= "received_at"
    AND NUM_NONNULLS("decision_note", "decided_by_id", "decided_at") = 3
    AND "decided_at" >= "inspected_at"
    AND NUM_NONNULLS("resolution_type", "resolution_note", "resolved_by_id", "resolved_at") = 0
    AND NUM_NONNULLS("replacement_inventory_unit_id", "refund_id") = 0
    AND NUM_NONNULLS("return_note", "returned_at") = 0
    AND NUM_NONNULLS("cancel_reason", "cancelled_at") = 0
  )
  OR (
    "status" = 'REJECTED'
    AND NUM_NONNULLS("received_location_id", "received_by_id", "received_at") = 3
    AND "received_at" >= "requested_at"
    AND "inspected_at" IS NOT NULL
    AND "inspected_at" >= "received_at"
    AND NUM_NONNULLS("decision_note", "decided_by_id", "decided_at") = 3
    AND "decided_at" >= "inspected_at"
    AND NUM_NONNULLS("resolution_type", "resolution_note", "resolved_by_id", "resolved_at") = 0
    AND NUM_NONNULLS("replacement_inventory_unit_id", "refund_id") = 0
    AND NUM_NONNULLS("return_note", "returned_at") IN (0, 2)
    AND ("returned_at" IS NULL OR "returned_at" >= "decided_at")
    AND NUM_NONNULLS("cancel_reason", "cancelled_at") = 0
  )
  OR (
    "status" = 'RESOLVED'
    AND NUM_NONNULLS("received_location_id", "received_by_id", "received_at") = 3
    AND "received_at" >= "requested_at"
    AND "inspected_at" IS NOT NULL
    AND "inspected_at" >= "received_at"
    AND NUM_NONNULLS("decision_note", "decided_by_id", "decided_at") = 3
    AND "decided_at" >= "inspected_at"
    AND NUM_NONNULLS("resolution_type", "resolution_note", "resolved_by_id", "resolved_at") = 4
    AND "resolved_at" >= "decided_at"
    AND NUM_NONNULLS("return_note", "returned_at") IN (0, 2)
    AND (
      "returned_at" IS NULL
      OR ("returned_at" >= "decided_at" AND "returned_at" <= "resolved_at")
    )
    AND NUM_NONNULLS("cancel_reason", "cancelled_at") = 0
  )
  OR (
    "status" = 'CANCELLED'
    AND NUM_NONNULLS("received_location_id", "received_by_id", "received_at") = 0
    AND "receive_note" IS NULL
    AND "inspected_at" IS NULL
    AND "inspection_summary" IS NULL
    AND "inventory_inspection_id" IS NULL
    AND NUM_NONNULLS("decision_note", "decided_by_id", "decided_at") = 0
    AND NUM_NONNULLS("resolution_type", "resolution_note", "resolved_by_id", "resolved_at") = 0
    AND NUM_NONNULLS("replacement_inventory_unit_id", "refund_id") = 0
    AND NUM_NONNULLS("return_note", "returned_at") = 0
    AND NUM_NONNULLS("cancel_reason", "cancelled_at") = 2
    AND "cancelled_at" >= "requested_at"
  )
) NOT VALID;
ALTER TABLE "after_sales_requests" VALIDATE CONSTRAINT "after_sales_requests_status_check";

DROP INDEX IF EXISTS "warranties_customer_id_created_at_idx";
CREATE INDEX "warranties_customer_id_created_at_id_idx"
  ON "warranties"("customer_id", "created_at", "id");
CREATE INDEX "warranties_status_end_at_id_idx"
  ON "warranties"("status", "end_at", "id");

DROP INDEX IF EXISTS "after_sales_requests_customer_id_requested_at_idx";
DROP INDEX IF EXISTS "after_sales_requests_assigned_to_id_status_idx";
CREATE INDEX "after_sales_requests_customer_id_requested_at_id_idx"
  ON "after_sales_requests"("customer_id", "requested_at", "id");
CREATE INDEX "after_sales_requests_assigned_to_id_status_updated_at_id_idx"
  ON "after_sales_requests"("assigned_to_id", "status", "updated_at", "id");
CREATE INDEX "after_sales_requests_status_requested_at_id_idx"
  ON "after_sales_requests"("status", "requested_at", "id");
