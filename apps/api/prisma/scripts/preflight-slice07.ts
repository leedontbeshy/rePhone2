import { PrismaPg } from '@prisma/adapter-pg';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';

loadWorkspaceEnvironment();

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString.length === 0) {
  throw new Error('DATABASE_URL is required for the Slice 07 preflight');
}

interface ViolationCount {
  checkName: string;
  count: number;
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  const violations = await prisma.$queryRaw<ViolationCount[]>`
    SELECT 'payments_evidence_shape_check' AS "checkName", COUNT(*)::int AS count
    FROM payments
    WHERE NOT (
      (evidence_bucket IS NULL AND evidence_object_path IS NULL)
      OR (
        evidence_bucket IS NOT NULL
        AND evidence_object_path IS NOT NULL
        AND NULLIF(BTRIM(evidence_bucket), '') IS NOT NULL
        AND NULLIF(BTRIM(evidence_object_path), '') IS NOT NULL
      )
    )
    UNION ALL
    SELECT 'payments_evidence_owner_path_check', COUNT(*)::int
    FROM payments
    WHERE evidence_object_path IS NOT NULL
      AND evidence_object_path !~ ('^payments/' || id::text || '/[^/].*$')
    UNION ALL
    SELECT 'payments_bank_deposit_lifecycle_check', COUNT(*)::int
    FROM payments
    WHERE method = 'BANK_TRANSFER'
      AND purpose = 'DEPOSIT'
      AND NOT (
        (
          status = 'AWAITING_PROOF'
          AND evidence_bucket IS NULL
          AND evidence_object_path IS NULL
          AND customer_declared_at IS NULL
          AND submitted_at IS NULL
          AND reviewed_by_id IS NULL
          AND reviewed_at IS NULL
          AND received_amount IS NULL
          AND rejection_reason IS NULL
        )
        OR (
          status = 'UNDER_REVIEW'
          AND evidence_bucket IS NOT NULL
          AND evidence_object_path IS NOT NULL
          AND customer_declared_at IS NOT NULL
          AND submitted_at IS NOT NULL
          AND reviewed_by_id IS NULL
          AND reviewed_at IS NULL
          AND received_amount IS NULL
          AND rejection_reason IS NULL
        )
        OR (
          status = 'VERIFIED'
          AND evidence_bucket IS NOT NULL
          AND evidence_object_path IS NOT NULL
          AND customer_declared_at IS NOT NULL
          AND submitted_at IS NOT NULL
          AND reviewed_by_id IS NOT NULL
          AND reviewed_at IS NOT NULL
          AND received_amount > 0
          AND rejection_reason IS NULL
        )
        OR (
          status = 'REJECTED'
          AND evidence_bucket IS NOT NULL
          AND evidence_object_path IS NOT NULL
          AND customer_declared_at IS NOT NULL
          AND submitted_at IS NOT NULL
          AND reviewed_by_id IS NOT NULL
          AND reviewed_at IS NOT NULL
          AND received_amount IS NULL
          AND NULLIF(BTRIM(rejection_reason), '') IS NOT NULL
        )
        OR (
          status IN ('EXPIRED', 'CANCELLED')
          AND evidence_bucket IS NULL
          AND evidence_object_path IS NULL
          AND customer_declared_at IS NULL
          AND submitted_at IS NULL
          AND reviewed_by_id IS NULL
          AND reviewed_at IS NULL
          AND received_amount IS NULL
          AND rejection_reason IS NULL
        )
      )
  `;
  const failed = violations.filter(({ count }) => count > 0);
  process.stdout.write(`${JSON.stringify({ checks: violations }, null, 2)}\n`);
  if (failed.length > 0) {
    throw new Error(`Slice 07 preflight found ${failed.length.toString()} violated invariant(s)`);
  }
} finally {
  await prisma.$disconnect();
}
