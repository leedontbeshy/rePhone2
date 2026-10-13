import type { PrismaClient } from '../../src/generated/prisma/client.js';

export interface SystemViolationCount {
  checkName: string;
  count: number;
}

export function findSystemViolations(prisma: PrismaClient): Promise<SystemViolationCount[]> {
  return prisma.$queryRaw<SystemViolationCount[]>`
    SELECT 'store_settings_singleton_check' AS "checkName", COUNT(*)::int AS count
    FROM store_settings
    WHERE (
      key = 'STORE'
      AND currency = 'VND'
      AND timezone = 'Asia/Ho_Chi_Minh'
      AND NULLIF(BTRIM(store_name), '') IS NOT NULL
      AND NULLIF(BTRIM(store_phone), '') IS NOT NULL
      AND NULLIF(BTRIM(store_address), '') IS NOT NULL
      AND default_shipping_fee >= 0
      AND shipping_deposit_amount > 0
      AND pickup_hold_minutes BETWEEN 1 AND 10080
      AND deposit_proof_window_minutes BETWEEN 1 AND 10080
      AND deposit_review_window_minutes BETWEEN 1 AND 10080
      AND default_warranty_days BETWEEN 0 AND 3650
      AND CHAR_LENGTH(BTRIM(default_warranty_terms)) BETWEEN 1 AND 10000
      AND NULLIF(BTRIM(bank_name), '') IS NOT NULL
      AND NULLIF(BTRIM(bank_account_number), '') IS NOT NULL
      AND NULLIF(BTRIM(bank_account_holder), '') IS NOT NULL
      AND version > 0
    ) IS NOT TRUE
    UNION ALL
    SELECT 'auth_sessions_refresh_token_hash_shape_check', COUNT(*)::int
    FROM auth_sessions
    WHERE refresh_token_hash !~ '^[0-9a-f]{64}$'
    UNION ALL
    SELECT 'auth_tokens_token_hash_shape_check', COUNT(*)::int
    FROM auth_tokens
    WHERE token_hash !~ '^[0-9a-f]{64}$'
  `;
}
