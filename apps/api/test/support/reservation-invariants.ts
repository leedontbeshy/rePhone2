import type { PrismaClient } from '../../src/generated/prisma/client.js';

export interface ReservationViolationCount {
  checkName: string;
  count: number;
}

export function findReservationViolations(
  prisma: PrismaClient,
  configuredPrivateBucket: string,
): Promise<ReservationViolationCount[]> {
  return prisma.$queryRaw<ReservationViolationCount[]>`
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
    SELECT 'payments_evidence_private_bucket_check', COUNT(*)::int
    FROM payments
    WHERE evidence_bucket IS NOT NULL
      AND evidence_bucket <> ${configuredPrivateBucket}
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
}
