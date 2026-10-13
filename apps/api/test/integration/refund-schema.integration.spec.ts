import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import { findRefundViolations } from '../support/refund-invariants.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

const PRIVATE_BUCKET = 'private-test';

describe('refund workflow database invariants', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    setTestEnvironment();
    prisma = createTestPrisma();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('installs refund evidence columns, lifecycle defenses, composite ownership, and queues', async () => {
    const columns = await prisma.$queryRaw<Array<{ columnName: string }>>`
      SELECT column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'refunds'
        AND column_name IN (
          'evidence_mime_type',
          'evidence_file_size',
          'evidence_sha256',
          'idempotency_key',
          'request_fingerprint'
        )
      ORDER BY column_name
    `;
    const constraints = await prisma.$queryRaw<Array<{ constraintName: string }>>`
      SELECT conname AS "constraintName"
      FROM pg_constraint
      WHERE conname IN (
        'orders_refunded_not_above_paid_check',
        'payments_id_order_id_key',
        'refunds_evidence_shape_check',
        'refunds_idempotency_shape_check',
        'refunds_payment_id_order_id_fkey',
        'refunds_requester_check',
        'refunds_status_timestamp_check',
        'refunds_values_check'
      )
      ORDER BY conname
    `;
    const legacyPaymentForeignKey = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM pg_constraint
      WHERE conname = 'refunds_payment_id_fkey'
    `;
    const indexes = await prisma.$queryRaw<Array<{ indexdef: string; indexname: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'refunds_status_created_at_id_idx',
          'refunds_status_processing_at_id_idx',
          'refunds_idempotency_key_key'
        )
      ORDER BY indexname
    `;

    expect(columns.map(({ columnName }) => columnName)).toEqual([
      'evidence_file_size',
      'evidence_mime_type',
      'evidence_sha256',
      'idempotency_key',
      'request_fingerprint',
    ]);
    expect(constraints.map(({ constraintName }) => constraintName)).toEqual([
      'orders_refunded_not_above_paid_check',
      'payments_id_order_id_key',
      'refunds_evidence_shape_check',
      'refunds_idempotency_shape_check',
      'refunds_payment_id_order_id_fkey',
      'refunds_requester_check',
      'refunds_status_timestamp_check',
      'refunds_values_check',
    ]);
    expect(legacyPaymentForeignKey).toEqual([{ count: 0 }]);
    expect(indexes).toHaveLength(3);
    expect(
      indexes.find(({ indexname }) => indexname === 'refunds_idempotency_key_key')?.indexdef,
    ).toContain('UNIQUE');
    expect(
      indexes.find(({ indexname }) => indexname === 'refunds_status_created_at_id_idx')?.indexdef,
    ).toContain('(status, created_at, id)');
    expect(
      indexes.find(({ indexname }) => indexname === 'refunds_status_processing_at_id_idx')
        ?.indexdef,
    ).toContain('(status, processing_at, id)');
  });

  it('enforces requester, lifecycle, evidence, and Payment ownership invariants', async () => {
    const first = await createPaidCancelledOrder(prisma);
    const second = await createPaidCancelledOrder(prisma);
    const staff = await employee(prisma);

    await expect(
      prisma.refund.create({
        data: requestedRefund(first.orderId, first.paymentId, 'SYSTEM', staff.id),
      }),
    ).rejects.toThrow();
    await expect(
      prisma.refund.create({
        data: requestedRefund(first.orderId, first.paymentId, 'STAFF', null),
      }),
    ).rejects.toThrow();
    await expect(
      prisma.refund.create({
        data: requestedRefund(first.orderId, second.paymentId, 'SYSTEM', null),
      }),
    ).rejects.toThrow();

    const bankRefund = await prisma.refund.create({
      data: requestedRefund(first.orderId, first.paymentId, 'SYSTEM', null),
    });
    await expect(
      prisma.refund.update({
        where: { id: bankRefund.id },
        data: { status: 'PROCESSING', processingAt: after(bankRefund.createdAt, 1) },
      }),
    ).rejects.toThrow();

    await prisma.refund.update({
      where: { id: bankRefund.id },
      data: {
        status: 'PROCESSING',
        processedById: staff.id,
        processingAt: after(bankRefund.createdAt, 1),
      },
    });
    await expect(
      prisma.refund.update({
        where: { id: bankRefund.id },
        data: {
          status: 'COMPLETED',
          completedAt: after(bankRefund.createdAt, 2),
          note: 'Đã hoàn tiền qua ngân hàng',
        },
      }),
    ).rejects.toThrow();

    const evidencePath = `refunds/${bankRefund.id}/${randomUUID()}.pdf`;
    await prisma.$executeRaw`
      UPDATE refunds
      SET status = 'COMPLETED',
          completed_at = ${after(bankRefund.createdAt, 2)},
          note = 'Đã hoàn tiền qua ngân hàng',
          evidence_bucket = ${PRIVATE_BUCKET},
          evidence_object_path = ${evidencePath},
          evidence_mime_type = 'application/pdf',
          evidence_file_size = 1024,
          evidence_sha256 = ${'a'.repeat(64)}
      WHERE id = ${bankRefund.id}::uuid
    `;
    await expect(
      prisma.$executeRaw`
        UPDATE refunds
        SET evidence_object_path = ${`refunds/${randomUUID()}/proof.pdf`}
        WHERE id = ${bankRefund.id}::uuid
      `,
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`
        UPDATE refunds
        SET evidence_file_size = 0
        WHERE id = ${bankRefund.id}::uuid
      `,
    ).rejects.toThrow();

    await expect(
      prisma.order.update({
        where: { id: first.orderId },
        data: { refundedAmount: '1000001' },
      }),
    ).rejects.toThrow();
  });

  it('permits only exact terminal shapes and blocks OTHER processing', async () => {
    const fixture = await createPaidCancelledOrder(prisma);
    const staff = await employee(prisma);
    const other = await prisma.refund.create({
      data: {
        ...requestedRefund(fixture.orderId, null, 'SYSTEM', null),
        method: 'OTHER',
      },
    });
    await expect(
      prisma.refund.update({
        where: { id: other.id },
        data: {
          status: 'PROCESSING',
          processedById: staff.id,
          processingAt: after(other.createdAt, 1),
        },
      }),
    ).rejects.toThrow();

    const rejected = await prisma.refund.create({
      data: {
        ...requestedRefund(fixture.orderId, fixture.paymentId, 'STAFF', staff.id),
        amount: '100000',
      },
    });
    await prisma.refund.update({
      where: { id: rejected.id },
      data: {
        status: 'REJECTED',
        terminalReason: 'Yêu cầu hoàn tiền không hợp lệ',
        terminalById: staff.id,
        terminalAt: after(rejected.createdAt, 1),
      },
    });
    await expect(
      prisma.refund.update({
        where: { id: rejected.id },
        data: { note: 'Không được giữ processing note' },
      }),
    ).rejects.toThrow();
  });

  it('reports zero exact preflight violations for a valid requested Refund', async () => {
    const fixture = await createPaidCancelledOrder(prisma);
    await prisma.refund.create({
      data: requestedRefund(fixture.orderId, fixture.paymentId, 'SYSTEM', null),
    });

    expect(await findRefundViolations(prisma, PRIVATE_BUCKET)).toEqual(
      PREFLIGHT_CHECKS.map((checkName) => ({ checkName, count: 0 })),
    );
  });

  it('preflight catches aggregate and projection drift that row checks cannot enforce', async () => {
    const fixture = await createPaidCancelledOrder(prisma);
    await prisma.refund.createMany({
      data: [
        {
          ...requestedRefund(fixture.orderId, fixture.paymentId, 'SYSTEM', null),
          amount: '600000',
        },
        {
          ...requestedRefund(fixture.orderId, fixture.paymentId, 'SYSTEM', null),
          amount: '500000',
        },
      ],
    });
    await prisma.order.update({
      where: { id: fixture.orderId },
      data: { refundedAmount: '100000' },
    });

    const counts = new Map(
      (await findRefundViolations(prisma, PRIVATE_BUCKET)).map(({ checkName, count }) => [
        checkName,
        count,
      ]),
    );
    expect(counts.get('refunds_active_total_not_above_verified')).toBe(1);
    expect(counts.get('orders_refund_finance_projection')).toBe(1);
  });

  it('does not reset processing or completed evidence state on reseed', async () => {
    const fixture = await createPaidCancelledOrder(prisma);
    const staff = await employee(prisma);
    const processing = await prisma.refund.create({
      data: {
        ...requestedRefund(fixture.orderId, fixture.paymentId, 'SYSTEM', null),
        method: 'CASH',
        amount: '200000',
      },
    });
    await prisma.refund.update({
      where: { id: processing.id },
      data: {
        status: 'PROCESSING',
        processedById: staff.id,
        processingAt: after(processing.createdAt, 1),
        note: 'Đang chuẩn bị tiền mặt',
      },
    });

    const completed = await prisma.refund.create({
      data: {
        ...requestedRefund(fixture.orderId, fixture.paymentId, 'SYSTEM', null),
        amount: '300000',
      },
    });
    const completedEvidencePath = `refunds/${completed.id}/${randomUUID()}.webp`;
    await prisma.$executeRaw`
      UPDATE refunds
      SET status = 'PROCESSING',
          processed_by_id = ${staff.id}::uuid,
          processing_at = ${after(completed.createdAt, 1)}
      WHERE id = ${completed.id}::uuid
    `;
    await prisma.$executeRaw`
      UPDATE refunds
      SET status = 'COMPLETED',
          completed_at = ${after(completed.createdAt, 2)},
          note = 'Đã chuyển khoản hoàn tiền',
          evidence_bucket = ${PRIVATE_BUCKET},
          evidence_object_path = ${completedEvidencePath},
          evidence_mime_type = 'image/webp',
          evidence_file_size = 2048,
          evidence_sha256 = ${'b'.repeat(64)}
      WHERE id = ${completed.id}::uuid
    `;
    await prisma.order.update({
      where: { id: fixture.orderId },
      data: { refundedAmount: '300000', paymentStatus: 'PARTIALLY_REFUNDED' },
    });
    const before = await readOperationalState(prisma, fixture.orderId);

    await seedDatabase(prisma);
    await seedDatabase(prisma);

    expect(await readOperationalState(prisma, fixture.orderId)).toEqual(before);
    expect(await findRefundViolations(prisma, PRIVATE_BUCKET)).toEqual(
      PREFLIGHT_CHECKS.map((checkName) => ({ checkName, count: 0 })),
    );
  });
});

const PREFLIGHT_CHECKS = [
  'refunds_values_check',
  'refunds_requester_check',
  'refunds_requester_actor_alignment',
  'refunds_staff_actor_alignment',
  'refunds_evidence_pair_and_path_check',
  'refunds_evidence_private_bucket_check',
  'refunds_status_timestamp_check',
  'refunds_other_processing_or_completed',
  'refunds_evidence_metadata_lifecycle_check',
  'refunds_payment_order_alignment',
  'orders_refunded_not_above_paid_check',
  'refunds_active_total_not_above_verified',
  'orders_refund_finance_projection',
] as const;

type PaidOrderFixture = {
  orderId: string;
  paymentId: string;
};

async function createPaidCancelledOrder(prisma: PrismaClient): Promise<PaidOrderFixture> {
  const location = await prisma.inventoryLocation.findFirstOrThrow({
    where: { type: 'STORE', status: 'ACTIVE' },
    select: { id: true },
  });
  const now = new Date();
  const placedAt = new Date(now.getTime() - 7_200_000);
  const cancelledAt = new Date(now.getTime() - 3_600_000);
  const cart = await prisma.cart.create({
    data: {
      guestTokenHash: randomHex64(),
      status: 'CONVERTED',
      expiresAt: new Date(now.getTime() + 86_400_000),
    },
  });
  const order = await prisma.order.create({
    data: {
      orderNumber: `RPH-20260824-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
      sourceCartId: cart.id,
      guestAccessTokenHash: randomHex64(),
      customerName: 'Khách kiểm thử Slice 10',
      customerEmail: 'slice10-db@example.com',
      customerPhone: '0900000000',
      fulfillmentType: 'PICKUP',
      fulfillmentLocationId: location.id,
      pickupLocationId: location.id,
      pickupHoldUntil: new Date(now.getTime() + 86_400_000),
      fulfillmentStatus: 'CANCELLED',
      status: 'CANCELLED',
      subtotal: '1000000',
      grandTotal: '1000000',
      paidAmount: '1000000',
      refundedAmount: '0',
      balanceDue: '0',
      paymentStatus: 'PAID',
      cancelReason: 'Hủy để kiểm thử hoàn tiền',
      placedAt,
      cancelledAt,
    },
  });
  const reviewer = await employee(prisma);
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      purpose: 'FULL_PAYMENT',
      method: 'BANK_TRANSFER',
      expectedAmount: '1000000',
      receivedAmount: '1000000',
      status: 'VERIFIED',
      reviewedById: reviewer.id,
      reviewedAt: new Date(now.getTime() - 5_400_000),
    },
  });
  return { orderId: order.id, paymentId: payment.id };
}

function requestedRefund(
  orderId: string,
  paymentId: string | null,
  requestedByType: 'CUSTOMER' | 'STAFF' | 'SYSTEM',
  requestedById: string | null,
) {
  return {
    orderId,
    paymentId,
    amount: '250000',
    method: 'BANK_TRANSFER' as const,
    status: 'REQUESTED' as const,
    reason: 'Hoàn tiền theo yêu cầu kiểm thử',
    requestedByType,
    requestedById,
  };
}

async function employee(prisma: PrismaClient): Promise<{ id: string }> {
  return prisma.user.findUniqueOrThrow({
    where: { normalizedEmail: 'employee@rephone.local' },
    select: { id: true },
  });
}

async function readOperationalState(prisma: PrismaClient, orderId: string) {
  const [order, payment, refunds] = await Promise.all([
    prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        status: true,
        fulfillmentStatus: true,
        paymentStatus: true,
        paidAmount: true,
        refundedAmount: true,
        updatedAt: true,
      },
    }),
    prisma.payment.findFirstOrThrow({
      where: { orderId },
      select: {
        status: true,
        expectedAmount: true,
        receivedAmount: true,
        reviewedAt: true,
        updatedAt: true,
      },
    }),
    prisma.$queryRaw<
      Array<{
        completedAt: Date | null;
        evidenceBucket: string | null;
        evidenceFileSize: number | null;
        evidenceMimeType: string | null;
        evidenceObjectPath: string | null;
        evidenceSha256: string | null;
        id: string;
        note: string | null;
        processingAt: Date | null;
        status: string;
        updatedAt: Date;
      }>
    >`
      SELECT
        id,
        status::text AS status,
        processing_at AS "processingAt",
        completed_at AS "completedAt",
        note,
        evidence_bucket AS "evidenceBucket",
        evidence_object_path AS "evidenceObjectPath",
        evidence_mime_type AS "evidenceMimeType",
        evidence_file_size AS "evidenceFileSize",
        evidence_sha256 AS "evidenceSha256",
        updated_at AS "updatedAt"
      FROM refunds
      WHERE order_id = ${orderId}::uuid
      ORDER BY id
    `,
  ]);
  return { order, payment, refunds };
}

function after(value: Date, seconds: number): Date {
  return new Date(value.getTime() + seconds * 1_000);
}

function randomHex64(): string {
  return randomUUID().replaceAll('-', '').repeat(2);
}
