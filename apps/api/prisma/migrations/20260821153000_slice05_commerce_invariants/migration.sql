-- Tighten the Slice 05 cart and voucher invariants without rewriting baseline history.

ALTER TABLE "cart_items"
    DROP CONSTRAINT "cart_items_values_check";

ALTER TABLE "cart_items"
    ADD CONSTRAINT "cart_items_values_check" CHECK (
        "quantity" BETWEEN 1 AND 99
        AND "price_at_addition" >= 0
        AND ("inventory_unit_id" IS NULL OR "quantity" = 1)
    );

ALTER TABLE "vouchers"
    DROP CONSTRAINT "vouchers_values_check";

ALTER TABLE "vouchers"
    ADD CONSTRAINT "vouchers_values_check" CHECK (
        "ends_at" > "starts_at"
        AND "discount_value" > 0
        AND (
            ("discount_type" = 'FIXED' AND "max_discount_amount" IS NULL)
            OR (
                "discount_type" = 'PERCENT'
                AND "discount_value" BETWEEN 1 AND 100
                AND SCALE("discount_value") = 0
                AND ("max_discount_amount" IS NULL OR "max_discount_amount" > 0)
            )
        )
        AND "minimum_order_amount" >= 0
        AND ("total_usage_limit" IS NULL OR "total_usage_limit" > 0)
        AND ("per_customer_limit" IS NULL OR "per_customer_limit" > 0)
        AND ("visibility" = 'ACCOUNT_ONLY' OR "per_customer_limit" IS NULL)
        AND (
            ("scope_type" = 'ORDER' AND "scope_config" IS NULL)
            OR ("scope_type" <> 'ORDER' AND JSONB_TYPEOF("scope_config") = 'object')
        )
    );

