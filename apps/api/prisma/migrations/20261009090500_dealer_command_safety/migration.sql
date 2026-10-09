ALTER TABLE dealer_idempotency_records ADD COLUMN response_snapshot JSONB;
CREATE UNIQUE INDEX dealer_refund_sources_refund_id_key ON dealer_refund_sources(refund_id);

CREATE FUNCTION dealer_frozen_detail() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.request_fingerprint,NEW.preview_fingerprint,NEW.public_price_snapshot,NEW.pricing_policy_version,NEW.shipping_snapshot,NEW.brand_snapshot,NEW.commercial_snapshot,NEW.linked_original_order_id)
    IS DISTINCT FROM ROW(OLD.request_fingerprint,OLD.preview_fingerprint,OLD.public_price_snapshot,OLD.pricing_policy_version,OLD.shipping_snapshot,OLD.brand_snapshot,OLD.commercial_snapshot,OLD.linked_original_order_id)
  THEN RAISE EXCEPTION 'Dealer commercial snapshots are immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dealer_detail_frozen BEFORE UPDATE ON dealer_order_details FOR EACH ROW EXECUTE FUNCTION dealer_frozen_detail();
