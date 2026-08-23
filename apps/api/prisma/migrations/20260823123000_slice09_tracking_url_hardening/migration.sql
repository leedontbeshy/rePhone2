-- Reject tracking URLs that can expose embedded authority credentials.
-- This replaces the initial Slice 09 shape check before production rollout.
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_shape_check";
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_shape_check" CHECK (
  NULLIF(BTRIM("carrier_name"), '') IS NOT NULL
  AND NULLIF(BTRIM("tracking_code"), '') IS NOT NULL
  AND (
    "tracking_url" IS NULL
    OR (
      "tracking_url" ~* '^https://[^[:space:]]+$'
      AND "tracking_url" !~* '^https://[^/?#]*@'
    )
  )
) NOT VALID;
ALTER TABLE "shipments" VALIDATE CONSTRAINT "shipments_shape_check";
