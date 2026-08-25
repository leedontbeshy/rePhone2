import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';

export interface Slice12PreflightViolationCount {
  checkName: string;
  count: number;
}

export function findSlice12PreflightViolations(
  prisma: PrismaClient,
): Promise<Slice12PreflightViolationCount[]> {
  return prisma.$queryRaw<Slice12PreflightViolationCount[]>`
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

async function runSlice12Preflight(): Promise<void> {
  loadWorkspaceEnvironment();
  const connectionString = requiredEnvironment('DATABASE_URL');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const violations = await findSlice12PreflightViolations(prisma);
    const failed = violations.filter(({ count }) => count > 0);
    process.stdout.write(`${JSON.stringify({ checks: violations }, null, 2)}\n`);
    if (failed.length > 0) {
      throw new Error(`Slice 12 preflight found ${failed.length.toString()} violated invariant(s)`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for the Slice 12 preflight`);
  }
  return value;
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && import.meta.url === pathToFileURL(resolve(entrypoint)).href;
}

if (isMainModule()) {
  await runSlice12Preflight();
}
