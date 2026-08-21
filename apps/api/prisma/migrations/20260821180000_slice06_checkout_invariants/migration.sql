-- Slice 06 checkout/reservation invariants. This migration is forward-only.
ALTER TABLE "carts" ADD CONSTRAINT "carts_guest_token_hash_shape_check" CHECK (
    "guest_token_hash" IS NULL OR "guest_token_hash" ~ '^[0-9a-f]{64}$'
);

ALTER TABLE "orders" ADD CONSTRAINT "orders_guest_access_token_hash_shape_check" CHECK (
    "guest_access_token_hash" IS NULL OR "guest_access_token_hash" ~ '^[0-9a-f]{64}$'
);

ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_active_hold_check" CHECK (
    "status" <> 'ACTIVE'
    OR ("hold_reason" IN ('DEPOSIT', 'PICKUP') AND "expires_at" IS NOT NULL)
    OR ("hold_reason" IN ('REVIEW', 'FULFILLMENT') AND "expires_at" IS NULL)
);

ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_deposit_check" CHECK (
    "fulfillment_type" <> 'SHIPPING'
    OR ("grand_total" = 0 AND "deposit_required" = 0)
    OR ("grand_total" > 0 AND "deposit_required" > 0)
);

ALTER TABLE "payments" ADD CONSTRAINT "payments_checkout_deposit_check" CHECK (
    NOT ("method" = 'BANK_TRANSFER' AND "purpose" = 'DEPOSIT')
    OR "expected_amount" > 0
);

ALTER TABLE "payments" ADD CONSTRAINT "payments_bank_qr_snapshot_pair_check" CHECK (
    NUM_NONNULLS("bank_qr_bucket_snapshot", "bank_qr_object_path_snapshot") IN (0, 2)
);

ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_bank_qr_pair_check" CHECK (
    NUM_NONNULLS("bank_qr_bucket", "bank_qr_object_path") IN (0, 2)
);
