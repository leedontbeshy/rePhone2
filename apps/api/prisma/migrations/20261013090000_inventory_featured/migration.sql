ALTER TABLE "inventory_units"
  ADD COLUMN "is_featured" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "inventory_units_public_featured_idx"
  ON "inventory_units" ("is_featured" DESC, "sale_price" DESC, "inventory_code")
  WHERE "lifecycle_status" = 'AVAILABLE' AND "sale_price" IS NOT NULL;
