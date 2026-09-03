-- Refund-create idempotency is internal to NestJS/Prisma. This migration does
-- not grant the Supabase Data API roles access to either column.
ALTER TABLE "refunds"
  ADD COLUMN "idempotency_key" UUID,
  ADD COLUMN "request_fingerprint" CHAR(64);

CREATE UNIQUE INDEX "refunds_idempotency_key_key"
  ON "refunds"("idempotency_key");

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_idempotency_shape_check" CHECK (
  ("idempotency_key" IS NULL AND "request_fingerprint" IS NULL)
  OR (
    "idempotency_key" IS NOT NULL
    AND "request_fingerprint" ~ '^[0-9a-f]{64}$'
  )
) NOT VALID;
ALTER TABLE "refunds" VALIDATE CONSTRAINT "refunds_idempotency_shape_check";
