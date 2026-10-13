import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

describe('Operations overview HTTP contract', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: Server;

  beforeAll(async () => {
    setTestEnvironment();
    const { createApplication } = await import('../../src/application.js');
    app = await createApplication({ enableSwagger: false });
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = createTestPrisma();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('returns a financial month with admin-only costs, validates dates and protects access', async () => {
    const endpoint = '/api/v1/backoffice/overview/financial';
    expectNoStore(await request(server).get(endpoint).expect(401));
    const customer = await login(server, 'customer@rephone.local', 'CustomerDemo123');
    await request(server).get(endpoint).set(bearer(customer)).expect(403);
    const employee = await login(server, 'employee@rephone.local', 'EmployeeDemo123');
    const admin = await login(server, 'admin@rephone.local', 'AdminDemo123');
    const report = await request(server)
      .get(endpoint)
      .query({ month: '2026-10' })
      .set(bearer(employee))
      .expect(200);
    expectNoStore(report);
    expect(successRecord(report)['month']).toBe('2026-10');
    expect(successRecord(report)['daily']).toHaveLength(31);
    expect(successRecord(report)).not.toHaveProperty('costs');
    const privileged = await request(server)
      .get(endpoint)
      .query({ month: '2026-10' })
      .set(bearer(admin))
      .expect(200);
    const costs = successRecord(privileged)['costs'];
    if (!isRecord(costs)) throw new Error('Expected admin costs');
    expect(typeof costs['stockCapitalKnown']).toBe('string');
    expect(typeof costs['stockCostMissing']).toBe('number');
    for (const month of ['2026-00', '2026-13', '2026-1', '2026-10 OR 1=1'])
      await request(server).get(endpoint).query({ month }).set(bearer(admin)).expect(400);
  });

  it('counts a multi-item completed order once and uses Vietnam dates and missing-cost safeguards', async () => {
    const units = await prisma.inventoryUnit.findMany({
      where: { lifecycleStatus: 'AVAILABLE' },
      include: { variant: { include: { product: true } } },
      take: 2,
      orderBy: { inventoryCode: 'asc' },
    });
    expect(units).toHaveLength(2);
    const first = units[0];
    if (first === undefined) throw new Error('Expected two fixture units');
    for (const unit of units)
      await prisma.inventoryUnit.update({
        where: { id: unit.id },
        data: { acquisitionCost: '2000000', additionalCost: '100000' },
      });
    const completeAt = new Date('2026-09-30T17:00:00Z');
    const cart = await prisma.cart.create({
      data: { guestTokenHash: 'c'.repeat(64), expiresAt: new Date('2026-11-02T00:00:00Z') },
    });
    const order = await prisma.order.create({
      data: {
        sourceCartId: cart.id,
        orderNumber: 'FINANCE-MULTI',
        guestAccessTokenHash: 'c'.repeat(64),
        customerName: 'Finance fixture',
        customerEmail: 'finance@example.test',
        customerPhone: '0900000000',
        fulfillmentType: 'PICKUP',
        fulfillmentLocationId: first.locationId,
        pickupLocationId: first.locationId,
        status: 'COMPLETED',
        fulfillmentStatus: 'COMPLETED',
        paymentStatus: 'PARTIALLY_REFUNDED',
        placedAt: new Date('2026-09-30T10:00:00Z'),
        confirmedAt: new Date('2026-09-30T11:00:00Z'),
        pickupReadyAt: new Date('2026-09-30T12:00:00Z'),
        pickupHoldUntil: new Date('2026-10-01T10:00:00Z'),
        pickedUpAt: completeAt,
        completedAt: completeAt,
        subtotal: '10000000',
        grandTotal: '10000000',
        paidAmount: '10000000',
        balanceDue: '0',
        refundedAmount: '1000000',
        items: {
          create: units.map((unit) => ({
            productId: unit.variant.productId,
            variantId: unit.variantId,
            inventoryUnitId: unit.id,
            productTypeSnapshot: 'IPHONE',
            productNameSnapshot: unit.variant.product.name,
            variantNameSnapshot: unit.variant.displayName,
            skuSnapshot: unit.variant.sku,
            inventoryCodeSnapshot: unit.inventoryCode,
            quantity: 1,
            unitPrice: '5000000',
            lineSubtotal: '5000000',
            lineTotal: '5000000',
            warrantyDaysSnapshot: 90,
            warrantyTermsSnapshot: 'Bảo hành kiểm thử tài chính.',
          })),
        },
      },
    });
    const admin = await login(server, 'admin@rephone.local', 'AdminDemo123');
    const getReport = async (month: string) =>
      successRecord(
        await request(server)
          .get('/api/v1/backoffice/overview/financial')
          .query({ month })
          .set(bearer(admin))
          .expect(200),
      );
    const report = await getReport('2026-10');
    expect(report['sales']).toMatchObject({
      orderCount: 1,
      unitsSold: 2,
      grossRevenue: '10000000',
      refunds: '1000000',
      netRevenue: '9000000',
    });
    expect(report['costs']).toMatchObject({
      knownCost: '4200000',
      missingCostItems: 0,
      estimatedGrossProfit: '4800000',
    });
    expect((report['daily'] as unknown[])[0]).toMatchObject({ date: '2026-10-01', orderCount: 1 });
    expect((await getReport('2026-09'))['sales']).toMatchObject({ orderCount: 0 });
    await prisma.inventoryUnit.update({ where: { id: first.id }, data: { acquisitionCost: null } });
    expect((await getReport('2026-10'))['costs']).toMatchObject({
      missingCostItems: 1,
      estimatedGrossProfit: null,
    });
    await prisma.order.update({
      where: { id: order.id },
      data: {
        pickedUpAt: new Date('2026-10-31T17:00:00Z'),
        completedAt: new Date('2026-10-31T17:00:00Z'),
        pickupHoldUntil: new Date('2026-11-01T10:00:00Z'),
      },
    });
    expect((await getReport('2026-10'))['sales']).toMatchObject({ orderCount: 0 });
    expect((await getReport('2026-11'))['sales']).toMatchObject({ orderCount: 1 });
  });

  it('returns one no-store aggregate snapshot to employees and admins', async () => {
    const [employee, admin] = await Promise.all([
      login(server, 'employee@rephone.local', 'EmployeeDemo123'),
      login(server, 'admin@rephone.local', 'AdminDemo123'),
    ]);
    const expectedActiveOrders = await prisma.order.count({
      where: { status: { in: ['PLACED', 'CONFIRMED', 'PROCESSING'] } },
    });

    for (const token of [employee, admin]) {
      const response = await request(server)
        .get('/api/v1/backoffice/overview')
        .set(bearer(token))
        .expect(200);

      expectNoStore(response);
      const overview = successRecord(response);
      expect(overview['generatedAt']).toEqual(expect.any(String));
      expect(overview['metrics']).toMatchObject({ activeOrders: expectedActiveOrders });
      expect(Array.isArray(overview['priorities'])).toBe(true);
      expect(Array.isArray(overview['recentOrders'])).toBe(true);
      expect((overview['recentOrders'] as unknown[]).length).toBeLessThanOrEqual(5);
      expect(JSON.stringify(overview['recentOrders'])).not.toMatch(/customerEmail|customerPhone/i);
    }
  });

  it('rejects anonymous and customer access without exposing a snapshot', async () => {
    expectNoStore(await request(server).get('/api/v1/backoffice/overview').expect(401));
    const customer = await login(server, 'customer@rephone.local', 'CustomerDemo123');
    expectNoStore(
      await request(server).get('/api/v1/backoffice/overview').set(bearer(customer)).expect(403),
    );
  });
});

async function login(server: Server, email: string, password: string): Promise<string> {
  const response = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return String(successRecord(response)['accessToken']);
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function expectNoStore(response: Response): void {
  expect(response.headers['cache-control']).toBe('no-store');
}

function successRecord(response: Response): Record<string, unknown> {
  const body = response.body as unknown;
  if (!isRecord(body) || !isRecord(body['data'])) throw new Error('Expected success envelope');
  return body['data'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
