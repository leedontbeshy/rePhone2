-- Slice 07 payment evidence and deposit lifecycle invariants. This migration is forward-only.
ALTER TABLE "payments" ADD CONSTRAINT "payments_evidence_shape_check" CHECK (
    ("evidence_bucket" IS NULL AND "evidence_object_path" IS NULL)
    OR (
      "evidence_bucket" IS NOT NULL
      AND "evidence_object_path" IS NOT NULL
      AND NULLIF(BTRIM("evidence_bucket"), '') IS NOT NULL
      AND NULLIF(BTRIM("evidence_object_path"), '') IS NOT NULL
    )
);

ALTER TABLE "payments" ADD CONSTRAINT "payments_evidence_owner_path_check" CHECK (
    "evidence_object_path" IS NULL
    OR "evidence_object_path" ~ ('^payments/' || "id"::text || '/[^/].*$')
);

ALTER TABLE "payments" ADD CONSTRAINT "payments_bank_deposit_lifecycle_check" CHECK (
    NOT ("method" = 'BANK_TRANSFER' AND "purpose" = 'DEPOSIT')
    OR (
      "status" = 'AWAITING_PROOF'
      AND "evidence_bucket" IS NULL
      AND "evidence_object_path" IS NULL
      AND "customer_declared_at" IS NULL
      AND "submitted_at" IS NULL
      AND "reviewed_by_id" IS NULL
      AND "reviewed_at" IS NULL
      AND "received_amount" IS NULL
      AND "rejection_reason" IS NULL
    )
    OR (
      "status" = 'UNDER_REVIEW'
      AND "evidence_bucket" IS NOT NULL
      AND "evidence_object_path" IS NOT NULL
      AND "customer_declared_at" IS NOT NULL
      AND "submitted_at" IS NOT NULL
      AND "reviewed_by_id" IS NULL
      AND "reviewed_at" IS NULL
      AND "received_amount" IS NULL
      AND "rejection_reason" IS NULL
    )
    OR (
      "status" = 'VERIFIED'
      AND "evidence_bucket" IS NOT NULL
      AND "evidence_object_path" IS NOT NULL
      AND "customer_declared_at" IS NOT NULL
      AND "submitted_at" IS NOT NULL
      AND "reviewed_by_id" IS NOT NULL
      AND "reviewed_at" IS NOT NULL
      AND "received_amount" > 0
      AND "rejection_reason" IS NULL
    )
    OR (
      "status" = 'REJECTED'
      AND "evidence_bucket" IS NOT NULL
      AND "evidence_object_path" IS NOT NULL
      AND "customer_declared_at" IS NOT NULL
      AND "submitted_at" IS NOT NULL
      AND "reviewed_by_id" IS NOT NULL
      AND "reviewed_at" IS NOT NULL
      AND "received_amount" IS NULL
      AND NULLIF(BTRIM("rejection_reason"), '') IS NOT NULL
    )
    OR (
      "status" IN ('EXPIRED', 'CANCELLED')
      AND "evidence_bucket" IS NULL
      AND "evidence_object_path" IS NULL
      AND "customer_declared_at" IS NULL
      AND "submitted_at" IS NULL
      AND "reviewed_by_id" IS NULL
      AND "reviewed_at" IS NULL
      AND "received_amount" IS NULL
      AND "rejection_reason" IS NULL
    )
);

CREATE INDEX "payments_status_expires_at_id_idx" ON "payments"("status", "expires_at", "id");
