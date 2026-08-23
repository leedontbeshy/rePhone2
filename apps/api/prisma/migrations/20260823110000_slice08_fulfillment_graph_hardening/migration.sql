-- Slice 08 cross-record hardening. Forward-only; run the exact Slice 08 preflight first.
ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_completed_finance_check" CHECK (
  "fulfillment_type" <> 'PICKUP'
  OR "status" <> 'COMPLETED'
  OR (
    "fulfillment_status" = 'COMPLETED'
    AND "paid_amount" >= "grand_total"
    AND "balance_due" = 0
    AND "payment_status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
  )
) NOT VALID;
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_pickup_completed_finance_check";

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_id_order_id_key" UNIQUE ("id", "order_id");

ALTER TABLE "inventory_reservations"
  DROP CONSTRAINT "inventory_reservations_order_item_id_fkey";
ALTER TABLE "inventory_reservations"
  ADD CONSTRAINT "inventory_reservations_order_item_order_fkey"
  FOREIGN KEY ("order_item_id", "order_id")
  REFERENCES "order_items"("id", "order_id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "inventory_reservations"
  VALIDATE CONSTRAINT "inventory_reservations_order_item_order_fkey";

ALTER TABLE "warranties" ADD CONSTRAINT "warranties_code_shape_check" CHECK (
  "warranty_code" ~ '^RPH-W-[0-9]{8}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'
) NOT VALID;
ALTER TABLE "warranties" VALIDATE CONSTRAINT "warranties_code_shape_check";

CREATE FUNCTION "enforce_sale_reservation_reference"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."type" = 'SALE' AND NOT EXISTS (
    SELECT 1
    FROM "inventory_reservations" reservation
    JOIN "order_items" item
      ON item."id" = reservation."order_item_id"
      AND item."order_id" = reservation."order_id"
    JOIN "stock_levels" stock ON stock."id" = reservation."stock_level_id"
    WHERE NEW."reference_type" = 'INVENTORY_RESERVATION'
      AND reservation."id" = NEW."reference_id"
      AND reservation."inventory_unit_id" IS NULL
      AND item."inventory_unit_id" IS NULL
      AND item."variant_id" = NEW."variant_id"
      AND stock."variant_id" = NEW."variant_id"
      AND stock."location_id" = NEW."from_location_id"
      AND reservation."quantity" = NEW."quantity"
  ) THEN
    RAISE EXCEPTION 'SALE movement must reference its matching accessory reservation'
      USING ERRCODE = '23514', CONSTRAINT = 'stock_movements_sale_reservation_alignment';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "stock_movements_sale_reservation_alignment"
BEFORE INSERT OR UPDATE OF
  "type",
  "variant_id",
  "from_location_id",
  "to_location_id",
  "quantity",
  "reference_type",
  "reference_id"
ON "stock_movements"
FOR EACH ROW EXECUTE FUNCTION "enforce_sale_reservation_reference"();
