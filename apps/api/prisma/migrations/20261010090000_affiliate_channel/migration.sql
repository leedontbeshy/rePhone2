-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "affiliate_allocations" JSONB;

-- CreateTable
CREATE TABLE "affiliate_policies" (
    "key" VARCHAR(16) NOT NULL DEFAULT 'GLOBAL',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rate_bps" INTEGER,
    "reserve_amount" DECIMAL(15,0),
    "minimum_profit" DECIMAL(15,0),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "affiliate_policies_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "affiliate_profiles" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "promotion_channels" VARCHAR(1000) NOT NULL,
    "terms_version" VARCHAR(40) NOT NULL,
    "terms_accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "payout_hold" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "affiliate_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_inventory_overrides" (
    "inventory_unit_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rate_bps" INTEGER,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "affiliate_inventory_overrides_pkey" PRIMARY KEY ("inventory_unit_id")
);

-- CreateTable
CREATE TABLE "affiliate_bank_accounts" (
    "id" UUID NOT NULL,
    "affiliate_id" UUID NOT NULL,
    "bank_name" VARCHAR(120) NOT NULL,
    "account_holder" VARCHAR(120) NOT NULL,
    "account_ciphertext" TEXT NOT NULL,
    "account_fingerprint" CHAR(64) NOT NULL,
    "last_four" VARCHAR(4) NOT NULL,
    "confirmation_hash" CHAR(64),
    "confirmation_expires_at" TIMESTAMPTZ(3),
    "confirmation_sent_at" TIMESTAMPTZ(3),
    "email_confirmed_at" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3),
    "effective_at" TIMESTAMPTZ(3),
    "disabled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_referrals" (
    "id" UUID NOT NULL,
    "affiliate_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "affiliate_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_attributions" (
    "order_id" UUID NOT NULL,
    "affiliate_id" UUID NOT NULL,
    "referred_at" TIMESTAMPTZ(3) NOT NULL,
    "policy_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_attributions_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "affiliate_commissions" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "rate_bps" INTEGER NOT NULL,
    "base_amount" DECIMAL(15,0) NOT NULL,
    "floor_amount" DECIMAL(15,0) NOT NULL,
    "original_amount" DECIMAL(15,0) NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "paid_amount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "absorbed_loss" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "hold_reason" VARCHAR(120),
    "available_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "affiliate_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_adjustments" (
    "id" UUID NOT NULL,
    "commission_id" UUID NOT NULL,
    "source_key" VARCHAR(180) NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "reason" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_payouts" (
    "id" UUID NOT NULL,
    "affiliate_id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "bank_snapshot" JSONB NOT NULL,
    "request_key" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "transfer_reference" VARCHAR(150),
    "evidence" JSONB,
    "transferred_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "affiliate_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_payout_items" (
    "id" UUID NOT NULL,
    "payout_id" UUID NOT NULL,
    "commission_id" UUID NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "affiliate_payout_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_profiles_owner_user_id_key" ON "affiliate_profiles"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_profiles_code_key" ON "affiliate_profiles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_bank_accounts_confirmation_hash_key" ON "affiliate_bank_accounts"("confirmation_hash");

-- CreateIndex
CREATE INDEX "affiliate_bank_accounts_affiliate_id_created_at_idx" ON "affiliate_bank_accounts"("affiliate_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_referrals_token_hash_key" ON "affiliate_referrals"("token_hash");

-- CreateIndex
CREATE INDEX "affiliate_referrals_affiliate_id_created_at_idx" ON "affiliate_referrals"("affiliate_id", "created_at");

-- CreateIndex
CREATE INDEX "affiliate_referrals_expires_at_idx" ON "affiliate_referrals"("expires_at");

-- CreateIndex
CREATE INDEX "affiliate_attributions_affiliate_id_created_at_idx" ON "affiliate_attributions"("affiliate_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_commissions_order_item_id_key" ON "affiliate_commissions"("order_item_id");

-- CreateIndex
CREATE INDEX "affiliate_commissions_order_id_idx" ON "affiliate_commissions"("order_id");

-- CreateIndex
CREATE INDEX "affiliate_commissions_status_available_at_idx" ON "affiliate_commissions"("status", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_adjustments_source_key_key" ON "affiliate_adjustments"("source_key");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_payouts_transfer_reference_key" ON "affiliate_payouts"("transfer_reference");

-- CreateIndex
CREATE INDEX "affiliate_payouts_status_created_at_idx" ON "affiliate_payouts"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_payouts_affiliate_id_request_key_key" ON "affiliate_payouts"("affiliate_id", "request_key");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_payout_items_payout_id_commission_id_key" ON "affiliate_payout_items"("payout_id", "commission_id");

-- AddForeignKey
ALTER TABLE "affiliate_profiles" ADD CONSTRAINT "affiliate_profiles_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_inventory_overrides" ADD CONSTRAINT "affiliate_inventory_overrides_inventory_unit_id_fkey" FOREIGN KEY ("inventory_unit_id") REFERENCES "inventory_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_bank_accounts" ADD CONSTRAINT "affiliate_bank_accounts_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliate_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_referrals" ADD CONSTRAINT "affiliate_referrals_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliate_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_attributions" ADD CONSTRAINT "affiliate_attributions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_attributions" ADD CONSTRAINT "affiliate_attributions_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliate_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "affiliate_attributions"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_adjustments" ADD CONSTRAINT "affiliate_adjustments_commission_id_fkey" FOREIGN KEY ("commission_id") REFERENCES "affiliate_commissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliate_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "affiliate_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_payout_items" ADD CONSTRAINT "affiliate_payout_items_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "affiliate_payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_payout_items" ADD CONSTRAINT "affiliate_payout_items_commission_id_fkey" FOREIGN KEY ("commission_id") REFERENCES "affiliate_commissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Money/state invariants and reservation uniqueness are enforced independently of API validation.
ALTER TABLE affiliate_policies ADD CHECK (rate_bps BETWEEN 0 AND 500), ADD CHECK (reserve_amount >= 0 AND minimum_profit >= 0), ADD CHECK (NOT enabled OR (rate_bps IS NOT NULL AND reserve_amount IS NOT NULL AND minimum_profit IS NOT NULL));
ALTER TABLE affiliate_inventory_overrides ADD CHECK (rate_bps BETWEEN 0 AND 500);
ALTER TABLE affiliate_profiles ADD CHECK (status IN ('PENDING','ACTIVE','REJECTED','SUSPENDED'));
ALTER TABLE affiliate_commissions ADD CHECK (rate_bps BETWEEN 0 AND 500 AND base_amount >= 0 AND floor_amount >= 0 AND original_amount >= 0 AND amount >= 0 AND amount <= original_amount AND paid_amount >= 0 AND absorbed_loss >= 0 AND absorbed_loss <= paid_amount), ADD CHECK (status IN ('PENDING','HELD','AVAILABLE','RESERVED','PAID','VOID'));
ALTER TABLE affiliate_payouts ADD CHECK (amount >= 200000), ADD CHECK (status IN ('REQUESTED','PROCESSING','NEEDS_REVIEW','PAID','REJECTED','CANCELLED')), ADD CHECK (status <> 'PAID' OR (transfer_reference IS NOT NULL AND transferred_at IS NOT NULL AND evidence IS NOT NULL));
ALTER TABLE affiliate_payout_items ADD CHECK (amount > 0);
CREATE UNIQUE INDEX affiliate_one_open_payout ON affiliate_payouts (affiliate_id) WHERE status IN ('REQUESTED','PROCESSING','NEEDS_REVIEW');
CREATE UNIQUE INDEX affiliate_one_reserved_commission ON affiliate_payout_items (commission_id) WHERE active;
CREATE UNIQUE INDEX affiliate_bank_active_fingerprint ON affiliate_bank_accounts (affiliate_id,account_fingerprint) WHERE disabled_at IS NULL;
CREATE FUNCTION affiliate_validate_relations() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'affiliate_attributions' THEN
    IF NOT EXISTS (SELECT 1 FROM orders WHERE id=NEW.order_id AND channel='STOREFRONT') THEN RAISE EXCEPTION 'Affiliate attribution requires storefront order'; END IF;
  ELSIF TG_TABLE_NAME = 'affiliate_commissions' THEN
    IF NOT EXISTS (SELECT 1 FROM order_items WHERE id=NEW.order_item_id AND order_id=NEW.order_id AND product_type_snapshot='IPHONE') THEN RAISE EXCEPTION 'Affiliate commission requires matching iPhone line'; END IF;
  ELSIF TG_TABLE_NAME = 'affiliate_payouts' THEN
    IF NOT EXISTS (SELECT 1 FROM affiliate_bank_accounts WHERE id=NEW.bank_account_id AND affiliate_id=NEW.affiliate_id) THEN RAISE EXCEPTION 'Affiliate bank owner mismatch'; END IF;
  ELSIF TG_TABLE_NAME = 'affiliate_payout_items' THEN
    IF NOT EXISTS (SELECT 1 FROM affiliate_commissions c JOIN affiliate_attributions a ON a.order_id=c.order_id JOIN affiliate_payouts p ON p.affiliate_id=a.affiliate_id WHERE c.id=NEW.commission_id AND p.id=NEW.payout_id) THEN RAISE EXCEPTION 'Affiliate payout source owner mismatch'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER affiliate_attribution_shape BEFORE INSERT OR UPDATE ON affiliate_attributions FOR EACH ROW EXECUTE FUNCTION affiliate_validate_relations();
CREATE TRIGGER affiliate_commission_shape BEFORE INSERT OR UPDATE ON affiliate_commissions FOR EACH ROW EXECUTE FUNCTION affiliate_validate_relations();
CREATE TRIGGER affiliate_payout_shape BEFORE INSERT OR UPDATE ON affiliate_payouts FOR EACH ROW EXECUTE FUNCTION affiliate_validate_relations();
CREATE TRIGGER affiliate_payout_item_shape BEFORE INSERT OR UPDATE ON affiliate_payout_items FOR EACH ROW EXECUTE FUNCTION affiliate_validate_relations();
