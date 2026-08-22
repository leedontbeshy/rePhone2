import { PrismaPg } from '@prisma/adapter-pg';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';

loadWorkspaceEnvironment();

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString.length === 0) {
  throw new Error('DATABASE_URL is required for the Slice 06 preflight');
}

interface ViolationCount {
  checkName: string;
  count: number;
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  const violations = await prisma.$queryRaw<ViolationCount[]>`
    SELECT 'carts_guest_token_hash_shape_check' AS "checkName", COUNT(*)::int AS count
    FROM carts
    WHERE guest_token_hash IS NOT NULL AND guest_token_hash !~ '^[0-9a-f]{64}$'
    UNION ALL
    SELECT 'orders_guest_access_token_hash_shape_check', COUNT(*)::int
    FROM orders
    WHERE guest_access_token_hash IS NOT NULL
      AND guest_access_token_hash !~ '^[0-9a-f]{64}$'
    UNION ALL
    SELECT 'inventory_reservations_active_hold_check', COUNT(*)::int
    FROM inventory_reservations
    WHERE status = 'ACTIVE'
      AND NOT (
        (hold_reason IN ('DEPOSIT', 'PICKUP') AND expires_at IS NOT NULL)
        OR (hold_reason IN ('REVIEW', 'FULFILLMENT') AND expires_at IS NULL)
      )
    UNION ALL
    SELECT 'orders_shipping_deposit_check', COUNT(*)::int
    FROM orders
    WHERE fulfillment_type = 'SHIPPING'
      AND NOT (
        (grand_total = 0 AND deposit_required = 0)
        OR (grand_total > 0 AND deposit_required > 0)
      )
    UNION ALL
    SELECT 'payments_checkout_deposit_check', COUNT(*)::int
    FROM payments
    WHERE method = 'BANK_TRANSFER' AND purpose = 'DEPOSIT' AND expected_amount <= 0
    UNION ALL
    SELECT 'payments_bank_qr_snapshot_pair_check', COUNT(*)::int
    FROM payments
    WHERE NUM_NONNULLS(bank_qr_bucket_snapshot, bank_qr_object_path_snapshot) NOT IN (0, 2)
    UNION ALL
    SELECT 'store_settings_bank_qr_pair_check', COUNT(*)::int
    FROM store_settings
    WHERE NUM_NONNULLS(bank_qr_bucket, bank_qr_object_path) NOT IN (0, 2)
  `;
  const failed = violations.filter(({ count }) => count > 0);
  process.stdout.write(`${JSON.stringify({ checks: violations }, null, 2)}\n`);
  if (failed.length > 0) {
    throw new Error(`Slice 06 preflight found ${failed.length.toString()} violated invariant(s)`);
  }
} finally {
  await prisma.$disconnect();
}
