-- Financial history is append-only; adjustments never rewrite a paid transfer.
CREATE FUNCTION affiliate_protect_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'affiliate_adjustments' THEN
    RAISE EXCEPTION 'Affiliate adjustments are append-only';
  ELSIF TG_TABLE_NAME = 'affiliate_commissions' THEN
    IF (NEW.order_id, NEW.order_item_id, NEW.rate_bps, NEW.base_amount, NEW.floor_amount, NEW.original_amount)
      IS DISTINCT FROM (OLD.order_id, OLD.order_item_id, OLD.rate_bps, OLD.base_amount, OLD.floor_amount, OLD.original_amount)
      OR (OLD.paid_amount > 0 AND NEW.paid_amount <> OLD.paid_amount) THEN
      RAISE EXCEPTION 'Affiliate monetary snapshots are immutable';
    END IF;
  ELSIF TG_TABLE_NAME = 'affiliate_payouts' THEN
    IF (NEW.affiliate_id,NEW.bank_account_id,NEW.bank_snapshot,NEW.request_key,NEW.amount)
      IS DISTINCT FROM (OLD.affiliate_id,OLD.bank_account_id,OLD.bank_snapshot,OLD.request_key,OLD.amount)
      OR (OLD.status='PAID' AND NEW IS DISTINCT FROM OLD) THEN
      RAISE EXCEPTION 'Affiliate payout snapshot is immutable';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER affiliate_adjustment_immutable BEFORE UPDATE OR DELETE ON affiliate_adjustments FOR EACH ROW EXECUTE FUNCTION affiliate_protect_history();
CREATE TRIGGER affiliate_commission_immutable BEFORE UPDATE ON affiliate_commissions FOR EACH ROW EXECUTE FUNCTION affiliate_protect_history();
CREATE TRIGGER affiliate_payout_immutable BEFORE UPDATE ON affiliate_payouts FOR EACH ROW EXECUTE FUNCTION affiliate_protect_history();

CREATE FUNCTION affiliate_payout_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; total numeric; expected numeric;
BEGIN
  IF TG_TABLE_NAME = 'affiliate_payouts' THEN target := NEW.id;
  ELSE target := NEW.payout_id; END IF;
  SELECT amount INTO expected FROM affiliate_payouts WHERE id=target;
  SELECT COALESCE(sum(amount),0) INTO total FROM affiliate_payout_items WHERE payout_id=target;
  IF total <> expected THEN RAISE EXCEPTION 'Affiliate payout total must match its source items'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER affiliate_payout_total AFTER INSERT OR UPDATE ON affiliate_payouts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION affiliate_payout_total();
CREATE CONSTRAINT TRIGGER affiliate_payout_item_total AFTER INSERT OR UPDATE ON affiliate_payout_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION affiliate_payout_total();
REVOKE EXECUTE ON FUNCTION affiliate_validate_relations(), affiliate_protect_history(), affiliate_payout_total() FROM PUBLIC;
