-- Slice 08 pickup fulfillment and finalization invariants. This migration is forward-only.
ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_lifecycle_check" CHECK (
    "fulfillment_type" <> 'PICKUP'
    OR ("status" = 'PLACED' AND "fulfillment_status" = 'PENDING')
    OR ("status" = 'CONFIRMED' AND "fulfillment_status" = 'PENDING')
    OR ("status" = 'PROCESSING' AND "fulfillment_status" IN ('PREPARING', 'READY'))
    OR ("status" = 'COMPLETED' AND "fulfillment_status" = 'COMPLETED')
    OR ("status" = 'CANCELLED' AND "fulfillment_status" = 'CANCELLED')
);

ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_deadline_timestamps_check" CHECK (
    "fulfillment_type" <> 'PICKUP'
    OR (
      "pickup_hold_until" > "placed_at"
      AND ("confirmed_at" IS NULL OR (
        "confirmed_at" >= "placed_at"
        AND "confirmed_at" < "pickup_hold_until"
      ))
      AND ("pickup_ready_at" IS NULL OR (
        "confirmed_at" IS NOT NULL
        AND "pickup_ready_at" >= "confirmed_at"
        AND "pickup_ready_at" < "pickup_hold_until"
      ))
      AND ("picked_up_at" IS NULL OR (
        "pickup_ready_at" IS NOT NULL
        AND "picked_up_at" >= "pickup_ready_at"
        AND "picked_up_at" < "pickup_hold_until"
      ))
      AND ("cancelled_at" IS NULL OR "cancelled_at" >= COALESCE(
        "pickup_ready_at",
        "confirmed_at",
        "placed_at"
      ))
      AND (
        ("status" = 'PLACED'
          AND "confirmed_at" IS NULL
          AND "pickup_ready_at" IS NULL
          AND "picked_up_at" IS NULL
          AND "completed_at" IS NULL
          AND "cancelled_at" IS NULL)
        OR ("status" = 'CONFIRMED'
          AND "confirmed_at" IS NOT NULL
          AND "pickup_ready_at" IS NULL
          AND "picked_up_at" IS NULL
          AND "completed_at" IS NULL
          AND "cancelled_at" IS NULL)
        OR ("status" = 'PROCESSING' AND "fulfillment_status" = 'PREPARING'
          AND "confirmed_at" IS NOT NULL
          AND "pickup_ready_at" IS NULL
          AND "picked_up_at" IS NULL
          AND "completed_at" IS NULL
          AND "cancelled_at" IS NULL)
        OR ("status" = 'PROCESSING' AND "fulfillment_status" = 'READY'
          AND "confirmed_at" IS NOT NULL
          AND "pickup_ready_at" IS NOT NULL
          AND "picked_up_at" IS NULL
          AND "completed_at" IS NULL
          AND "cancelled_at" IS NULL)
        OR ("status" = 'COMPLETED'
          AND "confirmed_at" IS NOT NULL
          AND "pickup_ready_at" IS NOT NULL
          AND "picked_up_at" IS NOT NULL
          AND "completed_at" IS NOT NULL
          AND "completed_at" = "picked_up_at"
          AND "cancelled_at" IS NULL)
        OR ("status" = 'CANCELLED'
          AND "picked_up_at" IS NULL
          AND "completed_at" IS NULL
          AND "cancelled_at" IS NOT NULL)
      )
    )
);

CREATE INDEX "orders_pickup_expiry_queue_idx"
    ON "orders"("pickup_hold_until", "id")
    WHERE "fulfillment_type" = 'PICKUP'
      AND "status" NOT IN ('COMPLETED', 'CANCELLED')
      AND "fulfillment_status" NOT IN (
        'COMPLETED',
        'CANCELLED',
        'IN_TRANSIT',
        'FAILED',
        'RETURNED'
      );

CREATE UNIQUE INDEX "inventory_reservations_one_active_per_order_item"
    ON "inventory_reservations"("order_item_id")
    WHERE "status" = 'ACTIVE';

ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_fulfillment_check" CHECK (
    "method" <> 'CASH'
    OR (
      "purpose" = 'FULL_PAYMENT'
      AND "status" = 'VERIFIED'
      AND "expected_amount" > 0
      AND "received_amount" IS NOT NULL
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
);

CREATE UNIQUE INDEX "payments_one_cash_full_payment_per_order"
    ON "payments"("order_id")
    WHERE "method" = 'CASH' AND "purpose" = 'FULL_PAYMENT';

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_reference_check" CHECK (
    "type" <> 'SALE'
    OR (
      "from_location_id" IS NOT NULL
      AND "to_location_id" IS NULL
      AND "reference_type" IS NOT NULL
      AND "reference_type" = 'INVENTORY_RESERVATION'
      AND "reference_id" IS NOT NULL
    )
);

CREATE UNIQUE INDEX "stock_movements_one_sale_per_reservation"
    ON "stock_movements"("reference_id")
    WHERE "type" = 'SALE'
      AND "reference_type" = 'INVENTORY_RESERVATION'
      AND "reference_id" IS NOT NULL;

ALTER TABLE "warranties" DROP CONSTRAINT "warranties_interval_check";
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_interval_check" CHECK (
    "days_snapshot" > 0
    AND "end_at" = "start_at" + ("days_snapshot" * INTERVAL '1 day')
    AND NULLIF(BTRIM("terms_snapshot"), '') IS NOT NULL
);
