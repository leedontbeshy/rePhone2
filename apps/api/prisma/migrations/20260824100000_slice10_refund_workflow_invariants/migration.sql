-- Slice 10 refund workflow invariants. Forward-only; run the exact Slice 10 preflight first.
ALTER TABLE "refunds"
  ADD COLUMN "evidence_mime_type" VARCHAR(100),
  ADD COLUMN "evidence_file_size" INTEGER,
  ADD COLUMN "evidence_sha256" CHAR(64);

-- The composite key prevents a Refund from referencing a Payment owned by another Order.
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_id_order_id_key" UNIQUE ("id", "order_id");

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_payment_id_order_id_fkey"
  FOREIGN KEY ("payment_id", "order_id")
  REFERENCES "payments"("id", "order_id")
  ON DELETE RESTRICT ON UPDATE CASCADE
  NOT VALID;
ALTER TABLE "refunds" VALIDATE CONSTRAINT "refunds_payment_id_order_id_fkey";
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_payment_id_fkey";

ALTER TABLE "orders" ADD CONSTRAINT "orders_refunded_not_above_paid_check" CHECK (
  "refunded_amount" <= "paid_amount"
) NOT VALID;
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_refunded_not_above_paid_check";

ALTER TABLE "refunds" DROP CONSTRAINT "refunds_values_check";
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_values_check" CHECK (
  "amount" > 0
  AND CHAR_LENGTH(BTRIM("reason")) BETWEEN 5 AND 500
  AND (
    "terminal_reason" IS NULL
    OR CHAR_LENGTH(BTRIM("terminal_reason")) BETWEEN 5 AND 500
  )
  AND (
    "note" IS NULL
    OR CHAR_LENGTH(BTRIM("note")) BETWEEN 5 AND 500
  )
) NOT VALID;
ALTER TABLE "refunds" VALIDATE CONSTRAINT "refunds_values_check";

ALTER TABLE "refunds" DROP CONSTRAINT "refunds_requester_check";
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requester_check" CHECK (
  ("requested_by_type" = 'CUSTOMER')
  OR ("requested_by_type" = 'STAFF' AND "requested_by_id" IS NOT NULL)
  OR ("requested_by_type" = 'SYSTEM' AND "requested_by_id" IS NULL)
) NOT VALID;
ALTER TABLE "refunds" VALIDATE CONSTRAINT "refunds_requester_check";

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_evidence_shape_check" CHECK (
  (
    NUM_NONNULLS(
      "evidence_bucket",
      "evidence_object_path",
      "evidence_mime_type",
      "evidence_file_size",
      "evidence_sha256"
    ) = 0
  )
  OR (
    NUM_NONNULLS(
      "evidence_bucket",
      "evidence_object_path",
      "evidence_mime_type",
      "evidence_file_size",
      "evidence_sha256"
    ) = 5
    AND NULLIF(BTRIM("evidence_bucket"), '') IS NOT NULL
    AND NULLIF(BTRIM("evidence_object_path"), '') IS NOT NULL
    AND "evidence_object_path" ~ ('^refunds/' || "id"::text || '/[^/]+$')
    AND "evidence_mime_type" IN (
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf'
    )
    AND "evidence_file_size" BETWEEN 1 AND 10485760
    AND "evidence_sha256" ~ '^[0-9a-f]{64}$'
  )
) NOT VALID;
ALTER TABLE "refunds" VALIDATE CONSTRAINT "refunds_evidence_shape_check";

ALTER TABLE "refunds" DROP CONSTRAINT "refunds_status_timestamp_check";
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_status_timestamp_check" CHECK (
  (
    "status" = 'REQUESTED'
    AND "processed_by_id" IS NULL
    AND "processing_at" IS NULL
    AND "completed_at" IS NULL
    AND "terminal_reason" IS NULL
    AND "terminal_by_id" IS NULL
    AND "terminal_at" IS NULL
    AND "note" IS NULL
    AND NUM_NONNULLS(
      "evidence_bucket",
      "evidence_object_path",
      "evidence_mime_type",
      "evidence_file_size",
      "evidence_sha256"
    ) = 0
  )
  OR (
    "status" = 'PROCESSING'
    AND "method" IN ('BANK_TRANSFER', 'CASH')
    AND "processed_by_id" IS NOT NULL
    AND "processing_at" IS NOT NULL
    AND "processing_at" >= "created_at"
    AND "completed_at" IS NULL
    AND "terminal_reason" IS NULL
    AND "terminal_by_id" IS NULL
    AND "terminal_at" IS NULL
    AND NUM_NONNULLS(
      "evidence_bucket",
      "evidence_object_path",
      "evidence_mime_type",
      "evidence_file_size",
      "evidence_sha256"
    ) = 0
  )
  OR (
    "status" = 'COMPLETED'
    AND "method" IN ('BANK_TRANSFER', 'CASH')
    AND "processed_by_id" IS NOT NULL
    AND "processing_at" IS NOT NULL
    AND "completed_at" IS NOT NULL
    AND "processing_at" >= "created_at"
    AND "completed_at" >= "processing_at"
    AND "terminal_reason" IS NULL
    AND "terminal_by_id" IS NULL
    AND "terminal_at" IS NULL
    AND "note" IS NOT NULL
    AND (
      (
        "method" = 'BANK_TRANSFER'
        AND NUM_NONNULLS(
          "evidence_bucket",
          "evidence_object_path",
          "evidence_mime_type",
          "evidence_file_size",
          "evidence_sha256"
        ) = 5
      )
      OR (
        "method" = 'CASH'
        AND NUM_NONNULLS(
          "evidence_bucket",
          "evidence_object_path",
          "evidence_mime_type",
          "evidence_file_size",
          "evidence_sha256"
        ) = 0
      )
    )
  )
  OR (
    "status" IN ('REJECTED', 'CANCELLED')
    AND "processed_by_id" IS NULL
    AND "processing_at" IS NULL
    AND "completed_at" IS NULL
    AND "terminal_reason" IS NOT NULL
    AND "terminal_by_id" IS NOT NULL
    AND "terminal_at" IS NOT NULL
    AND "terminal_at" >= "created_at"
    AND "note" IS NULL
    AND NUM_NONNULLS(
      "evidence_bucket",
      "evidence_object_path",
      "evidence_mime_type",
      "evidence_file_size",
      "evidence_sha256"
    ) = 0
  )
) NOT VALID;
ALTER TABLE "refunds" VALIDATE CONSTRAINT "refunds_status_timestamp_check";

CREATE INDEX "refunds_status_created_at_id_idx"
  ON "refunds"("status", "created_at", "id");

CREATE INDEX "refunds_status_processing_at_id_idx"
  ON "refunds"("status", "processing_at", "id");
