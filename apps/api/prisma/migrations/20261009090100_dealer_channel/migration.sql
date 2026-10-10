-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('STOREFRONT', 'DEALER');

-- CreateEnum
CREATE TYPE "DealerBusinessStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'BUSINESS_SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DealerSecurityStatus" AS ENUM ('NORMAL', 'SECURITY_LOCKED');

-- CreateEnum
CREATE TYPE "DealerRequestStatus" AS ENUM ('OPEN', 'SATISFIED', 'SUPERSEDED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DealerProofStatus" AS ENUM ('UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.



-- AlterEnum

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "channel" "OrderChannel" NOT NULL DEFAULT 'STOREFRONT',
ADD COLUMN     "dealer_id" UUID,
ADD COLUMN     "dealer_resource_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "external_order_id" VARCHAR(128),
ALTER COLUMN "source_cart_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "dealer_bank_account_id" UUID,
ADD COLUMN     "dealer_id" UUID,
ADD COLUMN     "destination_snapshot" JSONB,
ADD COLUMN     "payout_hold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payout_hold_reason" TEXT,
ADD COLUMN     "transfer_state" VARCHAR(16) NOT NULL DEFAULT 'NOT_SENT',
ALTER COLUMN "order_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "actor_api_client_id" UUID;

-- CreateTable
CREATE TABLE "dealer_environment" (
    "key" VARCHAR(32) NOT NULL,
    "mode" VARCHAR(4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealer_environment_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "dealer_profiles" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "legal_name" VARCHAR(255) NOT NULL,
    "business_type" VARCHAR(24) NOT NULL,
    "tax_code" VARCHAR(32),
    "representative_name" VARCHAR(255) NOT NULL,
    "business_address" TEXT NOT NULL,
    "contact_email" VARCHAR(320) NOT NULL,
    "contact_phone" VARCHAR(32) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "logo_url" TEXT,
    "approved_domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "business_status" "DealerBusinessStatus" NOT NULL DEFAULT 'PENDING',
    "security_status" "DealerSecurityStatus" NOT NULL DEFAULT 'NORMAL',
    "terms_version" VARCHAR(32) NOT NULL,
    "terms_accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "approved_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "risk_level" VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
    "maximum_unfunded_orders" INTEGER NOT NULL DEFAULT 3,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dealer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_approval_histories" (
    "id" UUID NOT NULL,
    "dealer_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealer_approval_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_bank_accounts" (
    "id" UUID NOT NULL,
    "dealer_id" UUID NOT NULL,
    "bank_name" VARCHAR(255) NOT NULL,
    "account_number_ciphertext" TEXT NOT NULL,
    "account_last_four" VARCHAR(4) NOT NULL,
    "account_holder" VARCHAR(255) NOT NULL,
    "confirmation_hash" CHAR(64),
    "confirmation_expires_at" TIMESTAMPTZ(3),
    "email_confirmed_at" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3),
    "verified_by_id" UUID,
    "effective_at" TIMESTAMPTZ(3),
    "disabled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealer_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_pricing_policies" (
    "key" VARCHAR(32) NOT NULL DEFAULT 'GLOBAL',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "discount_bps" INTEGER NOT NULL DEFAULT 500,
    "reserve_amount" DECIMAL(15,0),
    "minimum_profit" DECIMAL(15,0),
    "shipping_fee" DECIMAL(15,0) NOT NULL DEFAULT 30000,
    "supported_provinces" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "submission_minutes" INTEGER NOT NULL DEFAULT 30,
    "balance_minutes" INTEGER NOT NULL DEFAULT 30,
    "review_warning_minutes" INTEGER NOT NULL DEFAULT 120,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dealer_pricing_policies_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "dealer_inventory_overrides" (
    "inventory_unit_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "price" DECIMAL(15,0),
    "reason" TEXT NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dealer_inventory_overrides_pkey" PRIMARY KEY ("inventory_unit_id")
);

-- CreateTable
CREATE TABLE "dealer_shipping_quotes" (
    "id" UUID NOT NULL,
    "dealer_id" UUID NOT NULL,
    "address_fingerprint" CHAR(64) NOT NULL,
    "shipping_fee" DECIMAL(15,0) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealer_shipping_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_order_details" (
    "order_id" UUID NOT NULL,
    "preview_fingerprint" CHAR(64) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "public_price_snapshot" DECIMAL(15,0) NOT NULL,
    "pricing_policy_version" INTEGER NOT NULL,
    "commercial_snapshot" JSONB NOT NULL,
    "brand_snapshot" JSONB NOT NULL,
    "shipping_snapshot" JSONB NOT NULL,
    "submission_deadline_at" TIMESTAMPTZ(3) NOT NULL,
    "submission_remaining_ms" INTEGER,
    "review_started_at" TIMESTAMPTZ(3),
    "review_origin" VARCHAR(16),
    "balance_deadline_at" TIMESTAMPTZ(3),
    "balance_minutes" INTEGER NOT NULL,
    "review_warning_minutes" INTEGER NOT NULL,
    "reconciliation_hold" BOOLEAN NOT NULL DEFAULT false,
    "linked_original_order_id" UUID,

    CONSTRAINT "dealer_order_details_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "dealer_payment_requests" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL,
    "required_amount" DECIMAL(15,0) NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "DealerRequestStatus" NOT NULL DEFAULT 'OPEN',
    "transfer_content" VARCHAR(128) NOT NULL,
    "bank_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealer_payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_payment_proofs" (
    "id" UUID NOT NULL,
    "payment_request_id" UUID NOT NULL,
    "status" "DealerProofStatus" NOT NULL DEFAULT 'UNDER_REVIEW',
    "evidence_bucket" TEXT NOT NULL,
    "evidence_object_path" TEXT NOT NULL,
    "evidence_mime_type" VARCHAR(100) NOT NULL,
    "evidence_sha256" CHAR(64) NOT NULL,
    "evidence_file_size" INTEGER NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(3),
    "reviewed_by_id" UUID,
    "reason" TEXT,
    "bank_transaction_id" UUID,

    CONSTRAINT "dealer_payment_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_bank_transactions" (
    "id" UUID NOT NULL,
    "dealer_id" UUID,
    "bank_account_key" VARCHAR(128) NOT NULL,
    "bank_reference" VARCHAR(128) NOT NULL,
    "received_amount" DECIMAL(15,0) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "verified_by_id" UUID NOT NULL,
    "verified_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT NOT NULL,
    "reconciliation_hold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "dealer_bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_bank_corrections" (
    "id" UUID NOT NULL,
    "bank_transaction_id" UUID NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "reason" TEXT NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealer_bank_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_payment_allocations" (
    "id" UUID NOT NULL,
    "bank_transaction_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "payment_request_id" UUID NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealer_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_allocation_reversals" (
    "id" UUID NOT NULL,
    "allocation_id" UUID NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "reason" TEXT NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealer_allocation_reversals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_refund_sources" (
    "id" UUID NOT NULL,
    "refund_id" UUID NOT NULL,
    "allocation_id" UUID,
    "bank_transaction_id" UUID,
    "amount" DECIMAL(15,0) NOT NULL,

    CONSTRAINT "dealer_refund_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_api_clients" (
    "id" UUID NOT NULL,
    "dealer_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "key_hash" CHAR(64) NOT NULL,
    "key_prefix" VARCHAR(32) NOT NULL,
    "environment" VARCHAR(4) NOT NULL,
    "scopes" TEXT[],
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealer_api_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_idempotency_records" (
    "id" UUID NOT NULL,
    "dealer_id" UUID NOT NULL,
    "operation" VARCHAR(100) NOT NULL,
    "key_hash" CHAR(64) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "resource_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealer_idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_rate_limits" (
    "key" VARCHAR(255) NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "dealer_rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "dealer_catalog_revision" (
    "key" VARCHAR(32) NOT NULL DEFAULT 'GLOBAL',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "dealer_catalog_revision_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "dealer_webhook_endpoints" (
    "id" UUID NOT NULL,
    "dealer_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "secret_ciphertext" TEXT NOT NULL,
    "key_id" UUID NOT NULL,
    "previous_secret_ciphertext" TEXT,
    "previous_key_id" UUID,
    "previous_valid_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealer_webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_outbox_events" (
    "id" UUID NOT NULL,
    "dealer_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "resource_type" VARCHAR(32) NOT NULL,
    "resource_id" VARCHAR(64) NOT NULL,
    "resource_version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expanded_at" TIMESTAMPTZ(3),

    CONSTRAINT "dealer_outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_webhook_deliveries" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "endpoint_id" UUID NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "due_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_until" TIMESTAMPTZ(3),
    "lease_token" UUID,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "last_status_code" INTEGER,
    "last_error" VARCHAR(100),
    "delivered_at" TIMESTAMPTZ(3),

    CONSTRAINT "dealer_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dealer_profiles_owner_user_id_key" ON "dealer_profiles"("owner_user_id");

-- CreateIndex
CREATE INDEX "dealer_profiles_business_status_created_at_idx" ON "dealer_profiles"("business_status", "created_at");

-- CreateIndex
CREATE INDEX "dealer_approval_histories_dealer_id_created_at_idx" ON "dealer_approval_histories"("dealer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_bank_accounts_confirmation_hash_key" ON "dealer_bank_accounts"("confirmation_hash");

-- CreateIndex
CREATE INDEX "dealer_bank_accounts_dealer_id_created_at_idx" ON "dealer_bank_accounts"("dealer_id", "created_at");

-- CreateIndex
CREATE INDEX "dealer_shipping_quotes_dealer_id_expires_at_idx" ON "dealer_shipping_quotes"("dealer_id", "expires_at");

-- CreateIndex
CREATE INDEX "dealer_order_details_submission_deadline_at_idx" ON "dealer_order_details"("submission_deadline_at");

-- CreateIndex
CREATE INDEX "dealer_order_details_balance_deadline_at_idx" ON "dealer_order_details"("balance_deadline_at");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_payment_requests_transfer_content_key" ON "dealer_payment_requests"("transfer_content");

-- CreateIndex
CREATE INDEX "dealer_payment_requests_order_id_status_idx" ON "dealer_payment_requests"("order_id", "status");

-- CreateIndex
CREATE INDEX "dealer_payment_proofs_status_submitted_at_idx" ON "dealer_payment_proofs"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "dealer_bank_transactions_dealer_id_received_at_idx" ON "dealer_bank_transactions"("dealer_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_bank_transactions_bank_account_key_bank_reference_key" ON "dealer_bank_transactions"("bank_account_key", "bank_reference");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_bank_corrections_idempotency_key_key" ON "dealer_bank_corrections"("idempotency_key");

-- CreateIndex
CREATE INDEX "dealer_payment_allocations_order_id_idx" ON "dealer_payment_allocations"("order_id");

-- CreateIndex
CREATE INDEX "dealer_payment_allocations_bank_transaction_id_idx" ON "dealer_payment_allocations"("bank_transaction_id");

-- CreateIndex
CREATE INDEX "dealer_refund_sources_allocation_id_idx" ON "dealer_refund_sources"("allocation_id");

-- CreateIndex
CREATE INDEX "dealer_refund_sources_bank_transaction_id_idx" ON "dealer_refund_sources"("bank_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_refund_sources_refund_id_allocation_id_key" ON "dealer_refund_sources"("refund_id", "allocation_id");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_refund_sources_refund_id_bank_transaction_id_key" ON "dealer_refund_sources"("refund_id", "bank_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_api_clients_key_hash_key" ON "dealer_api_clients"("key_hash");

-- CreateIndex
CREATE INDEX "dealer_api_clients_dealer_id_revoked_at_idx" ON "dealer_api_clients"("dealer_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_idempotency_records_dealer_id_operation_key_hash_key" ON "dealer_idempotency_records"("dealer_id", "operation", "key_hash");

-- CreateIndex
CREATE INDEX "dealer_webhook_endpoints_dealer_id_enabled_idx" ON "dealer_webhook_endpoints"("dealer_id", "enabled");

-- CreateIndex
CREATE INDEX "dealer_outbox_events_expanded_at_occurred_at_idx" ON "dealer_outbox_events"("expanded_at", "occurred_at");

-- CreateIndex
CREATE INDEX "dealer_outbox_events_dealer_id_occurred_at_idx" ON "dealer_outbox_events"("dealer_id", "occurred_at");

-- CreateIndex
CREATE INDEX "dealer_webhook_deliveries_status_due_at_idx" ON "dealer_webhook_deliveries"("status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_webhook_deliveries_event_id_endpoint_id_key" ON "dealer_webhook_deliveries"("event_id", "endpoint_id");

-- CreateIndex
CREATE INDEX "orders_channel_created_at_idx" ON "orders"("channel", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "orders_dealer_id_external_order_id_key" ON "orders"("dealer_id", "external_order_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_dealer_id_fkey" FOREIGN KEY ("dealer_id") REFERENCES "dealer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_dealer_id_fkey" FOREIGN KEY ("dealer_id") REFERENCES "dealer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_dealer_bank_account_id_fkey" FOREIGN KEY ("dealer_bank_account_id") REFERENCES "dealer_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_api_client_id_fkey" FOREIGN KEY ("actor_api_client_id") REFERENCES "dealer_api_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_profiles" ADD CONSTRAINT "dealer_profiles_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_approval_histories" ADD CONSTRAINT "dealer_approval_histories_dealer_id_fkey" FOREIGN KEY ("dealer_id") REFERENCES "dealer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_bank_accounts" ADD CONSTRAINT "dealer_bank_accounts_dealer_id_fkey" FOREIGN KEY ("dealer_id") REFERENCES "dealer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_inventory_overrides" ADD CONSTRAINT "dealer_inventory_overrides_inventory_unit_id_fkey" FOREIGN KEY ("inventory_unit_id") REFERENCES "inventory_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_shipping_quotes" ADD CONSTRAINT "dealer_shipping_quotes_dealer_id_fkey" FOREIGN KEY ("dealer_id") REFERENCES "dealer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_order_details" ADD CONSTRAINT "dealer_order_details_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_payment_requests" ADD CONSTRAINT "dealer_payment_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_payment_proofs" ADD CONSTRAINT "dealer_payment_proofs_payment_request_id_fkey" FOREIGN KEY ("payment_request_id") REFERENCES "dealer_payment_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_payment_proofs" ADD CONSTRAINT "dealer_payment_proofs_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "dealer_bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_bank_transactions" ADD CONSTRAINT "dealer_bank_transactions_dealer_id_fkey" FOREIGN KEY ("dealer_id") REFERENCES "dealer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_bank_corrections" ADD CONSTRAINT "dealer_bank_corrections_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "dealer_bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_payment_allocations" ADD CONSTRAINT "dealer_payment_allocations_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "dealer_bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_payment_allocations" ADD CONSTRAINT "dealer_payment_allocations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_payment_allocations" ADD CONSTRAINT "dealer_payment_allocations_payment_request_id_fkey" FOREIGN KEY ("payment_request_id") REFERENCES "dealer_payment_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_allocation_reversals" ADD CONSTRAINT "dealer_allocation_reversals_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "dealer_payment_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_refund_sources" ADD CONSTRAINT "dealer_refund_sources_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_refund_sources" ADD CONSTRAINT "dealer_refund_sources_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "dealer_payment_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_refund_sources" ADD CONSTRAINT "dealer_refund_sources_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "dealer_bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_api_clients" ADD CONSTRAINT "dealer_api_clients_dealer_id_fkey" FOREIGN KEY ("dealer_id") REFERENCES "dealer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_idempotency_records" ADD CONSTRAINT "dealer_idempotency_records_dealer_id_fkey" FOREIGN KEY ("dealer_id") REFERENCES "dealer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_webhook_endpoints" ADD CONSTRAINT "dealer_webhook_endpoints_dealer_id_fkey" FOREIGN KEY ("dealer_id") REFERENCES "dealer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_outbox_events" ADD CONSTRAINT "dealer_outbox_events_dealer_id_fkey" FOREIGN KEY ("dealer_id") REFERENCES "dealer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_webhook_deliveries" ADD CONSTRAINT "dealer_webhook_deliveries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "dealer_outbox_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_webhook_deliveries" ADD CONSTRAINT "dealer_webhook_deliveries_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "dealer_webhook_endpoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
