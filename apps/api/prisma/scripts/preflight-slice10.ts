import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';

export interface Slice10PreflightViolationCount {
  checkName: string;
  count: number;
}

export function findSlice10PreflightViolations(
  prisma: PrismaClient,
  configuredPrivateBucket: string,
): Promise<Slice10PreflightViolationCount[]> {
  return prisma.$queryRaw<Slice10PreflightViolationCount[]>`
    SELECT 'refunds_values_check' AS "checkName", COUNT(*)::int AS count
    FROM refunds
    WHERE (
      amount > 0
      AND CHAR_LENGTH(BTRIM(reason)) BETWEEN 5 AND 500
      AND (
        terminal_reason IS NULL
        OR CHAR_LENGTH(BTRIM(terminal_reason)) BETWEEN 5 AND 500
      )
      AND (
        note IS NULL
        OR CHAR_LENGTH(BTRIM(note)) BETWEEN 5 AND 500
      )
    ) IS NOT TRUE
    UNION ALL
    SELECT 'refunds_requester_check', COUNT(*)::int
    FROM refunds
    WHERE (
      requested_by_type = 'CUSTOMER'
      OR (requested_by_type = 'STAFF' AND requested_by_id IS NOT NULL)
      OR (requested_by_type = 'SYSTEM' AND requested_by_id IS NULL)
    ) IS NOT TRUE
    UNION ALL
    SELECT 'refunds_requester_actor_alignment', COUNT(*)::int
    FROM refunds refund
    LEFT JOIN users requester ON requester.id = refund.requested_by_id
    WHERE (
      (refund.requested_by_type = 'CUSTOMER'
        AND (refund.requested_by_id IS NULL OR requester.role = 'CUSTOMER'))
      OR (refund.requested_by_type = 'STAFF'
        AND requester.role IN ('EMPLOYEE', 'ADMIN'))
      OR (refund.requested_by_type = 'SYSTEM'
        AND refund.requested_by_id IS NULL)
    ) IS NOT TRUE
    UNION ALL
    SELECT 'refunds_staff_actor_alignment', COUNT(*)::int
    FROM refunds refund
    LEFT JOIN users processor ON processor.id = refund.processed_by_id
    LEFT JOIN users terminal_actor ON terminal_actor.id = refund.terminal_by_id
    WHERE (
      (refund.processed_by_id IS NULL OR processor.role IN ('EMPLOYEE', 'ADMIN'))
      AND (refund.terminal_by_id IS NULL OR terminal_actor.role IN ('EMPLOYEE', 'ADMIN'))
    ) IS NOT TRUE
    UNION ALL
    SELECT 'refunds_evidence_pair_and_path_check', COUNT(*)::int
    FROM refunds
    WHERE (
      (evidence_bucket IS NULL AND evidence_object_path IS NULL)
      OR (
        evidence_bucket IS NOT NULL
        AND evidence_object_path IS NOT NULL
        AND NULLIF(BTRIM(evidence_bucket), '') IS NOT NULL
        AND NULLIF(BTRIM(evidence_object_path), '') IS NOT NULL
        AND evidence_object_path ~ ('^refunds/' || id::text || '/[^/]+$')
      )
    ) IS NOT TRUE
    UNION ALL
    SELECT 'refunds_evidence_private_bucket_check', COUNT(*)::int
    FROM refunds
    WHERE evidence_bucket IS NOT NULL
      AND evidence_bucket <> ${configuredPrivateBucket}
    UNION ALL
    SELECT 'refunds_status_timestamp_check', COUNT(*)::int
    FROM refunds
    WHERE (
      (
        status = 'REQUESTED'
        AND processed_by_id IS NULL
        AND processing_at IS NULL
        AND completed_at IS NULL
        AND terminal_reason IS NULL
        AND terminal_by_id IS NULL
        AND terminal_at IS NULL
        AND note IS NULL
        AND evidence_bucket IS NULL
        AND evidence_object_path IS NULL
      )
      OR (
        status = 'PROCESSING'
        AND method IN ('BANK_TRANSFER', 'CASH')
        AND processed_by_id IS NOT NULL
        AND processing_at IS NOT NULL
        AND processing_at >= created_at
        AND completed_at IS NULL
        AND terminal_reason IS NULL
        AND terminal_by_id IS NULL
        AND terminal_at IS NULL
        AND evidence_bucket IS NULL
        AND evidence_object_path IS NULL
      )
      OR (
        status = 'COMPLETED'
        AND method IN ('BANK_TRANSFER', 'CASH')
        AND processed_by_id IS NOT NULL
        AND processing_at IS NOT NULL
        AND completed_at IS NOT NULL
        AND processing_at >= created_at
        AND completed_at >= processing_at
        AND terminal_reason IS NULL
        AND terminal_by_id IS NULL
        AND terminal_at IS NULL
        AND note IS NOT NULL
        AND (
          (method = 'BANK_TRANSFER'
            AND evidence_bucket IS NOT NULL
            AND evidence_object_path IS NOT NULL)
          OR (method = 'CASH'
            AND evidence_bucket IS NULL
            AND evidence_object_path IS NULL)
        )
      )
      OR (
        status IN ('REJECTED', 'CANCELLED')
        AND processed_by_id IS NULL
        AND processing_at IS NULL
        AND completed_at IS NULL
        AND terminal_reason IS NOT NULL
        AND terminal_by_id IS NOT NULL
        AND terminal_at IS NOT NULL
        AND terminal_at >= created_at
        AND note IS NULL
        AND evidence_bucket IS NULL
        AND evidence_object_path IS NULL
      )
    ) IS NOT TRUE
    UNION ALL
    SELECT 'refunds_other_processing_or_completed', COUNT(*)::int
    FROM refunds
    WHERE method = 'OTHER' AND status IN ('PROCESSING', 'COMPLETED')
    UNION ALL
    SELECT 'refunds_evidence_metadata_lifecycle_check', COUNT(*)::int
    FROM refunds refund
    WHERE (
      (
        refund.method = 'BANK_TRANSFER'
        AND refund.status = 'COMPLETED'
        AND (TO_JSONB(refund) ->> 'evidence_mime_type') IN (
          'image/jpeg',
          'image/png',
          'image/webp',
          'application/pdf'
        )
        AND CASE
          WHEN (TO_JSONB(refund) ->> 'evidence_file_size') ~ '^[0-9]+$'
          THEN (TO_JSONB(refund) ->> 'evidence_file_size')::bigint BETWEEN 1 AND 10485760
          ELSE FALSE
        END
        AND (TO_JSONB(refund) ->> 'evidence_sha256') ~ '^[0-9a-f]{64}$'
      )
      OR (
        NOT (refund.method = 'BANK_TRANSFER' AND refund.status = 'COMPLETED')
        AND (TO_JSONB(refund) ->> 'evidence_mime_type') IS NULL
        AND (TO_JSONB(refund) ->> 'evidence_file_size') IS NULL
        AND (TO_JSONB(refund) ->> 'evidence_sha256') IS NULL
      )
    ) IS NOT TRUE
    UNION ALL
    SELECT 'refunds_payment_order_alignment', COUNT(*)::int
    FROM refunds refund
    JOIN payments payment ON payment.id = refund.payment_id
    WHERE refund.payment_id IS NOT NULL
      AND payment.order_id <> refund.order_id
    UNION ALL
    SELECT 'orders_refunded_not_above_paid_check', COUNT(*)::int
    FROM orders
    WHERE refunded_amount > paid_amount
    UNION ALL
    SELECT 'refunds_active_total_not_above_verified', COUNT(*)::int
    FROM (
      SELECT
        refund.order_id,
        SUM(refund.amount) AS covered_amount,
        COALESCE(payment_total.verified_amount, 0) AS verified_amount
      FROM refunds refund
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(payment.received_amount), 0) AS verified_amount
        FROM payments payment
        WHERE payment.order_id = refund.order_id
          AND payment.status = 'VERIFIED'
      ) payment_total ON TRUE
      WHERE refund.status IN ('REQUESTED', 'PROCESSING', 'COMPLETED')
      GROUP BY refund.order_id, payment_total.verified_amount
    ) refund_aggregate
    WHERE refund_aggregate.covered_amount > refund_aggregate.verified_amount
    UNION ALL
    SELECT 'orders_refund_finance_projection', COUNT(*)::int
    FROM orders refund_order
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(payment.received_amount), 0) AS verified_amount
      FROM payments payment
      WHERE payment.order_id = refund_order.id
        AND payment.status = 'VERIFIED'
    ) payment_total ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(refund.amount), 0) AS completed_amount
      FROM refunds refund
      WHERE refund.order_id = refund_order.id
        AND refund.status = 'COMPLETED'
    ) refund_total ON TRUE
    WHERE (
      EXISTS (SELECT 1 FROM refunds refund WHERE refund.order_id = refund_order.id)
      OR refund_order.refunded_amount <> 0
      OR refund_order.payment_status IN ('PARTIALLY_REFUNDED', 'REFUNDED')
    )
      AND (
        refund_order.paid_amount = payment_total.verified_amount
        AND refund_order.refunded_amount = refund_total.completed_amount
        AND (
          (refund_total.completed_amount = 0
            AND refund_order.payment_status NOT IN ('PARTIALLY_REFUNDED', 'REFUNDED'))
          OR (refund_total.completed_amount > 0
            AND refund_total.completed_amount < payment_total.verified_amount
            AND refund_order.payment_status = 'PARTIALLY_REFUNDED')
          OR (refund_total.completed_amount > 0
            AND refund_total.completed_amount = payment_total.verified_amount
            AND refund_order.payment_status = 'REFUNDED')
        )
      ) IS NOT TRUE
  `;
}

async function runSlice10Preflight(): Promise<void> {
  loadWorkspaceEnvironment();
  const connectionString = requiredEnvironment('DATABASE_URL');
  const configuredPrivateBucket = requiredEnvironment('SUPABASE_PRIVATE_BUCKET');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const violations = await findSlice10PreflightViolations(prisma, configuredPrivateBucket);
    const failed = violations.filter(({ count }) => count > 0);
    process.stdout.write(`${JSON.stringify({ checks: violations }, null, 2)}\n`);
    if (failed.length > 0) {
      throw new Error(`Slice 10 preflight found ${failed.length.toString()} violated invariant(s)`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for the Slice 10 preflight`);
  }
  return value;
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && import.meta.url === pathToFileURL(resolve(entrypoint)).href;
}

if (isMainModule()) {
  await runSlice10Preflight();
}
