import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import type { AppConfig } from '../../src/config/app-config.js';
import type { PrismaService } from '../../src/database/prisma.service.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { AuthMaintenanceRepository } from '../../src/modules/auth/auth-maintenance.repository.js';
import { AuthMaintenanceService } from '../../src/modules/auth/auth-maintenance.service.js';
import { CartRepository } from '../../src/modules/cart/cart.repository.js';
import { GuestCartMaintenanceService } from '../../src/modules/cart/guest-cart-maintenance.service.js';
import { OverduePaymentReviewReporter } from '../../src/modules/payment-operations/overdue-payment-review-reporter.service.js';
import { PaymentOperationsRepository } from '../../src/modules/payment-operations/payment-operations.repository.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

const NOW = new Date('2026-08-25T12:00:00.000Z');

describe('Slice 12 bounded maintenance jobs', () => {
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

  it('expires only due guest carts and purges only auth records terminal for thirty days', async () => {
    const customer = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'customer@rephone.local' },
      select: { id: true },
    });
    const [expiredGuest, futureGuest, customerCart] = await Promise.all([
      prisma.cart.create({
        data: {
          guestTokenHash: '1'.repeat(64),
          expiresAt: new Date('2026-08-25T11:59:00.000Z'),
        },
      }),
      prisma.cart.create({
        data: {
          guestTokenHash: '2'.repeat(64),
          expiresAt: new Date('2026-08-25T12:01:00.000Z'),
        },
      }),
      prisma.cart.create({ data: { customerId: customer.id } }),
    ]);

    const cartService = new GuestCartMaintenanceService(
      new CartRepository(prisma as unknown as PrismaService),
      config(),
    );
    await expect(cartService.markExpired(NOW)).resolves.toMatchObject({
      scanned: 1,
      expired: 1,
      failed: 0,
    });
    const carts = await prisma.cart.findMany({
      where: { id: { in: [expiredGuest.id, futureGuest.id, customerCart.id] } },
      select: { id: true, status: true },
      orderBy: { id: 'asc' },
    });
    expect(new Map(carts.map(({ id, status }) => [id, status]))).toEqual(
      new Map([
        [expiredGuest.id, 'EXPIRED'],
        [futureGuest.id, 'ACTIVE'],
        [customerCart.id, 'ACTIVE'],
      ]),
    );

    const oldSession = await prisma.authSession.create({
      data: {
        userId: customer.id,
        refreshTokenHash: '3'.repeat(64),
        tokenFamilyId: randomUUID(),
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        expiresAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    });
    const recentSession = await prisma.authSession.create({
      data: {
        userId: customer.id,
        refreshTokenHash: '4'.repeat(64),
        tokenFamilyId: randomUUID(),
        createdAt: new Date('2026-08-19T00:00:00.000Z'),
        expiresAt: new Date('2026-08-20T00:00:00.000Z'),
      },
    });
    const oldToken = await prisma.authToken.create({
      data: {
        userId: customer.id,
        purpose: 'RESET_PASSWORD',
        tokenHash: '5'.repeat(64),
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        expiresAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    });
    const recentToken = await prisma.authToken.create({
      data: {
        userId: customer.id,
        purpose: 'RESET_PASSWORD',
        tokenHash: '6'.repeat(64),
        createdAt: new Date('2026-08-19T00:00:00.000Z'),
        expiresAt: new Date('2026-08-20T00:00:00.000Z'),
      },
    });

    const authService = new AuthMaintenanceService(
      new AuthMaintenanceRepository(prisma as unknown as PrismaService),
      config(),
    );
    await expect(authService.purgeExpired(NOW)).resolves.toMatchObject({
      scanned: 2,
      purged: 2,
      failed: 0,
    });
    expect(
      await prisma.authSession.findMany({
        where: { id: { in: [oldSession.id, recentSession.id] } },
        select: { id: true },
      }),
    ).toEqual([{ id: recentSession.id }]);
    expect(
      await prisma.authToken.findMany({
        where: { id: { in: [oldToken.id, recentToken.id] } },
        select: { id: true },
      }),
    ).toEqual([{ id: recentToken.id }]);
  });

  it('reports overdue review rows in deadline order without changing payment or audit state', async () => {
    const customer = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'customer@rephone.local' },
      select: { id: true },
    });
    const location = await prisma.inventoryLocation.findFirstOrThrow({
      where: { type: 'WAREHOUSE', status: 'ACTIVE' },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    const sourceCart = await prisma.cart.create({
      data: { customerId: customer.id, status: 'CONVERTED' },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: 'RPH-20260825-JOBTEST1',
        sourceCartId: sourceCart.id,
        customerId: customer.id,
        customerName: 'Maintenance Test',
        customerEmail: 'maintenance@example.com',
        customerPhone: '0900000000',
        fulfillmentType: 'SHIPPING',
        fulfillmentStatus: 'PENDING',
        fulfillmentLocationId: location.id,
        shippingAddressSnapshot: {
          receiverName: 'Maintenance Test',
          phone: '0900000000',
          addressLine: '1 Test Street',
          ward: 'Ward 1',
          district: 'District 1',
          province: 'Ho Chi Minh City',
        },
        status: 'PLACED',
        paymentStatus: 'UNPAID',
        subtotal: '1000000',
        grandTotal: '1000000',
        depositRequired: '500000',
        balanceDue: '1000000',
      },
    });
    const overdue = paymentData(order.id, new Date('2026-08-25T09:00:00.000Z'));
    const dueAtBoundary = paymentData(order.id, new Date('2026-08-25T11:00:00.000Z'));
    const stillWithinSla = paymentData(order.id, new Date('2026-08-25T11:30:00.000Z'));
    await prisma.payment.createMany({ data: [overdue, dueAtBoundary, stillWithinSla] });

    const repository = new PaymentOperationsRepository(prisma as unknown as PrismaService);
    await expect(repository.findOverdueReviewCandidates(NOW, 100)).resolves.toEqual([
      { id: overdue.id, orderId: order.id, reviewDueAt: new Date('2026-08-25T10:00:00.000Z') },
      {
        id: dueAtBoundary.id,
        orderId: order.id,
        reviewDueAt: new Date('2026-08-25T12:00:00.000Z'),
      },
    ]);

    const auditCount = await prisma.auditLog.count();
    const reporter = new OverduePaymentReviewReporter(repository, config(), { now: () => NOW });
    await expect(reporter.report()).resolves.toMatchObject({
      scanned: 2,
      reported: 2,
      failed: 0,
    });
    expect(await prisma.auditLog.count()).toBe(auditCount);
    expect(
      await prisma.payment.findMany({
        where: { id: { in: [overdue.id, dueAtBoundary.id, stillWithinSla.id] } },
        select: { status: true },
      }),
    ).toEqual([{ status: 'UNDER_REVIEW' }, { status: 'UNDER_REVIEW' }, { status: 'UNDER_REVIEW' }]);
  });
});

function paymentData(orderId: string, submittedAt: Date) {
  const id = randomUUID();
  return {
    id,
    orderId,
    purpose: 'DEPOSIT' as const,
    method: 'BANK_TRANSFER' as const,
    expectedAmount: '500000',
    status: 'UNDER_REVIEW' as const,
    transferContent: 'RPH20260825JOBTEST1',
    bankNameSnapshot: 'Test Bank',
    bankAccountNumberSnapshot: '123456789',
    bankAccountHolderSnapshot: 'REPHONE TEST',
    reviewWindowMinutesSnapshot: 60,
    evidenceBucket: 'private-test',
    evidenceObjectPath: `payments/${id}/proof.png`,
    customerDeclaredAt: submittedAt,
    submittedAt,
    expiresAt: new Date('2026-08-25T10:00:00.000Z'),
  };
}

function config(): AppConfig {
  return {
    scheduler: {
      enabled: false,
      batchSize: 100,
      guestCartBatchSize: 200,
      authCleanupBatchSize: 500,
    },
  } as AppConfig;
}
