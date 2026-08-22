import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import type { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

describe('Slice 07 payment evidence database invariants', () => {
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

  it('installs the payment evidence constraints and expiry index', async () => {
    const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'payments_evidence_shape_check',
        'payments_evidence_owner_path_check',
        'payments_bank_deposit_lifecycle_check'
      )
      ORDER BY conname
    `;
    const indexes = await prisma.$queryRaw<Array<{ indexdef: string; indexname: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'payments_status_expires_at_id_idx'
    `;

    expect(constraints.map(({ conname }) => conname)).toEqual([
      'payments_bank_deposit_lifecycle_check',
      'payments_evidence_owner_path_check',
      'payments_evidence_shape_check',
    ]);
    expect(indexes).toHaveLength(1);
    expect(indexes[0]?.indexdef).toContain('(status, expires_at, id)');
  });

  it('requires a non-blank evidence pair owned by the payment path', async () => {
    const fixture = await createOrderFixture(prisma);
    const paymentId = randomUUID();
    const submittedAt = new Date('2026-08-22T03:00:00.000Z');
    await prisma.payment.create({
      data: {
        ...bankDepositBase(fixture.orderId, paymentId),
        status: 'UNDER_REVIEW',
        evidenceBucket: 'private-test',
        evidenceObjectPath: evidencePath(paymentId),
        customerDeclaredAt: submittedAt,
        submittedAt,
      },
    });

    await expect(
      prisma.payment.update({
        where: { id: paymentId },
        data: { evidenceObjectPath: null },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.payment.update({ where: { id: paymentId }, data: { evidenceBucket: '   ' } }),
    ).rejects.toThrow();
    await expect(
      prisma.payment.update({
        where: { id: paymentId },
        data: { evidenceObjectPath: `payments/${randomUUID()}/proof.png` },
      }),
    ).rejects.toThrow();
  });

  it('enforces the complete bank deposit lifecycle without constraining cash payments', async () => {
    const fixture = await createOrderFixture(prisma);
    const reviewer = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'employee@rephone.local' },
      select: { id: true },
    });
    const submittedAt = new Date('2026-08-22T03:00:00.000Z');
    const reviewedAt = new Date('2026-08-22T03:05:00.000Z');
    const awaitingId = randomUUID();
    const underReviewId = randomUUID();
    const verifiedId = randomUUID();
    const rejectedId = randomUUID();

    await prisma.payment.createMany({
      data: [
        bankDepositBase(fixture.orderId, awaitingId),
        {
          ...bankDepositBase(fixture.orderId, underReviewId),
          status: 'UNDER_REVIEW',
          evidenceBucket: 'private-test',
          evidenceObjectPath: evidencePath(underReviewId),
          customerDeclaredAt: submittedAt,
          submittedAt,
        },
        {
          ...bankDepositBase(fixture.orderId, verifiedId),
          status: 'VERIFIED',
          evidenceBucket: 'private-test',
          evidenceObjectPath: evidencePath(verifiedId),
          customerDeclaredAt: submittedAt,
          submittedAt,
          reviewedById: reviewer.id,
          reviewedAt,
          receivedAmount: '500000',
        },
        {
          ...bankDepositBase(fixture.orderId, rejectedId),
          status: 'REJECTED',
          evidenceBucket: 'private-test',
          evidenceObjectPath: evidencePath(rejectedId),
          customerDeclaredAt: submittedAt,
          submittedAt,
          reviewedById: reviewer.id,
          reviewedAt,
          rejectionReason: 'Chứng từ không khớp giao dịch',
        },
        { ...bankDepositBase(fixture.orderId, randomUUID()), status: 'EXPIRED' },
        { ...bankDepositBase(fixture.orderId, randomUUID()), status: 'CANCELLED' },
        {
          orderId: fixture.orderId,
          purpose: 'BALANCE',
          method: 'CASH',
          expectedAmount: '500000',
          receivedAmount: '500000',
          status: 'VERIFIED',
          reviewedAt,
        },
      ],
    });

    expect(await prisma.payment.count({ where: { orderId: fixture.orderId } })).toBe(7);
    await expect(
      prisma.payment.update({
        where: { id: awaitingId },
        data: { status: 'UNDER_REVIEW' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.payment.update({
        where: { id: awaitingId },
        data: {
          status: 'CANCELLED',
          evidenceBucket: 'private-test',
          evidenceObjectPath: evidencePath(awaitingId),
        },
      }),
    ).rejects.toThrow();
  });

  it('does not reset an order, proof under review, or active review reservation on reseed', async () => {
    const fixture = await createOrderFixture(prisma);
    const paymentId = randomUUID();
    const submittedAt = new Date('2026-08-22T03:00:00.000Z');
    await prisma.$transaction(async (transaction) => {
      await transaction.stockLevel.update({
        where: { id: fixture.stockLevelId },
        data: { quantityReserved: { increment: 1 } },
      });
      await transaction.inventoryReservation.create({
        data: {
          orderId: fixture.orderId,
          orderItemId: fixture.orderItemId,
          stockLevelId: fixture.stockLevelId,
          quantity: 1,
          status: 'ACTIVE',
          holdReason: 'REVIEW',
          expiresAt: null,
        },
      });
      await transaction.payment.create({
        data: {
          ...bankDepositBase(fixture.orderId, paymentId),
          status: 'UNDER_REVIEW',
          evidenceBucket: 'private-test',
          evidenceObjectPath: evidencePath(paymentId),
          customerDeclaredAt: submittedAt,
          submittedAt,
        },
      });
    });

    const before = await readOperationalState(prisma, fixture.orderId, paymentId);
    await seedDatabase(prisma);
    await seedDatabase(prisma);
    const after = await readOperationalState(prisma, fixture.orderId, paymentId);

    expect(after).toEqual(before);
  });
});

function bankDepositBase(orderId: string, id: string): Prisma.PaymentUncheckedCreateInput {
  return {
    id,
    orderId,
    purpose: 'DEPOSIT',
    method: 'BANK_TRANSFER',
    expectedAmount: '500000',
    status: 'AWAITING_PROOF',
    transferContent: 'RPH20260822DATABASE',
    bankNameSnapshot: 'DEMO BANK',
    bankAccountNumberSnapshot: '0000000000',
    bankAccountHolderSnapshot: 'REPHONE DEMO',
    reviewWindowMinutesSnapshot: 1_440,
    expiresAt: new Date('2026-08-23T03:00:00.000Z'),
  };
}

function evidencePath(paymentId: string): string {
  return `payments/${paymentId}/proof.png`;
}

async function createOrderFixture(prisma: PrismaClient): Promise<{
  orderId: string;
  orderItemId: string;
  stockLevelId: string;
}> {
  const stock = await prisma.stockLevel.findFirstOrThrow({
    where: { variant: { inventoryMode: 'QUANTITY' }, quantityOnHand: { gt: 0 } },
    include: { variant: { include: { product: true } } },
  });
  const tokenHash = randomHex64();
  const cart = await prisma.cart.create({
    data: {
      guestTokenHash: tokenHash,
      status: 'CONVERTED',
      expiresAt: new Date('2026-09-22T00:00:00.000Z'),
    },
  });
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  const order = await prisma.order.create({
    data: {
      orderNumber: `RPH-20260822-${suffix}`,
      sourceCartId: cart.id,
      guestAccessTokenHash: randomHex64(),
      customerName: 'Khách kiểm thử database',
      customerEmail: 'slice07-db@example.com',
      customerPhone: '0900000000',
      fulfillmentType: 'SHIPPING',
      fulfillmentLocationId: stock.locationId,
      shippingAddressSnapshot: {
        receiverName: 'Khách kiểm thử database',
        phone: '0900000000',
        addressLine: '123 Đường Kiểm Thử',
        ward: 'Phường Test',
        district: 'Quận Test',
        province: 'TP. Hồ Chí Minh',
      },
      subtotal: '1000000',
      shippingFeeOriginal: '30000',
      shippingFee: '30000',
      grandTotal: '1030000',
      depositRequired: '500000',
      paidAmount: '0',
      refundedAmount: '0',
      balanceDue: '1030000',
    },
  });
  const orderItem = await prisma.orderItem.create({
    data: {
      orderId: order.id,
      productId: stock.variant.productId,
      variantId: stock.variantId,
      productTypeSnapshot: stock.variant.product.type,
      productNameSnapshot: stock.variant.product.name,
      variantNameSnapshot: stock.variant.displayName,
      skuSnapshot: stock.variant.sku,
      quantity: 1,
      unitPrice: '1000000',
      lineSubtotal: '1000000',
      discountAmount: '0',
      lineTotal: '1000000',
      warrantyDaysSnapshot: 30,
      warrantyTermsSnapshot: 'Bảo hành kiểm thử 30 ngày',
    },
  });

  return { orderId: order.id, orderItemId: orderItem.id, stockLevelId: stock.id };
}

async function readOperationalState(prisma: PrismaClient, orderId: string, paymentId: string) {
  const [order, payment, reservation, stock] = await Promise.all([
    prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        status: true,
        fulfillmentStatus: true,
        paymentStatus: true,
        paidAmount: true,
        balanceDue: true,
      },
    }),
    prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      select: {
        status: true,
        evidenceBucket: true,
        evidenceObjectPath: true,
        customerDeclaredAt: true,
        submittedAt: true,
        reviewedAt: true,
      },
    }),
    prisma.inventoryReservation.findFirstOrThrow({
      where: { orderId },
      select: { id: true, status: true, holdReason: true, expiresAt: true, releasedAt: true },
    }),
    prisma.stockLevel.findFirstOrThrow({
      where: { reservations: { some: { orderId } } },
      select: { id: true, quantityOnHand: true, quantityReserved: true },
    }),
  ]);

  return { order, payment, reservation, stock };
}

function randomHex64(): string {
  return randomUUID().replaceAll('-', '').repeat(2);
}
