ALTER TABLE after_sales_requests
  ADD COLUMN dealer_assessment JSONB,
  ADD COLUMN dealer_warranty_extension_days INTEGER,
  ADD CONSTRAINT dealer_warranty_extension_nonnegative CHECK (dealer_warranty_extension_days IS NULL OR dealer_warranty_extension_days >= 0);
ALTER TABLE dealer_order_details ADD COLUMN return_settlement JSONB;
