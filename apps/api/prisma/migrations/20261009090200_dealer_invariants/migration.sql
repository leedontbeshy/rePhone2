-- Forward-only dealer constraints. Existing rows retain STOREFRONT semantics.
ALTER TABLE orders DROP CONSTRAINT orders_identity_check;
ALTER TABLE orders ADD CONSTRAINT orders_identity_check CHECK (
  (channel = 'STOREFRONT' AND dealer_id IS NULL AND external_order_id IS NULL
    AND source_cart_id IS NOT NULL AND num_nonnulls(customer_id, guest_access_token_hash) = 1)
  OR (channel = 'DEALER' AND dealer_id IS NOT NULL AND external_order_id IS NOT NULL
    AND length(btrim(external_order_id)) > 0 AND source_cart_id IS NULL
    AND customer_id IS NULL AND guest_access_token_hash IS NULL
    AND fulfillment_type = 'SHIPPING' AND item_discount_amount = 0 AND voucher_discount_amount = 0
    AND voucher_code_snapshot IS NULL)
);
ALTER TABLE inventory_reservations DROP CONSTRAINT inventory_reservations_active_hold_check;
ALTER TABLE inventory_reservations ADD CONSTRAINT inventory_reservations_active_hold_check CHECK (
  status <> 'ACTIVE'
  OR (hold_reason IN ('DEPOSIT','PICKUP','DEALER_PAYMENT','DEALER_BALANCE') AND expires_at IS NOT NULL)
  OR (hold_reason IN ('REVIEW','FULFILLMENT') AND expires_at IS NULL)
);
ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_actor_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_actor_check CHECK (
  (actor_type = 'USER' AND actor_user_id IS NOT NULL AND actor_api_client_id IS NULL)
  OR (actor_type IN ('GUEST','SYSTEM') AND actor_user_id IS NULL AND actor_api_client_id IS NULL)
  OR (actor_type = 'API_CLIENT' AND actor_user_id IS NULL AND actor_api_client_id IS NOT NULL)
);
ALTER TABLE refunds ADD CONSTRAINT refunds_dealer_source_shape CHECK (
  (dealer_id IS NULL AND order_id IS NOT NULL AND dealer_bank_account_id IS NULL)
  OR (dealer_id IS NOT NULL AND payment_id IS NULL AND method = 'BANK_TRANSFER'
    AND dealer_bank_account_id IS NOT NULL AND destination_snapshot IS NOT NULL)
);
ALTER TABLE refunds ADD CONSTRAINT refunds_transfer_state_check CHECK (transfer_state IN ('NOT_SENT','SENT','UNKNOWN'));
ALTER TABLE dealer_environment ADD CONSTRAINT dealer_environment_mode_check CHECK (mode IN ('TEST','LIVE'));
ALTER TABLE dealer_profiles ADD CONSTRAINT dealer_profiles_limits_check CHECK (
  maximum_unfunded_orders BETWEEN 0 AND 20 AND risk_level IN ('NORMAL','ELEVATED','BLOCKED')
  AND business_type IN ('HOUSEHOLD','COMPANY','INDIVIDUAL') AND version > 0
);
ALTER TABLE dealer_pricing_policies ADD CONSTRAINT dealer_pricing_policy_check CHECK (
  discount_bps BETWEEN 0 AND 9900 AND shipping_fee >= 0
  AND (reserve_amount IS NULL OR reserve_amount >= 0)
  AND (minimum_profit IS NULL OR minimum_profit > 0)
  AND (NOT enabled OR (reserve_amount IS NOT NULL AND minimum_profit IS NOT NULL))
  AND submission_minutes BETWEEN 1 AND 1440 AND balance_minutes BETWEEN 1 AND 1440
  AND review_warning_minutes BETWEEN 1 AND 1440 AND version > 0
);
ALTER TABLE dealer_inventory_overrides ADD CONSTRAINT dealer_override_price_check CHECK (price IS NULL OR price > 0);
ALTER TABLE dealer_shipping_quotes ADD CONSTRAINT dealer_quote_fee_check CHECK (shipping_fee >= 0 AND expires_at > created_at);
ALTER TABLE dealer_payment_requests ADD CONSTRAINT dealer_request_amount_check CHECK (
  required_amount > 0 AND purpose IN ('FULL_PAYMENT','BALANCE')
);
CREATE UNIQUE INDEX dealer_one_open_payment_request ON dealer_payment_requests(order_id) WHERE status = 'OPEN';
CREATE UNIQUE INDEX dealer_one_review_proof ON dealer_payment_proofs(payment_request_id) WHERE status = 'UNDER_REVIEW';
ALTER TABLE dealer_payment_proofs ADD CONSTRAINT dealer_proof_review_check CHECK (
  evidence_file_size > 0 AND evidence_file_size <= 10485760
  AND ((status = 'UNDER_REVIEW' AND reviewed_at IS NULL AND reviewed_by_id IS NULL)
    OR (status <> 'UNDER_REVIEW' AND reviewed_at IS NOT NULL))
);
ALTER TABLE dealer_bank_transactions ADD CONSTRAINT dealer_receipt_amount_check CHECK (received_amount > 0);
ALTER TABLE dealer_bank_corrections ADD CONSTRAINT dealer_correction_amount_check CHECK (amount <> 0);
ALTER TABLE dealer_payment_allocations ADD CONSTRAINT dealer_allocation_amount_check CHECK (amount > 0);
ALTER TABLE dealer_allocation_reversals ADD CONSTRAINT dealer_reversal_amount_check CHECK (amount > 0);
ALTER TABLE dealer_refund_sources ADD CONSTRAINT dealer_refund_source_check CHECK (
  amount > 0 AND num_nonnulls(allocation_id, bank_transaction_id) = 1
);
ALTER TABLE dealer_api_clients ADD CONSTRAINT dealer_key_shape_check CHECK (
  environment IN ('TEST','LIVE') AND key_hash ~ '^[0-9a-f]{64}$' AND expires_at > created_at
);
ALTER TABLE dealer_order_details ADD CONSTRAINT dealer_hold_clock_check CHECK (
  (submission_remaining_ms IS NULL OR submission_remaining_ms >= 0)
  AND ((review_started_at IS NULL AND review_origin IS NULL)
    OR (review_started_at IS NOT NULL AND review_origin IN ('SUBMISSION','BALANCE')))
  AND balance_minutes > 0 AND review_warning_minutes > 0
);

CREATE FUNCTION dealer_immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Dealer ledger records are append-only' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER dealer_allocation_immutable BEFORE UPDATE OR DELETE ON dealer_payment_allocations FOR EACH ROW EXECUTE FUNCTION dealer_immutable_record();
CREATE TRIGGER dealer_reversal_immutable BEFORE UPDATE OR DELETE ON dealer_allocation_reversals FOR EACH ROW EXECUTE FUNCTION dealer_immutable_record();
CREATE TRIGGER dealer_correction_immutable BEFORE UPDATE OR DELETE ON dealer_bank_corrections FOR EACH ROW EXECUTE FUNCTION dealer_immutable_record();
CREATE TRIGGER dealer_refund_source_immutable BEFORE UPDATE OR DELETE ON dealer_refund_sources FOR EACH ROW EXECUTE FUNCTION dealer_immutable_record();

CREATE FUNCTION dealer_receipt_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Receipt is immutable' USING ERRCODE = '23514'; END IF;
  IF (NEW.id,NEW.bank_account_key,NEW.bank_reference,NEW.received_amount,NEW.received_at,NEW.verified_by_id,NEW.verified_at)
    IS DISTINCT FROM (OLD.id,OLD.bank_account_key,OLD.bank_reference,OLD.received_amount,OLD.received_at,OLD.verified_by_id,OLD.verified_at)
    OR (OLD.dealer_id IS NOT NULL AND NEW.dealer_id IS DISTINCT FROM OLD.dealer_id) THEN
    RAISE EXCEPTION 'Receipt is immutable; append a correction' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dealer_receipt_immutable BEFORE UPDATE OR DELETE ON dealer_bank_transactions FOR EACH ROW EXECUTE FUNCTION dealer_receipt_immutable();

CREATE FUNCTION dealer_allocation_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_dealer uuid; target_dealer uuid; request_order uuid;
BEGIN
  SELECT dealer_id INTO source_dealer FROM dealer_bank_transactions WHERE id = NEW.bank_transaction_id FOR UPDATE;
  SELECT dealer_id INTO target_dealer FROM orders WHERE id = NEW.order_id AND channel = 'DEALER';
  SELECT order_id INTO request_order FROM dealer_payment_requests WHERE id = NEW.payment_request_id;
  IF source_dealer IS NULL OR target_dealer IS DISTINCT FROM source_dealer OR request_order IS DISTINCT FROM NEW.order_id THEN
    RAISE EXCEPTION 'Allocation tenant/order mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dealer_allocation_ownership BEFORE INSERT ON dealer_payment_allocations FOR EACH ROW EXECUTE FUNCTION dealer_allocation_ownership();

CREATE FUNCTION dealer_refund_source_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_dealer uuid; source_order uuid; target_dealer uuid; target_order uuid;
BEGIN
  SELECT dealer_id,order_id INTO target_dealer,target_order FROM refunds WHERE id = NEW.refund_id;
  IF NEW.allocation_id IS NOT NULL THEN
    SELECT o.dealer_id,o.id INTO source_dealer,source_order FROM dealer_payment_allocations a JOIN orders o ON o.id=a.order_id WHERE a.id=NEW.allocation_id;
  ELSE
    SELECT dealer_id INTO source_dealer FROM dealer_bank_transactions WHERE id=NEW.bank_transaction_id FOR UPDATE;
    source_order := NULL;
  END IF;
  IF target_dealer IS NULL OR source_dealer IS DISTINCT FROM target_dealer OR source_order IS DISTINCT FROM target_order THEN
    RAISE EXCEPTION 'Refund source tenant/order mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dealer_refund_source_ownership BEFORE INSERT ON dealer_refund_sources FOR EACH ROW EXECUTE FUNCTION dealer_refund_source_ownership();

CREATE FUNCTION dealer_order_shape() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.channel = 'DEALER' AND (
    (SELECT count(*) FROM order_items WHERE order_id=NEW.id) <> 1
    OR NOT EXISTS (SELECT 1 FROM order_items WHERE order_id=NEW.id AND quantity=1 AND product_type_snapshot='IPHONE' AND inventory_unit_id IS NOT NULL)
    OR NOT EXISTS (SELECT 1 FROM dealer_order_details WHERE order_id=NEW.id)
  ) THEN RAISE EXCEPTION 'Dealer order requires one physical phone and snapshots' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER dealer_order_shape AFTER INSERT OR UPDATE ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dealer_order_shape();

-- Resource versions and safe outbox events follow every channel's database mutations.
CREATE FUNCTION dealer_order_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.channel = 'DEALER' THEN
    IF TG_OP = 'INSERT' THEN NEW.dealer_resource_version := 1;
    ELSIF (NEW.status,NEW.fulfillment_status,NEW.payment_status,NEW.paid_amount,NEW.refunded_amount,NEW.balance_due)
      IS DISTINCT FROM (OLD.status,OLD.fulfillment_status,OLD.payment_status,OLD.paid_amount,OLD.refunded_amount,OLD.balance_due) THEN
      NEW.dealer_resource_version := OLD.dealer_resource_version + 1;
    ELSIF NEW.dealer_resource_version > OLD.dealer_resource_version THEN
      NEW.dealer_resource_version := OLD.dealer_resource_version + 1;
    ELSE NEW.dealer_resource_version := OLD.dealer_resource_version;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dealer_order_version BEFORE INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION dealer_order_version();
CREATE FUNCTION dealer_order_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.channel = 'DEALER' AND (TG_OP = 'INSERT' OR NEW.dealer_resource_version <> OLD.dealer_resource_version) THEN
    INSERT INTO dealer_outbox_events(id,dealer_id,event_type,resource_type,resource_id,resource_version,data)
    VALUES(gen_random_uuid(),NEW.dealer_id,'order.updated','order',NEW.id::text,NEW.dealer_resource_version,
      jsonb_build_object('status',NEW.status,'fulfillmentStatus',NEW.fulfillment_status,'paymentStatus',NEW.payment_status));
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER dealer_order_event AFTER INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION dealer_order_event();

CREATE FUNCTION dealer_catalog_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM dealer_profiles WHERE business_status='ACTIVE') THEN RETURN NULL; END IF;
  INSERT INTO dealer_catalog_revision(key,version) VALUES('GLOBAL',1)
    ON CONFLICT(key) DO UPDATE SET version=dealer_catalog_revision.version+1 RETURNING version INTO revision;
  INSERT INTO dealer_outbox_events(id,dealer_id,event_type,resource_type,resource_id,resource_version,data)
    SELECT gen_random_uuid(),id,'catalog.changed','catalog','GLOBAL',revision,'{}'::jsonb FROM dealer_profiles WHERE business_status='ACTIVE';
  RETURN NULL;
END;
$$;
CREATE TRIGGER dealer_catalog_unit AFTER INSERT OR UPDATE OR DELETE ON inventory_units FOR EACH STATEMENT EXECUTE FUNCTION dealer_catalog_event();
CREATE TRIGGER dealer_catalog_hold AFTER INSERT OR UPDATE OR DELETE ON inventory_reservations FOR EACH STATEMENT EXECUTE FUNCTION dealer_catalog_event();
CREATE TRIGGER dealer_catalog_policy AFTER INSERT OR UPDATE ON dealer_pricing_policies FOR EACH STATEMENT EXECUTE FUNCTION dealer_catalog_event();
CREATE TRIGGER dealer_catalog_override AFTER INSERT OR UPDATE OR DELETE ON dealer_inventory_overrides FOR EACH STATEMENT EXECUTE FUNCTION dealer_catalog_event();
