-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EMPLOYEE', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "AuthTokenPurpose" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD', 'EMPLOYEE_INVITATION');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('IPHONE', 'ACCESSORY');

-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InventoryMode" AS ENUM ('SERIALIZED', 'QUANTITY');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('STORE', 'WAREHOUSE');

-- CreateEnum
CREATE TYPE "ActiveStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SimLockStatus" AS ENUM ('UNLOCKED', 'CARRIER_LOCKED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SimConfiguration" AS ENUM ('SINGLE_PHYSICAL', 'DUAL_PHYSICAL', 'PHYSICAL_AND_ESIM', 'ESIM_ONLY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "InventoryLifecycleStatus" AS ENUM ('RECEIVED', 'INSPECTING', 'AVAILABLE', 'IN_TRANSIT', 'SOLD', 'REPAIRING', 'QUARANTINED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "InspectionType" AS ENUM ('INTAKE', 'RETURN', 'WARRANTY', 'PRE_SALE');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BatteryReplacementStatus" AS ENUM ('ORIGINAL', 'REPLACED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ConditionGrade" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "RepairHistoryStatus" AS ENUM ('NONE_KNOWN', 'KNOWN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('INCOMPLETE', 'PASSED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'SALE', 'RETURN', 'TRANSFER', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'WRITE_OFF');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'EXPIRED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "ReservationReason" AS ENUM ('DEPOSIT', 'REVIEW', 'PICKUP', 'FULFILLMENT');

-- CreateEnum
CREATE TYPE "MediaVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'ABANDONED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('FIXED', 'PERCENT');

-- CreateEnum
CREATE TYPE "VoucherVisibility" AS ENUM ('PUBLIC', 'ACCOUNT_ONLY');

-- CreateEnum
CREATE TYPE "VoucherScopeType" AS ENUM ('ORDER', 'PRODUCT_TYPE', 'PRODUCTS', 'VARIANTS');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VoucherUsageStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PLACED', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('PICKUP', 'SHIPPING');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'IN_TRANSIT', 'COMPLETED', 'FAILED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('DEPOSIT', 'BALANCE', 'FULL_PAYMENT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'COD', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('AWAITING_PROOF', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundRequesterType" AS ENUM ('CUSTOMER', 'STAFF', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('CREATED', 'HANDED_TO_CARRIER', 'DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "WarrantyStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateEnum
CREATE TYPE "AfterSalesType" AS ENUM ('WARRANTY', 'RETURN', 'EXCHANGE');

-- CreateEnum
CREATE TYPE "AfterSalesStatus" AS ENUM ('REQUESTED', 'RECEIVED', 'INSPECTING', 'APPROVED', 'REJECTED', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AfterSalesResolution" AS ENUM ('REPAIRED', 'REPLACED', 'REFUNDED', 'RETURNED_UNCHANGED', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'GUEST', 'SYSTEM');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "normalized_email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(32),
    "employee_code" VARCHAR(64),
    "hired_at" DATE,
    "email_verified_at" TIMESTAMPTZ(3),
    "password_changed_at" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "suspended_at" TIMESTAMPTZ(3),
    "disabled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label" VARCHAR(255),
    "receiver_name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "address_line" VARCHAR(255) NOT NULL,
    "ward" VARCHAR(255) NOT NULL,
    "district" VARCHAR(255) NOT NULL,
    "province" VARCHAR(255) NOT NULL,
    "postal_code" VARCHAR(32),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" CHAR(64) NOT NULL,
    "token_family_id" UUID NOT NULL,
    "user_agent" TEXT,
    "ip_address" VARCHAR(64),
    "last_used_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "AuthTokenPurpose" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "type" "ProductType" NOT NULL,
    "brand" VARCHAR(255) NOT NULL DEFAULT 'Apple',
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "status" "CatalogStatus" NOT NULL DEFAULT 'DRAFT',
    "release_year" INTEGER,
    "chipset" VARCHAR(255),
    "ram_gb" INTEGER,
    "screen_size_inches" DECIMAL(4,2),
    "warranty_policy_id" UUID,
    "seo_title" VARCHAR(255),
    "seo_description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "storage_capacity_gb" INTEGER,
    "color_name" VARCHAR(255),
    "color_hex" VARCHAR(7),
    "inventory_mode" "InventoryMode" NOT NULL,
    "sale_price" DECIMAL(15,0),
    "compare_at_price" DECIMAL(15,0),
    "accessory_attributes" JSONB,
    "warranty_policy_id" UUID,
    "status" "CatalogStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_locations" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "LocationType" NOT NULL,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_units" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "inventory_code" VARCHAR(64) NOT NULL,
    "model_number" VARCHAR(255),
    "region_code" VARCHAR(255),
    "sim_lock_status" "SimLockStatus" NOT NULL DEFAULT 'UNKNOWN',
    "carrier_name" VARCHAR(255),
    "sim_configuration" "SimConfiguration" NOT NULL DEFAULT 'UNKNOWN',
    "imei1_encrypted" TEXT,
    "imei1_hmac" CHAR(64),
    "imei1_suffix" VARCHAR(8),
    "imei2_encrypted" TEXT,
    "imei2_hmac" CHAR(64),
    "imei2_suffix" VARCHAR(8),
    "serial_encrypted" TEXT,
    "serial_hmac" CHAR(64),
    "serial_suffix" VARCHAR(8),
    "eid_encrypted" TEXT,
    "eid_hmac" CHAR(64),
    "eid_suffix" VARCHAR(8),
    "identifier_key_version" INTEGER NOT NULL DEFAULT 1,
    "lifecycle_status" "InventoryLifecycleStatus" NOT NULL DEFAULT 'RECEIVED',
    "acquisition_cost" DECIMAL(15,0),
    "additional_cost" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "sale_price" DECIMAL(15,0),
    "compare_at_price" DECIMAL(15,0),
    "warranty_days_override" INTEGER,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sold_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_inspections" (
    "id" UUID NOT NULL,
    "inventory_unit_id" UUID NOT NULL,
    "inspection_type" "InspectionType" NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "battery_health_percent" INTEGER,
    "battery_cycle_count" INTEGER,
    "battery_replacement_status" "BatteryReplacementStatus" NOT NULL DEFAULT 'UNKNOWN',
    "condition_grade" "ConditionGrade",
    "cosmetic_notes" TEXT,
    "checks" JSONB NOT NULL,
    "repair_history_status" "RepairHistoryStatus" NOT NULL DEFAULT 'UNKNOWN',
    "repair_notes" TEXT,
    "replaced_parts" JSONB,
    "overall_result" "InspectionResult" NOT NULL DEFAULT 'INCOMPLETE',
    "inspector_id" UUID NOT NULL,
    "inspected_at" TIMESTAMPTZ(3),
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_levels" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantity_on_hand" INTEGER NOT NULL DEFAULT 0,
    "quantity_reserved" INTEGER NOT NULL DEFAULT 0,
    "reorder_threshold" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "from_location_id" UUID,
    "to_location_id" UUID,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reference_type" VARCHAR(255),
    "reference_id" UUID,
    "reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_reservations" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "inventory_unit_id" UUID,
    "stock_level_id" UUID,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "hold_reason" "ReservationReason" NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(3),
    "consumed_at" TIMESTAMPTZ(3),

    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_media" (
    "id" UUID NOT NULL,
    "product_id" UUID,
    "variant_id" UUID,
    "inventory_unit_id" UUID,
    "bucket" VARCHAR(255) NOT NULL,
    "object_path" TEXT NOT NULL,
    "visibility" "MediaVisibility" NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "file_size" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "alt_text" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "customer_id" UUID,
    "guest_token_hash" CHAR(64),
    "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "inventory_unit_id" UUID,
    "quantity" INTEGER NOT NULL,
    "price_at_addition" DECIMAL(15,0) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "inventory_unit_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "normalized_code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "discount_type" "DiscountType" NOT NULL,
    "discount_value" DECIMAL(15,0) NOT NULL,
    "max_discount_amount" DECIMAL(15,0),
    "minimum_order_amount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "total_usage_limit" INTEGER,
    "per_customer_limit" INTEGER,
    "visibility" "VoucherVisibility" NOT NULL,
    "scope_type" "VoucherScopeType" NOT NULL,
    "scope_config" JSONB,
    "status" "VoucherStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_usages" (
    "id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_id" UUID,
    "status" "VoucherUsageStatus" NOT NULL DEFAULT 'RESERVED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_at" TIMESTAMPTZ(3),
    "released_at" TIMESTAMPTZ(3),

    CONSTRAINT "voucher_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_number" VARCHAR(64) NOT NULL,
    "source_cart_id" UUID NOT NULL,
    "customer_id" UUID,
    "guest_access_token_hash" CHAR(64),
    "customer_name" VARCHAR(255) NOT NULL,
    "customer_email" VARCHAR(320) NOT NULL,
    "customer_phone" VARCHAR(32) NOT NULL,
    "fulfillment_type" "FulfillmentType" NOT NULL,
    "fulfillment_status" "FulfillmentStatus" NOT NULL DEFAULT 'PENDING',
    "fulfillment_location_id" UUID NOT NULL,
    "shipping_address_snapshot" JSONB,
    "pickup_location_id" UUID,
    "pickup_hold_until" TIMESTAMPTZ(3),
    "pickup_ready_at" TIMESTAMPTZ(3),
    "picked_up_at" TIMESTAMPTZ(3),
    "status" "OrderStatus" NOT NULL DEFAULT 'PLACED',
    "payment_status" "OrderPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "subtotal" DECIMAL(15,0) NOT NULL,
    "item_discount_amount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "voucher_discount_amount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "shipping_fee_original" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "shipping_fee" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "shipping_fee_override_reason" TEXT,
    "shipping_fee_overridden_by_id" UUID,
    "shipping_fee_overridden_at" TIMESTAMPTZ(3),
    "grand_total" DECIMAL(15,0) NOT NULL,
    "deposit_required" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "refunded_amount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "balance_due" DECIMAL(15,0) NOT NULL,
    "voucher_code_snapshot" VARCHAR(64),
    "customer_note" TEXT,
    "internal_note" TEXT,
    "cancel_reason" TEXT,
    "placed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "inventory_unit_id" UUID,
    "product_type_snapshot" "ProductType" NOT NULL,
    "product_name_snapshot" VARCHAR(255) NOT NULL,
    "variant_name_snapshot" VARCHAR(255) NOT NULL,
    "sku_snapshot" VARCHAR(64) NOT NULL,
    "inventory_code_snapshot" VARCHAR(64),
    "configuration_snapshot" JSONB,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(15,0) NOT NULL,
    "line_subtotal" DECIMAL(15,0) NOT NULL,
    "discount_amount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(15,0) NOT NULL,
    "warranty_days_snapshot" INTEGER NOT NULL,
    "warranty_terms_snapshot" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "expected_amount" DECIMAL(15,0) NOT NULL,
    "received_amount" DECIMAL(15,0),
    "status" "PaymentStatus" NOT NULL,
    "transfer_content" VARCHAR(255),
    "bank_name_snapshot" TEXT,
    "bank_account_number_snapshot" TEXT,
    "bank_account_holder_snapshot" TEXT,
    "bank_qr_bucket_snapshot" TEXT,
    "bank_qr_object_path_snapshot" TEXT,
    "review_window_minutes_snapshot" INTEGER,
    "evidence_bucket" TEXT,
    "evidence_object_path" TEXT,
    "customer_declared_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "submitted_at" TIMESTAMPTZ(3),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "payment_id" UUID,
    "amount" DECIMAL(15,0) NOT NULL,
    "method" "RefundMethod" NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "terminal_reason" TEXT,
    "terminal_by_id" UUID,
    "terminal_at" TIMESTAMPTZ(3),
    "evidence_bucket" TEXT,
    "evidence_object_path" TEXT,
    "requested_by_type" "RefundRequesterType" NOT NULL,
    "requested_by_id" UUID,
    "processed_by_id" UUID,
    "processing_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "carrier_name" VARCHAR(255) NOT NULL,
    "tracking_code" VARCHAR(255) NOT NULL,
    "tracking_url" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'CREATED',
    "shipped_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "returned_at" TIMESTAMPTZ(3),
    "failure_reason" TEXT,
    "returned_to_location_id" UUID,
    "return_note" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_policies" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "default_days" INTEGER NOT NULL,
    "terms" TEXT NOT NULL,
    "status" "PolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "warranty_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranties" (
    "id" UUID NOT NULL,
    "warranty_code" VARCHAR(64) NOT NULL,
    "order_item_id" UUID NOT NULL,
    "customer_id" UUID,
    "inventory_unit_id" UUID,
    "policy_id" UUID,
    "days_snapshot" INTEGER NOT NULL,
    "terms_snapshot" TEXT NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "WarrantyStatus" NOT NULL DEFAULT 'ACTIVE',
    "void_reason" TEXT,
    "voided_by_id" UUID,
    "voided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "warranties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "after_sales_requests" (
    "id" UUID NOT NULL,
    "request_number" VARCHAR(64) NOT NULL,
    "warranty_id" UUID,
    "order_item_id" UUID NOT NULL,
    "customer_id" UUID,
    "type" "AfterSalesType" NOT NULL,
    "issue_description" TEXT NOT NULL,
    "requested_resolution" TEXT NOT NULL,
    "status" "AfterSalesStatus" NOT NULL DEFAULT 'REQUESTED',
    "assigned_to_id" UUID,
    "received_location_id" UUID,
    "received_by_id" UUID,
    "attachments" JSONB,
    "inspection_summary" TEXT,
    "inventory_inspection_id" UUID,
    "decision_note" TEXT,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "resolution_type" "AfterSalesResolution",
    "resolution_note" TEXT,
    "replacement_inventory_unit_id" UUID,
    "refund_id" UUID,
    "resolved_by_id" UUID,
    "return_note" TEXT,
    "cancel_reason" TEXT,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_at" TIMESTAMPTZ(3),
    "inspected_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "returned_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "after_sales_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_settings" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "store_name" VARCHAR(255) NOT NULL,
    "store_phone" VARCHAR(32) NOT NULL,
    "store_address" TEXT NOT NULL,
    "currency" VARCHAR(64) NOT NULL DEFAULT 'VND',
    "timezone" VARCHAR(255) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "default_shipping_fee" DECIMAL(15,0) NOT NULL,
    "shipping_deposit_amount" DECIMAL(15,0) NOT NULL,
    "pickup_hold_minutes" INTEGER NOT NULL,
    "deposit_proof_window_minutes" INTEGER NOT NULL,
    "deposit_review_window_minutes" INTEGER NOT NULL,
    "default_warranty_days" INTEGER NOT NULL,
    "default_warranty_terms" TEXT NOT NULL,
    "bank_name" VARCHAR(255) NOT NULL,
    "bank_account_number" VARCHAR(255) NOT NULL,
    "bank_account_holder" VARCHAR(255) NOT NULL,
    "bank_qr_bucket" TEXT,
    "bank_qr_object_path" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(255) NOT NULL,
    "resource_type" VARCHAR(255) NOT NULL,
    "resource_id" UUID,
    "request_id" VARCHAR(64),
    "ip_address" VARCHAR(64),
    "user_agent" TEXT,
    "changes" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_normalized_email_key" ON "users"("normalized_email");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_code_key" ON "users"("employee_code");

-- CreateIndex
CREATE INDEX "users_role_status_created_at_idx" ON "users"("role", "status", "created_at");

-- CreateIndex
CREATE INDEX "customer_addresses_user_id_idx" ON "customer_addresses"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_revoked_at_expires_at_idx" ON "auth_sessions"("user_id", "revoked_at", "expires_at");

-- CreateIndex
CREATE INDEX "auth_sessions_token_family_id_revoked_at_idx" ON "auth_sessions"("token_family_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_purpose_expires_at_idx" ON "auth_tokens"("user_id", "purpose", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_status_type_created_at_idx" ON "products"("status", "type", "created_at");

-- CreateIndex
CREATE INDEX "products_warranty_policy_id_idx" ON "products"("warranty_policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_product_id_status_idx" ON "product_variants"("product_id", "status");

-- CreateIndex
CREATE INDEX "product_variants_warranty_policy_id_idx" ON "product_variants"("warranty_policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_locations_code_key" ON "inventory_locations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_units_inventory_code_key" ON "inventory_units"("inventory_code");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_units_imei1_hmac_key" ON "inventory_units"("imei1_hmac");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_units_imei2_hmac_key" ON "inventory_units"("imei2_hmac");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_units_serial_hmac_key" ON "inventory_units"("serial_hmac");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_units_eid_hmac_key" ON "inventory_units"("eid_hmac");

-- CreateIndex
CREATE INDEX "inventory_units_variant_id_lifecycle_status_location_id_idx" ON "inventory_units"("variant_id", "lifecycle_status", "location_id");

-- CreateIndex
CREATE INDEX "inventory_inspections_inventory_unit_id_status_idx" ON "inventory_inspections"("inventory_unit_id", "status");

-- CreateIndex
CREATE INDEX "inventory_inspections_inspector_id_idx" ON "inventory_inspections"("inspector_id");

-- CreateIndex
CREATE INDEX "stock_levels_location_id_idx" ON "stock_levels"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_levels_variant_id_location_id_key" ON "stock_levels"("variant_id", "location_id");

-- CreateIndex
CREATE INDEX "stock_movements_variant_id_created_at_idx" ON "stock_movements"("variant_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_from_location_id_idx" ON "stock_movements"("from_location_id");

-- CreateIndex
CREATE INDEX "stock_movements_to_location_id_idx" ON "stock_movements"("to_location_id");

-- CreateIndex
CREATE INDEX "inventory_reservations_order_id_status_idx" ON "inventory_reservations"("order_id", "status");

-- CreateIndex
CREATE INDEX "inventory_reservations_order_item_id_idx" ON "inventory_reservations"("order_item_id");

-- CreateIndex
CREATE INDEX "inventory_reservations_status_expires_at_idx" ON "inventory_reservations"("status", "expires_at");

-- CreateIndex
CREATE INDEX "inventory_reservations_stock_level_id_idx" ON "inventory_reservations"("stock_level_id");

-- CreateIndex
CREATE INDEX "product_media_product_id_sort_order_idx" ON "product_media"("product_id", "sort_order");

-- CreateIndex
CREATE INDEX "product_media_variant_id_sort_order_idx" ON "product_media"("variant_id", "sort_order");

-- CreateIndex
CREATE INDEX "product_media_inventory_unit_id_sort_order_idx" ON "product_media"("inventory_unit_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "product_media_bucket_object_path_key" ON "product_media"("bucket", "object_path");

-- CreateIndex
CREATE INDEX "carts_customer_id_status_idx" ON "carts"("customer_id", "status");

-- CreateIndex
CREATE INDEX "carts_guest_token_hash_status_idx" ON "carts"("guest_token_hash", "status");

-- CreateIndex
CREATE INDEX "carts_status_expires_at_idx" ON "carts"("status", "expires_at");

-- CreateIndex
CREATE INDEX "cart_items_cart_id_idx" ON "cart_items"("cart_id");

-- CreateIndex
CREATE INDEX "cart_items_variant_id_idx" ON "cart_items"("variant_id");

-- CreateIndex
CREATE INDEX "cart_items_inventory_unit_id_idx" ON "cart_items"("inventory_unit_id");

-- CreateIndex
CREATE INDEX "wishlist_items_customer_id_idx" ON "wishlist_items"("customer_id");

-- CreateIndex
CREATE INDEX "wishlist_items_variant_id_idx" ON "wishlist_items"("variant_id");

-- CreateIndex
CREATE INDEX "wishlist_items_inventory_unit_id_idx" ON "wishlist_items"("inventory_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_normalized_code_key" ON "vouchers"("normalized_code");

-- CreateIndex
CREATE INDEX "vouchers_status_starts_at_ends_at_idx" ON "vouchers"("status", "starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_usages_order_id_key" ON "voucher_usages"("order_id");

-- CreateIndex
CREATE INDEX "voucher_usages_voucher_id_status_idx" ON "voucher_usages"("voucher_id", "status");

-- CreateIndex
CREATE INDEX "voucher_usages_customer_id_status_idx" ON "voucher_usages"("customer_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_source_cart_id_key" ON "orders"("source_cart_id");

-- CreateIndex
CREATE INDEX "orders_customer_id_created_at_idx" ON "orders"("customer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_status_fulfillment_status_created_at_idx" ON "orders"("status", "fulfillment_status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_fulfillment_location_id_idx" ON "orders"("fulfillment_location_id");

-- CreateIndex
CREATE INDEX "orders_pickup_location_id_idx" ON "orders"("pickup_location_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

-- CreateIndex
CREATE INDEX "order_items_inventory_unit_id_idx" ON "order_items"("inventory_unit_id");

-- CreateIndex
CREATE INDEX "payments_order_id_status_idx" ON "payments"("order_id", "status");

-- CreateIndex
CREATE INDEX "payments_status_submitted_at_idx" ON "payments"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "refunds_order_id_status_idx" ON "refunds"("order_id", "status");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_order_id_key" ON "shipments"("order_id");

-- CreateIndex
CREATE INDEX "shipments_tracking_code_idx" ON "shipments"("tracking_code");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_order_id_attempt_number_key" ON "shipments"("order_id", "attempt_number");

-- CreateIndex
CREATE UNIQUE INDEX "warranty_policies_code_key" ON "warranty_policies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "warranties_warranty_code_key" ON "warranties"("warranty_code");

-- CreateIndex
CREATE UNIQUE INDEX "warranties_order_item_id_key" ON "warranties"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "warranties_inventory_unit_id_key" ON "warranties"("inventory_unit_id");

-- CreateIndex
CREATE INDEX "warranties_customer_id_created_at_idx" ON "warranties"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "warranties_policy_id_idx" ON "warranties"("policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "after_sales_requests_request_number_key" ON "after_sales_requests"("request_number");

-- CreateIndex
CREATE INDEX "after_sales_requests_order_item_id_status_idx" ON "after_sales_requests"("order_item_id", "status");

-- CreateIndex
CREATE INDEX "after_sales_requests_warranty_id_idx" ON "after_sales_requests"("warranty_id");

-- CreateIndex
CREATE INDEX "after_sales_requests_customer_id_requested_at_idx" ON "after_sales_requests"("customer_id", "requested_at");

-- CreateIndex
CREATE INDEX "after_sales_requests_assigned_to_id_status_idx" ON "after_sales_requests"("assigned_to_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "store_settings_key_key" ON "store_settings"("key");

-- CreateIndex
CREATE INDEX "store_settings_updated_by_id_idx" ON "store_settings"("updated_by_id");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_created_at_idx" ON "audit_logs"("resource_type", "resource_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_warranty_policy_id_fkey" FOREIGN KEY ("warranty_policy_id") REFERENCES "warranty_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_warranty_policy_id_fkey" FOREIGN KEY ("warranty_policy_id") REFERENCES "warranty_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_inspections" ADD CONSTRAINT "inventory_inspections_inventory_unit_id_fkey" FOREIGN KEY ("inventory_unit_id") REFERENCES "inventory_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_inspections" ADD CONSTRAINT "inventory_inspections_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_inventory_unit_id_fkey" FOREIGN KEY ("inventory_unit_id") REFERENCES "inventory_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_stock_level_id_fkey" FOREIGN KEY ("stock_level_id") REFERENCES "stock_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_inventory_unit_id_fkey" FOREIGN KEY ("inventory_unit_id") REFERENCES "inventory_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_inventory_unit_id_fkey" FOREIGN KEY ("inventory_unit_id") REFERENCES "inventory_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_inventory_unit_id_fkey" FOREIGN KEY ("inventory_unit_id") REFERENCES "inventory_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_usages" ADD CONSTRAINT "voucher_usages_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_usages" ADD CONSTRAINT "voucher_usages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_usages" ADD CONSTRAINT "voucher_usages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_source_cart_id_fkey" FOREIGN KEY ("source_cart_id") REFERENCES "carts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfillment_location_id_fkey" FOREIGN KEY ("fulfillment_location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_location_id_fkey" FOREIGN KEY ("pickup_location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_fee_overridden_by_id_fkey" FOREIGN KEY ("shipping_fee_overridden_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_inventory_unit_id_fkey" FOREIGN KEY ("inventory_unit_id") REFERENCES "inventory_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_terminal_by_id_fkey" FOREIGN KEY ("terminal_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_processed_by_id_fkey" FOREIGN KEY ("processed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_returned_to_location_id_fkey" FOREIGN KEY ("returned_to_location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_inventory_unit_id_fkey" FOREIGN KEY ("inventory_unit_id") REFERENCES "inventory_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "warranty_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "after_sales_requests" ADD CONSTRAINT "after_sales_requests_warranty_id_fkey" FOREIGN KEY ("warranty_id") REFERENCES "warranties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "after_sales_requests" ADD CONSTRAINT "after_sales_requests_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "after_sales_requests" ADD CONSTRAINT "after_sales_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "after_sales_requests" ADD CONSTRAINT "after_sales_requests_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "after_sales_requests" ADD CONSTRAINT "after_sales_requests_received_location_id_fkey" FOREIGN KEY ("received_location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "after_sales_requests" ADD CONSTRAINT "after_sales_requests_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "after_sales_requests" ADD CONSTRAINT "after_sales_requests_inventory_inspection_id_fkey" FOREIGN KEY ("inventory_inspection_id") REFERENCES "inventory_inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "after_sales_requests" ADD CONSTRAINT "after_sales_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "after_sales_requests" ADD CONSTRAINT "after_sales_requests_replacement_inventory_unit_id_fkey" FOREIGN KEY ("replacement_inventory_unit_id") REFERENCES "inventory_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "after_sales_requests" ADD CONSTRAINT "after_sales_requests_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "after_sales_requests" ADD CONSTRAINT "after_sales_requests_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Physical invariants not expressible in Prisma schema.

-- Identity and ownership.
ALTER TABLE "users" ADD CONSTRAINT "users_role_profile_check" CHECK (
    ("role" = 'CUSTOMER' AND "employee_code" IS NULL AND "hired_at" IS NULL)
    OR ("role" IN ('ADMIN', 'EMPLOYEE') AND "employee_code" IS NOT NULL)
);
ALTER TABLE "users" ADD CONSTRAINT "users_password_lifecycle_check" CHECK (
    "password_hash" IS NOT NULL
    OR ("role" = 'EMPLOYEE' AND "status" = 'PENDING_VERIFICATION')
);
ALTER TABLE "users" ADD CONSTRAINT "users_status_timestamp_check" CHECK (
    ("status" = 'SUSPENDED' AND "role" = 'CUSTOMER' AND "suspended_at" IS NOT NULL AND "disabled_at" IS NULL)
    OR ("status" = 'DISABLED' AND "role" = 'EMPLOYEE' AND "disabled_at" IS NOT NULL AND "suspended_at" IS NULL)
    OR ("status" NOT IN ('SUSPENDED', 'DISABLED') AND "suspended_at" IS NULL AND "disabled_at" IS NULL)
);
CREATE UNIQUE INDEX "customer_addresses_one_default_active_per_user"
    ON "customer_addresses"("user_id")
    WHERE "is_default" AND "archived_at" IS NULL;
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_lifetime_check" CHECK (
    "expires_at" > "created_at"
    AND ("revoked_at" IS NULL OR "revoked_at" >= "created_at")
    AND ("last_used_at" IS NULL OR "last_used_at" >= "created_at")
);
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_lifetime_check" CHECK (
    "expires_at" > "created_at"
    AND ("consumed_at" IS NULL OR "consumed_at" >= "created_at")
);

-- Catalog and inventory.
ALTER TABLE "products" ADD CONSTRAINT "products_type_fields_check" CHECK (
    ("type" = 'ACCESSORY' AND "release_year" IS NULL AND "chipset" IS NULL AND "ram_gb" IS NULL AND "screen_size_inches" IS NULL)
    OR "type" = 'IPHONE'
);
ALTER TABLE "products" ADD CONSTRAINT "products_phone_specs_check" CHECK (
    ("release_year" IS NULL OR "release_year" BETWEEN 2007 AND 2100)
    AND ("ram_gb" IS NULL OR "ram_gb" > 0)
    AND ("screen_size_inches" IS NULL OR "screen_size_inches" > 0)
);
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_price_check" CHECK (
    ("sale_price" IS NULL OR "sale_price" >= 0)
    AND ("compare_at_price" IS NULL OR ("sale_price" IS NOT NULL AND "compare_at_price" >= "sale_price"))
    AND ("inventory_mode" <> 'QUANTITY' OR "sale_price" IS NOT NULL)
    AND ("storage_capacity_gb" IS NULL OR "storage_capacity_gb" > 0)
    AND ("color_hex" IS NULL OR "color_hex" ~ '^#[0-9A-Fa-f]{6}$')
);
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_money_check" CHECK (
    ("acquisition_cost" IS NULL OR "acquisition_cost" >= 0)
    AND "additional_cost" >= 0
    AND ("sale_price" IS NULL OR "sale_price" >= 0)
    AND ("compare_at_price" IS NULL OR ("sale_price" IS NOT NULL AND "compare_at_price" >= "sale_price"))
    AND ("warranty_days_override" IS NULL OR "warranty_days_override" >= 0)
    AND "identifier_key_version" > 0
);
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_carrier_lock_check" CHECK (
    "sim_lock_status" <> 'CARRIER_LOCKED' OR NULLIF(BTRIM("carrier_name"), '') IS NOT NULL
);
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_sold_timestamp_check" CHECK (
    ("lifecycle_status" = 'SOLD' AND "sold_at" IS NOT NULL)
    OR ("lifecycle_status" <> 'SOLD' AND "sold_at" IS NULL)
);
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_imei1_shape_check" CHECK (
    NUM_NONNULLS("imei1_encrypted", "imei1_hmac", "imei1_suffix") IN (0, 3)
);
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_imei2_shape_check" CHECK (
    NUM_NONNULLS("imei2_encrypted", "imei2_hmac", "imei2_suffix") IN (0, 3)
);
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_serial_shape_check" CHECK (
    NUM_NONNULLS("serial_encrypted", "serial_hmac", "serial_suffix") IN (0, 3)
);
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_eid_shape_check" CHECK (
    NUM_NONNULLS("eid_encrypted", "eid_hmac", "eid_suffix") IN (0, 3)
);
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_distinct_imeis_check" CHECK (
    "imei1_hmac" IS NULL OR "imei2_hmac" IS NULL OR "imei1_hmac" <> "imei2_hmac"
);
ALTER TABLE "inventory_inspections" ADD CONSTRAINT "inventory_inspections_values_check" CHECK (
    ("battery_health_percent" IS NULL OR "battery_health_percent" BETWEEN 0 AND 100)
    AND ("battery_cycle_count" IS NULL OR "battery_cycle_count" >= 0)
    AND JSONB_TYPEOF("checks") = 'object'
    AND ("replaced_parts" IS NULL OR JSONB_TYPEOF("replaced_parts") IN ('array', 'object'))
);
ALTER TABLE "inventory_inspections" ADD CONSTRAINT "inventory_inspections_completion_check" CHECK (
    ("status" = 'DRAFT' AND "inspected_at" IS NULL AND "overall_result" = 'INCOMPLETE' AND NOT "is_current")
    OR ("status" = 'COMPLETED' AND "inspected_at" IS NOT NULL AND "overall_result" <> 'INCOMPLETE')
);
CREATE UNIQUE INDEX "inventory_inspections_one_current_per_unit"
    ON "inventory_inspections"("inventory_unit_id")
    WHERE "is_current";
CREATE UNIQUE INDEX "inventory_inspections_one_draft_per_unit"
    ON "inventory_inspections"("inventory_unit_id")
    WHERE "status" = 'DRAFT';
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_quantities_check" CHECK (
    "quantity_on_hand" >= 0
    AND "quantity_reserved" >= 0
    AND "quantity_reserved" <= "quantity_on_hand"
    AND "reorder_threshold" >= 0
);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shape_check" CHECK (
    "quantity" > 0
    AND NUM_NONNULLS("from_location_id", "to_location_id") >= 1
    AND ("from_location_id" IS NULL OR "to_location_id" IS NULL OR "from_location_id" <> "to_location_id")
    AND ("type" NOT IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT') OR NULLIF(BTRIM("reason"), '') IS NOT NULL)
);
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_target_check" CHECK (
    NUM_NONNULLS("inventory_unit_id", "stock_level_id") = 1
    AND "quantity" > 0
    AND ("inventory_unit_id" IS NULL OR "quantity" = 1)
);
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_status_timestamp_check" CHECK (
    ("status" = 'ACTIVE' AND "released_at" IS NULL AND "consumed_at" IS NULL)
    OR ("status" IN ('RELEASED', 'EXPIRED') AND "released_at" IS NOT NULL AND "consumed_at" IS NULL)
    OR ("status" = 'CONSUMED' AND "consumed_at" IS NOT NULL AND "released_at" IS NULL)
);
CREATE UNIQUE INDEX "inventory_reservations_one_active_per_unit"
    ON "inventory_reservations"("inventory_unit_id")
    WHERE "status" = 'ACTIVE' AND "inventory_unit_id" IS NOT NULL;
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_owner_check" CHECK (
    NUM_NONNULLS("product_id", "variant_id", "inventory_unit_id") = 1
);
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_metadata_check" CHECK (
    "file_size" > 0
    AND "sort_order" >= 0
    AND ("width" IS NULL OR "width" > 0)
    AND ("height" IS NULL OR "height" > 0)
);

-- Cart, wishlist, and voucher.
ALTER TABLE "carts" ADD CONSTRAINT "carts_owner_check" CHECK (
    NUM_NONNULLS("customer_id", "guest_token_hash") = 1
    AND (("customer_id" IS NOT NULL AND "expires_at" IS NULL) OR ("guest_token_hash" IS NOT NULL AND "expires_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "carts_one_active_per_customer"
    ON "carts"("customer_id")
    WHERE "status" = 'ACTIVE' AND "customer_id" IS NOT NULL;
CREATE UNIQUE INDEX "carts_one_active_per_guest"
    ON "carts"("guest_token_hash")
    WHERE "status" = 'ACTIVE' AND "guest_token_hash" IS NOT NULL;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_values_check" CHECK (
    "quantity" > 0
    AND "price_at_addition" >= 0
    AND ("inventory_unit_id" IS NULL OR "quantity" = 1)
);
CREATE UNIQUE INDEX "cart_items_unique_serialized_target"
    ON "cart_items"("cart_id", "inventory_unit_id")
    WHERE "inventory_unit_id" IS NOT NULL;
CREATE UNIQUE INDEX "cart_items_unique_quantity_target"
    ON "cart_items"("cart_id", "variant_id")
    WHERE "inventory_unit_id" IS NULL;
CREATE UNIQUE INDEX "wishlist_items_unique_serialized_target"
    ON "wishlist_items"("customer_id", "inventory_unit_id")
    WHERE "inventory_unit_id" IS NOT NULL;
CREATE UNIQUE INDEX "wishlist_items_unique_quantity_target"
    ON "wishlist_items"("customer_id", "variant_id")
    WHERE "inventory_unit_id" IS NULL;
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_values_check" CHECK (
    "ends_at" > "starts_at"
    AND "discount_value" > 0
    AND ("discount_type" <> 'PERCENT' OR ("discount_value" BETWEEN 1 AND 100 AND SCALE("discount_value") = 0))
    AND ("max_discount_amount" IS NULL OR "max_discount_amount" >= 0)
    AND "minimum_order_amount" >= 0
    AND ("total_usage_limit" IS NULL OR "total_usage_limit" > 0)
    AND ("per_customer_limit" IS NULL OR "per_customer_limit" > 0)
    AND ("visibility" = 'ACCOUNT_ONLY' OR "per_customer_limit" IS NULL)
    AND (("scope_type" = 'ORDER' AND "scope_config" IS NULL) OR ("scope_type" <> 'ORDER' AND JSONB_TYPEOF("scope_config") = 'object'))
);
ALTER TABLE "voucher_usages" ADD CONSTRAINT "voucher_usages_status_timestamp_check" CHECK (
    ("status" = 'RESERVED' AND "consumed_at" IS NULL AND "released_at" IS NULL)
    OR ("status" = 'CONSUMED' AND "consumed_at" IS NOT NULL AND "released_at" IS NULL)
    OR ("status" = 'RELEASED' AND "released_at" IS NOT NULL AND "consumed_at" IS NULL)
);

-- Order, money, payment, fulfillment, and refund.
ALTER TABLE "orders" ADD CONSTRAINT "orders_identity_check" CHECK (
    NUM_NONNULLS("customer_id", "guest_access_token_hash") = 1
);
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfillment_shape_check" CHECK (
    ("fulfillment_type" = 'PICKUP'
      AND "pickup_location_id" IS NOT NULL
      AND "pickup_location_id" = "fulfillment_location_id"
      AND "pickup_hold_until" IS NOT NULL
      AND "shipping_address_snapshot" IS NULL
      AND "deposit_required" = 0)
    OR ("fulfillment_type" = 'SHIPPING'
      AND "pickup_location_id" IS NULL
      AND "pickup_hold_until" IS NULL
      AND "pickup_ready_at" IS NULL
      AND "picked_up_at" IS NULL
      AND JSONB_TYPEOF("shipping_address_snapshot") = 'object')
);
ALTER TABLE "orders" ADD CONSTRAINT "orders_money_check" CHECK (
    "subtotal" >= 0
    AND "item_discount_amount" = 0
    AND "voucher_discount_amount" >= 0
    AND "item_discount_amount" + "voucher_discount_amount" <= "subtotal"
    AND "shipping_fee_original" >= 0
    AND "shipping_fee" >= 0
    AND "grand_total" = "subtotal" - "item_discount_amount" - "voucher_discount_amount" + "shipping_fee"
    AND "deposit_required" >= 0
    AND "deposit_required" <= "grand_total"
    AND "paid_amount" >= 0
    AND "refunded_amount" >= 0
    AND "balance_due" = GREATEST("grand_total" - "paid_amount", 0)
);
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_override_check" CHECK (
    NUM_NONNULLS("shipping_fee_override_reason", "shipping_fee_overridden_by_id", "shipping_fee_overridden_at") IN (0, 3)
);
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_timestamp_check" CHECK (
    ("status" <> 'CONFIRMED' OR "confirmed_at" IS NOT NULL)
    AND ("status" <> 'COMPLETED' OR "completed_at" IS NOT NULL)
    AND ("status" <> 'CANCELLED' OR ("cancelled_at" IS NOT NULL AND NULLIF(BTRIM("cancel_reason"), '') IS NOT NULL))
);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_money_check" CHECK (
    "quantity" > 0
    AND ("inventory_unit_id" IS NULL OR "quantity" = 1)
    AND "unit_price" >= 0
    AND "line_subtotal" = "unit_price" * "quantity"
    AND "discount_amount" >= 0
    AND "discount_amount" <= "line_subtotal"
    AND "line_total" = "line_subtotal" - "discount_amount"
    AND "warranty_days_snapshot" >= 0
    AND ("warranty_days_snapshot" = 0 OR NULLIF(BTRIM("warranty_terms_snapshot"), '') IS NOT NULL)
);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK (
    "expected_amount" >= 0
    AND ("received_amount" IS NULL OR "received_amount" >= 0)
    AND ("review_window_minutes_snapshot" IS NULL OR "review_window_minutes_snapshot" > 0)
);
ALTER TABLE "payments" ADD CONSTRAINT "payments_bank_deposit_check" CHECK (
    ("method" <> 'BANK_TRANSFER' OR "purpose" <> 'DEPOSIT')
    OR (NULLIF(BTRIM("transfer_content"), '') IS NOT NULL
      AND NULLIF(BTRIM("bank_name_snapshot"), '') IS NOT NULL
      AND NULLIF(BTRIM("bank_account_number_snapshot"), '') IS NOT NULL
      AND NULLIF(BTRIM("bank_account_holder_snapshot"), '') IS NOT NULL
      AND "review_window_minutes_snapshot" IS NOT NULL
      AND "expires_at" IS NOT NULL)
);
ALTER TABLE "payments" ADD CONSTRAINT "payments_status_timestamp_check" CHECK (
    ("status" = 'AWAITING_PROOF' AND "submitted_at" IS NULL AND "reviewed_at" IS NULL)
    OR ("status" = 'UNDER_REVIEW' AND "submitted_at" IS NOT NULL AND "reviewed_at" IS NULL)
    OR ("status" = 'VERIFIED' AND "received_amount" IS NOT NULL AND "reviewed_at" IS NOT NULL)
    OR ("status" = 'REJECTED' AND "reviewed_at" IS NOT NULL AND NULLIF(BTRIM("rejection_reason"), '') IS NOT NULL)
    OR ("status" IN ('EXPIRED', 'CANCELLED'))
);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_values_check" CHECK (
    "amount" > 0 AND NULLIF(BTRIM("reason"), '') IS NOT NULL
);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requester_check" CHECK (
    ("requested_by_type" IN ('CUSTOMER', 'SYSTEM'))
    OR ("requested_by_type" = 'STAFF' AND "requested_by_id" IS NOT NULL)
);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_status_timestamp_check" CHECK (
    ("status" = 'REQUESTED' AND "processing_at" IS NULL AND "completed_at" IS NULL AND "terminal_at" IS NULL)
    OR ("status" = 'PROCESSING' AND "processing_at" IS NOT NULL AND "completed_at" IS NULL AND "terminal_at" IS NULL)
    OR ("status" = 'COMPLETED' AND "processing_at" IS NOT NULL AND "completed_at" IS NOT NULL AND "processed_by_id" IS NOT NULL
      AND ("method" <> 'BANK_TRANSFER' OR NUM_NONNULLS("evidence_bucket", "evidence_object_path") = 2))
    OR ("status" IN ('REJECTED', 'CANCELLED') AND NULLIF(BTRIM("terminal_reason"), '') IS NOT NULL AND "terminal_by_id" IS NOT NULL AND "terminal_at" IS NOT NULL)
);
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_attempt_check" CHECK (
    "attempt_number" = 1
);
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_status_timestamp_check" CHECK (
    ("status" = 'CREATED')
    OR ("status" = 'HANDED_TO_CARRIER' AND "shipped_at" IS NOT NULL)
    OR ("status" = 'DELIVERED' AND "shipped_at" IS NOT NULL AND "delivered_at" IS NOT NULL)
    OR ("status" = 'FAILED' AND "failed_at" IS NOT NULL AND NULLIF(BTRIM("failure_reason"), '') IS NOT NULL)
    OR ("status" = 'RETURNED' AND "failed_at" IS NOT NULL AND "returned_at" IS NOT NULL AND "returned_to_location_id" IS NOT NULL AND NULLIF(BTRIM("return_note"), '') IS NOT NULL)
    OR ("status" = 'CANCELLED')
);

-- Warranty, after-sales, and system.
ALTER TABLE "warranty_policies" ADD CONSTRAINT "warranty_policies_values_check" CHECK (
    "default_days" >= 0 AND NULLIF(BTRIM("terms"), '') IS NOT NULL
);
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_interval_check" CHECK (
    "days_snapshot" >= 0 AND "end_at" >= "start_at" AND NULLIF(BTRIM("terms_snapshot"), '') IS NOT NULL
);
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_void_check" CHECK (
    ("status" = 'ACTIVE' AND "void_reason" IS NULL AND "voided_by_id" IS NULL AND "voided_at" IS NULL)
    OR ("status" = 'VOIDED' AND NULLIF(BTRIM("void_reason"), '') IS NOT NULL AND "voided_by_id" IS NOT NULL AND "voided_at" IS NOT NULL)
);
ALTER TABLE "after_sales_requests" ADD CONSTRAINT "after_sales_requests_attachment_check" CHECK (
    "attachments" IS NULL OR JSONB_TYPEOF("attachments") = 'array'
);
ALTER TABLE "after_sales_requests" ADD CONSTRAINT "after_sales_requests_replacement_check" CHECK (
    "replacement_inventory_unit_id" IS NULL OR "resolution_type" = 'REPLACED'
);
ALTER TABLE "after_sales_requests" ADD CONSTRAINT "after_sales_requests_status_check" CHECK (
    ("status" = 'REQUESTED')
    OR ("status" = 'RECEIVED' AND "received_at" IS NOT NULL AND "received_location_id" IS NOT NULL AND "received_by_id" IS NOT NULL)
    OR ("status" = 'INSPECTING' AND "received_at" IS NOT NULL AND "inspected_at" IS NOT NULL)
    OR ("status" IN ('APPROVED', 'REJECTED') AND "decided_at" IS NOT NULL AND "decided_by_id" IS NOT NULL AND NULLIF(BTRIM("decision_note"), '') IS NOT NULL)
    OR ("status" = 'RESOLVED' AND "resolved_at" IS NOT NULL AND "resolved_by_id" IS NOT NULL AND "resolution_type" IS NOT NULL AND NULLIF(BTRIM("resolution_note"), '') IS NOT NULL)
    OR ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND NULLIF(BTRIM("cancel_reason"), '') IS NOT NULL)
);
CREATE UNIQUE INDEX "after_sales_requests_one_open_per_order_item"
    ON "after_sales_requests"("order_item_id")
    WHERE "status" IN ('REQUESTED', 'RECEIVED', 'INSPECTING', 'APPROVED');
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_singleton_check" CHECK (
    "key" = 'STORE'
    AND "currency" = 'VND'
    AND "timezone" = 'Asia/Ho_Chi_Minh'
    AND "default_shipping_fee" >= 0
    AND "shipping_deposit_amount" > 0
    AND "pickup_hold_minutes" > 0
    AND "deposit_proof_window_minutes" > 0
    AND "deposit_review_window_minutes" > 0
    AND "default_warranty_days" >= 0
    AND CHAR_LENGTH("default_warranty_terms") BETWEEN 1 AND 10000
    AND NULLIF(BTRIM("bank_name"), '') IS NOT NULL
    AND NULLIF(BTRIM("bank_account_number"), '') IS NOT NULL
    AND NULLIF(BTRIM("bank_account_holder"), '') IS NOT NULL
    AND "version" > 0
);
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_check" CHECK (
    ("actor_type" = 'USER' AND "actor_user_id" IS NOT NULL)
    OR ("actor_type" IN ('GUEST', 'SYSTEM') AND "actor_user_id" IS NULL)
);
