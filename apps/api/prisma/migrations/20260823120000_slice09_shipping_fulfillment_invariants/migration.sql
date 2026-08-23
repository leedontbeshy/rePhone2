-- Slice 09 shipping fulfillment invariants. Forward-only; run the exact Slice 09 preflight first.
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_lifecycle_check" CHECK (
  "fulfillment_type" <> 'SHIPPING'
  OR ("status" = 'PLACED' AND "fulfillment_status" = 'PENDING')
  OR ("status" = 'CONFIRMED' AND "fulfillment_status" = 'PENDING')
  OR ("status" = 'PROCESSING' AND "fulfillment_status" IN (
    'PREPARING', 'IN_TRANSIT', 'FAILED', 'RETURNED'
  ))
  OR ("status" = 'COMPLETED' AND "fulfillment_status" = 'COMPLETED')
  OR ("status" = 'CANCELLED' AND "fulfillment_status" = 'CANCELLED')
) NOT VALID;
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_shipping_lifecycle_check";

ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_completed_finance_check" CHECK (
  "fulfillment_type" <> 'SHIPPING'
  OR "status" <> 'COMPLETED'
  OR (
    "fulfillment_status" = 'COMPLETED'
    AND "paid_amount" >= "grand_total"
    AND "balance_due" = 0
    AND "payment_status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
  )
) NOT VALID;
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_shipping_completed_finance_check";

ALTER TABLE "orders" DROP CONSTRAINT "orders_shipping_override_check";
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_override_check" CHECK (
  (
    NUM_NONNULLS(
      "shipping_fee_override_reason",
      "shipping_fee_overridden_by_id",
      "shipping_fee_overridden_at"
    ) = 0
    AND "shipping_fee" = "shipping_fee_original"
  )
  OR (
    "fulfillment_type" = 'SHIPPING'
    AND NUM_NONNULLS(
      "shipping_fee_override_reason",
      "shipping_fee_overridden_by_id",
      "shipping_fee_overridden_at"
    ) = 3
    AND NULLIF(BTRIM("shipping_fee_override_reason"), '') IS NOT NULL
    AND "shipping_fee_overridden_at" >= "placed_at"
  )
) NOT VALID;
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_shipping_override_check";

ALTER TABLE "payments" DROP CONSTRAINT "payments_checkout_deposit_check";
ALTER TABLE "payments" ADD CONSTRAINT "payments_checkout_deposit_check" CHECK (
  NOT ("method" = 'BANK_TRANSFER' AND "purpose" = 'DEPOSIT')
  OR "expected_amount" > 0
  OR ("status" = 'CANCELLED' AND "expected_amount" = 0)
) NOT VALID;
ALTER TABLE "payments" VALIDATE CONSTRAINT "payments_checkout_deposit_check";

ALTER TABLE "payments" ADD CONSTRAINT "payments_cod_fulfillment_check" CHECK (
  "method" <> 'COD'
  OR (
    "purpose" = 'BALANCE'
    AND "status" = 'VERIFIED'
    AND "expected_amount" > 0
    AND "received_amount" = "expected_amount"
    AND "reviewed_by_id" IS NOT NULL
    AND "reviewed_at" IS NOT NULL
    AND "transfer_content" IS NULL
    AND "bank_name_snapshot" IS NULL
    AND "bank_account_number_snapshot" IS NULL
    AND "bank_account_holder_snapshot" IS NULL
    AND "bank_qr_bucket_snapshot" IS NULL
    AND "bank_qr_object_path_snapshot" IS NULL
    AND "review_window_minutes_snapshot" IS NULL
    AND "evidence_bucket" IS NULL
    AND "evidence_object_path" IS NULL
    AND "customer_declared_at" IS NULL
    AND "expires_at" IS NULL
    AND "submitted_at" IS NULL
    AND "rejection_reason" IS NULL
  )
) NOT VALID;
ALTER TABLE "payments" VALIDATE CONSTRAINT "payments_cod_fulfillment_check";

CREATE UNIQUE INDEX "payments_one_cod_balance_per_order"
  ON "payments"("order_id")
  WHERE "method" = 'COD' AND "purpose" = 'BALANCE';

ALTER TABLE "shipments" ADD CONSTRAINT "shipments_shape_check" CHECK (
  NULLIF(BTRIM("carrier_name"), '') IS NOT NULL
  AND NULLIF(BTRIM("tracking_code"), '') IS NOT NULL
  AND (
    "tracking_url" IS NULL
    OR "tracking_url" ~ '^https://[^[:space:]]+$'
  )
) NOT VALID;
ALTER TABLE "shipments" VALIDATE CONSTRAINT "shipments_shape_check";

ALTER TABLE "shipments" DROP CONSTRAINT "shipments_status_timestamp_check";
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_status_timestamp_check" CHECK (
  ("status" = 'CREATED'
    AND "shipped_at" IS NULL
    AND "delivered_at" IS NULL
    AND "failed_at" IS NULL
    AND "returned_at" IS NULL
    AND "failure_reason" IS NULL
    AND "returned_to_location_id" IS NULL
    AND "return_note" IS NULL)
  OR ("status" = 'HANDED_TO_CARRIER'
    AND "shipped_at" IS NOT NULL
    AND "shipped_at" >= "created_at"
    AND "delivered_at" IS NULL
    AND "failed_at" IS NULL
    AND "returned_at" IS NULL
    AND "failure_reason" IS NULL
    AND "returned_to_location_id" IS NULL
    AND "return_note" IS NULL)
  OR ("status" = 'DELIVERED'
    AND "shipped_at" IS NOT NULL
    AND "delivered_at" IS NOT NULL
    AND "shipped_at" >= "created_at"
    AND "delivered_at" >= "shipped_at"
    AND "failed_at" IS NULL
    AND "returned_at" IS NULL
    AND "failure_reason" IS NULL
    AND "returned_to_location_id" IS NULL
    AND "return_note" IS NULL)
  OR ("status" = 'FAILED'
    AND "shipped_at" IS NOT NULL
    AND "failed_at" IS NOT NULL
    AND "shipped_at" >= "created_at"
    AND "failed_at" >= "shipped_at"
    AND "delivered_at" IS NULL
    AND "returned_at" IS NULL
    AND NULLIF(BTRIM("failure_reason"), '') IS NOT NULL
    AND "returned_to_location_id" IS NULL
    AND "return_note" IS NULL)
  OR ("status" = 'RETURNED'
    AND "shipped_at" IS NOT NULL
    AND "failed_at" IS NOT NULL
    AND "returned_at" IS NOT NULL
    AND "shipped_at" >= "created_at"
    AND "failed_at" >= "shipped_at"
    AND "returned_at" >= "failed_at"
    AND "delivered_at" IS NULL
    AND NULLIF(BTRIM("failure_reason"), '') IS NOT NULL
    AND "returned_to_location_id" IS NOT NULL
    AND NULLIF(BTRIM("return_note"), '') IS NOT NULL)
  OR ("status" = 'CANCELLED'
    AND "shipped_at" IS NULL
    AND "delivered_at" IS NULL
    AND "failed_at" IS NULL
    AND "returned_at" IS NULL
    AND "failure_reason" IS NULL
    AND "returned_to_location_id" IS NULL
    AND "return_note" IS NULL)
) NOT VALID;
ALTER TABLE "shipments" VALIDATE CONSTRAINT "shipments_status_timestamp_check";

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shipment_return_reference_check" CHECK (
  NOT ("type" = 'RETURN' AND "reference_type" = 'SHIPMENT')
  OR (
    "reference_id" IS NOT NULL
    AND "from_location_id" IS NULL
    AND "to_location_id" IS NOT NULL
    AND "created_by_id" IS NOT NULL
    AND NULLIF(BTRIM("reason"), '') IS NOT NULL
  )
) NOT VALID;
ALTER TABLE "stock_movements" VALIDATE CONSTRAINT "stock_movements_shipment_return_reference_check";

CREATE UNIQUE INDEX "stock_movements_one_return_per_shipment_variant"
  ON "stock_movements"("reference_id", "variant_id")
  WHERE "type" = 'RETURN'
    AND "reference_type" = 'SHIPMENT'
    AND "reference_id" IS NOT NULL;

CREATE INDEX "orders_shipping_fulfillment_queue_idx"
  ON "orders"("fulfillment_status", "updated_at" DESC, "id")
  WHERE "fulfillment_type" = 'SHIPPING'
    AND "status" NOT IN ('COMPLETED', 'CANCELLED');
