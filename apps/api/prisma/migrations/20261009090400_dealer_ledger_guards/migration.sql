-- Cross-row checks run at commit, after the aggregate and its sources have been written.
CREATE FUNCTION dealer_validate_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_ids uuid[]; receipt_id uuid; received numeric; allocated numeric; direct_refunds numeric;
BEGIN
  IF TG_TABLE_NAME = 'dealer_payment_allocations' OR TG_TABLE_NAME = 'dealer_bank_corrections' THEN
    target_ids := ARRAY[NEW.bank_transaction_id];
  ELSIF TG_TABLE_NAME = 'dealer_allocation_reversals' THEN
    SELECT ARRAY[bank_transaction_id] INTO target_ids FROM dealer_payment_allocations WHERE id=NEW.allocation_id;
  ELSIF TG_TABLE_NAME = 'dealer_refund_sources' THEN
    SELECT ARRAY[COALESCE(NEW.bank_transaction_id,(SELECT bank_transaction_id FROM dealer_payment_allocations WHERE id=NEW.allocation_id))] INTO target_ids;
  ELSIF TG_TABLE_NAME = 'refunds' THEN
    IF NEW.dealer_id IS NULL THEN RETURN NULL; END IF;
    SELECT array_agg(DISTINCT COALESCE(s.bank_transaction_id,a.bank_transaction_id)) INTO target_ids
      FROM dealer_refund_sources s LEFT JOIN dealer_payment_allocations a ON a.id=s.allocation_id WHERE s.refund_id=NEW.id;
    IF (SELECT COALESCE(sum(amount),0) FROM dealer_refund_sources WHERE refund_id=NEW.id) <> NEW.amount THEN
      RAISE EXCEPTION 'Dealer refund sources must equal the obligation' USING ERRCODE='23514';
    END IF;
  END IF;
  FOREACH receipt_id IN ARRAY COALESCE(target_ids,'{}'::uuid[]) LOOP
    PERFORM id FROM dealer_bank_transactions WHERE id=receipt_id FOR UPDATE;
    SELECT b.received_amount+COALESCE((SELECT sum(c.amount) FROM dealer_bank_corrections c WHERE c.bank_transaction_id=b.id),0)
      INTO received FROM dealer_bank_transactions b WHERE b.id=receipt_id;
    SELECT COALESCE(sum(a.amount-COALESCE((SELECT sum(r.amount) FROM dealer_allocation_reversals r WHERE r.allocation_id=a.id),0)),0)
      INTO allocated FROM dealer_payment_allocations a WHERE a.bank_transaction_id=receipt_id;
    SELECT COALESCE(sum(s.amount),0) INTO direct_refunds FROM dealer_refund_sources s JOIN refunds r ON r.id=s.refund_id
      WHERE s.bank_transaction_id=receipt_id AND r.status IN ('REQUESTED','PROCESSING','COMPLETED');
    IF received < 0 OR allocated+direct_refunds > received THEN RAISE EXCEPTION 'Dealer receipt allocation limit exceeded' USING ERRCODE='23514'; END IF;
    IF EXISTS(SELECT 1 FROM dealer_payment_allocations a WHERE a.bank_transaction_id=receipt_id AND
      COALESCE((SELECT sum(v.amount) FROM dealer_allocation_reversals v WHERE v.allocation_id=a.id),0)
      +COALESCE((SELECT sum(s.amount) FROM dealer_refund_sources s JOIN refunds r ON r.id=s.refund_id WHERE s.allocation_id=a.id AND r.status IN ('REQUESTED','PROCESSING','COMPLETED')),0)>a.amount) THEN
      RAISE EXCEPTION 'Dealer allocation refund limit exceeded' USING ERRCODE='23514';
    END IF;
    IF EXISTS(SELECT 1 FROM orders o WHERE o.id IN (SELECT order_id FROM dealer_payment_allocations WHERE bank_transaction_id=receipt_id)
      AND (SELECT COALESCE(sum(a.amount-COALESCE((SELECT sum(v.amount) FROM dealer_allocation_reversals v WHERE v.allocation_id=a.id),0)),0)
        FROM dealer_payment_allocations a WHERE a.order_id=o.id)>o.grand_total) THEN
      RAISE EXCEPTION 'Dealer order allocation limit exceeded' USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER dealer_ledger_allocation AFTER INSERT ON dealer_payment_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dealer_validate_ledger();
CREATE CONSTRAINT TRIGGER dealer_ledger_correction AFTER INSERT ON dealer_bank_corrections DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dealer_validate_ledger();
CREATE CONSTRAINT TRIGGER dealer_ledger_reversal AFTER INSERT ON dealer_allocation_reversals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dealer_validate_ledger();
CREATE CONSTRAINT TRIGGER dealer_ledger_refund_source AFTER INSERT ON dealer_refund_sources DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dealer_validate_ledger();
CREATE CONSTRAINT TRIGGER dealer_ledger_refund AFTER INSERT OR UPDATE ON refunds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dealer_validate_ledger();

CREATE FUNCTION dealer_no_legacy_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND channel='DEALER') THEN RAISE EXCEPTION 'Dealer receipts must use the dealer ledger' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dealer_no_legacy_payment BEFORE INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION dealer_no_legacy_payment();

CREATE FUNCTION dealer_frozen_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.channel<>NEW.channel OR OLD.dealer_id IS DISTINCT FROM NEW.dealer_id THEN RAISE EXCEPTION 'Order channel and dealer are immutable' USING ERRCODE='23514'; END IF;
  IF OLD.channel='DEALER' AND (OLD.subtotal,OLD.shipping_fee,OLD.grand_total,OLD.shipping_address_snapshot,OLD.external_order_id)
    IS DISTINCT FROM (NEW.subtotal,NEW.shipping_fee,NEW.grand_total,NEW.shipping_address_snapshot,NEW.external_order_id) THEN
    RAISE EXCEPTION 'Dealer price and recipient snapshots are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dealer_frozen_order BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION dealer_frozen_order();

CREATE INDEX dealer_outbox_resource_idx ON dealer_outbox_events(resource_type,resource_id,resource_version);
CREATE FUNCTION dealer_child_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE dealer uuid; order_root uuid; resource text; version integer;
BEGIN
  IF TG_TABLE_NAME='refunds' THEN dealer:=NEW.dealer_id; order_root:=NEW.order_id; resource:='refund';
  ELSIF TG_TABLE_NAME='after_sales_requests' THEN
    SELECT o.dealer_id,o.id INTO dealer,order_root FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.id=NEW.order_item_id;
    resource:='after_sales';
  ELSIF TG_TABLE_NAME='shipments' THEN
    SELECT dealer_id,id INTO dealer,order_root FROM orders WHERE id=NEW.order_id;
    resource:='shipment';
  END IF;
  IF dealer IS NULL THEN RETURN NULL; END IF;
  IF order_root IS NOT NULL THEN UPDATE orders SET dealer_resource_version=dealer_resource_version+1 WHERE id=order_root; END IF;
  SELECT COALESCE(max(resource_version),0)+1 INTO version FROM dealer_outbox_events WHERE resource_type=resource AND resource_id=NEW.id::text;
  INSERT INTO dealer_outbox_events(id,dealer_id,event_type,resource_type,resource_id,resource_version,data)
    VALUES(gen_random_uuid(),dealer,resource||'.updated',resource,NEW.id::text,version,jsonb_build_object('status',NEW.status,'orderId',order_root));
  RETURN NULL;
END;
$$;
CREATE TRIGGER dealer_refund_event AFTER INSERT OR UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION dealer_child_event();
CREATE TRIGGER dealer_after_sales_event AFTER INSERT OR UPDATE ON after_sales_requests FOR EACH ROW EXECUTE FUNCTION dealer_child_event();
CREATE TRIGGER dealer_shipment_event AFTER INSERT OR UPDATE ON shipments FOR EACH ROW EXECUTE FUNCTION dealer_child_event();
CREATE TRIGGER dealer_catalog_variant AFTER UPDATE ON product_variants FOR EACH STATEMENT EXECUTE FUNCTION dealer_catalog_event();
CREATE TRIGGER dealer_catalog_product AFTER UPDATE ON products FOR EACH STATEMENT EXECUTE FUNCTION dealer_catalog_event();
CREATE TRIGGER dealer_catalog_inspection AFTER INSERT OR UPDATE ON inventory_inspections FOR EACH STATEMENT EXECUTE FUNCTION dealer_catalog_event();
CREATE TRIGGER dealer_catalog_warranty AFTER UPDATE ON warranty_policies FOR EACH STATEMENT EXECUTE FUNCTION dealer_catalog_event();
CREATE TRIGGER dealer_catalog_settings AFTER UPDATE ON store_settings FOR EACH STATEMENT EXECUTE FUNCTION dealer_catalog_event();
