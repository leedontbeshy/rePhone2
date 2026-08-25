-- Slice 12 system-administration invariants. Forward-only; run the exact Slice 12
-- preflight before deploying this migration.

-- Store settings remain a single VND/Ho Chi Minh configuration row. The final
-- P0 management API exposes bounded operational windows, so protect the same
-- contract at the database boundary.
ALTER TABLE "store_settings" DROP CONSTRAINT "store_settings_singleton_check";
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_singleton_check" CHECK (
  "key" = 'STORE'
  AND "currency" = 'VND'
  AND "timezone" = 'Asia/Ho_Chi_Minh'
  AND NULLIF(BTRIM("store_name"), '') IS NOT NULL
  AND NULLIF(BTRIM("store_phone"), '') IS NOT NULL
  AND NULLIF(BTRIM("store_address"), '') IS NOT NULL
  AND "default_shipping_fee" >= 0
  AND "shipping_deposit_amount" > 0
  AND "pickup_hold_minutes" BETWEEN 1 AND 10080
  AND "deposit_proof_window_minutes" BETWEEN 1 AND 10080
  AND "deposit_review_window_minutes" BETWEEN 1 AND 10080
  AND "default_warranty_days" BETWEEN 0 AND 3650
  AND CHAR_LENGTH(BTRIM("default_warranty_terms")) BETWEEN 1 AND 10000
  AND NULLIF(BTRIM("bank_name"), '') IS NOT NULL
  AND NULLIF(BTRIM("bank_account_number"), '') IS NOT NULL
  AND NULLIF(BTRIM("bank_account_holder"), '') IS NOT NULL
  AND "version" > 0
) NOT VALID;
ALTER TABLE "store_settings" VALIDATE CONSTRAINT "store_settings_singleton_check";

-- Authentication credentials are lookup digests, never raw refresh or one-time
-- tokens. Lowercase hex keeps equality and incident-response queries canonical.
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_refresh_token_hash_shape_check" CHECK (
  "refresh_token_hash" ~ '^[0-9a-f]{64}$'
) NOT VALID;
ALTER TABLE "auth_sessions"
  VALIDATE CONSTRAINT "auth_sessions_refresh_token_hash_shape_check";

ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_token_hash_shape_check" CHECK (
  "token_hash" ~ '^[0-9a-f]{64}$'
) NOT VALID;
ALTER TABLE "auth_tokens" VALIDATE CONSTRAINT "auth_tokens_token_hash_shape_check";

-- Audit history is append-only even if a future repository accidentally exposes
-- mutation methods. Test cleanup uses TRUNCATE and is intentionally unaffected.
CREATE FUNCTION "rephone_prevent_audit_log_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "audit_logs_append_only"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION "rephone_prevent_audit_log_mutation"();

-- Bounded cleanup jobs scan by terminal/expiry time and stable UUID order.
CREATE INDEX "auth_sessions_expires_at_id_idx"
  ON "auth_sessions"("expires_at", "id");
CREATE INDEX "auth_sessions_revoked_at_id_idx"
  ON "auth_sessions"("revoked_at", "id")
  WHERE "revoked_at" IS NOT NULL;
CREATE INDEX "auth_tokens_expires_at_id_idx"
  ON "auth_tokens"("expires_at", "id");
CREATE INDEX "auth_tokens_consumed_at_id_idx"
  ON "auth_tokens"("consumed_at", "id")
  WHERE "consumed_at" IS NOT NULL;

-- Backoffice audit/customer queries keep deterministic keyset-friendly ordering.
-- text_pattern_ops makes the documented namespaced action prefix filter indexable.
CREATE INDEX "audit_logs_action_pattern_created_at_id_idx"
  ON "audit_logs"("action" text_pattern_ops, "created_at" DESC, "id");
CREATE INDEX "audit_logs_actor_type_created_at_id_idx"
  ON "audit_logs"("actor_type", "created_at" DESC, "id");
CREATE INDEX "audit_logs_request_id_created_at_id_idx"
  ON "audit_logs"("request_id", "created_at" DESC, "id")
  WHERE "request_id" IS NOT NULL;
CREATE INDEX "users_customer_last_login_at_id_idx"
  ON "users"("last_login_at" DESC NULLS LAST, "id" DESC)
  WHERE "role" = 'CUSTOMER';
