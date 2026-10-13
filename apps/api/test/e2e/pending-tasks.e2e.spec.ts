import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { PendingTasksDto } from '../../src/modules/operations-overview/pending-tasks.dto.js';
import { AffiliateRuntime } from '../../src/modules/affiliate-core/affiliate-runtime.service.js';
import { DealerRuntime } from '../../src/modules/dealers/dealer-runtime.service.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

const endpoint = '/api/v1/backoffice/overview/pending-tasks';
type TaskCounts = Pick<PendingTasksDto['counts'], keyof PendingTasksDto['counts']>;

describe('Backoffice pending task counts', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: Server;
  beforeAll(async () => {
    setTestEnvironment();
    Object.assign(process.env, {
      DEALER_ENABLED: 'true',
      DEALER_ENVIRONMENT: 'TEST',
      AFFILIATE_ENABLED: 'true',
      AFFILIATE_ENVIRONMENT: 'TEST',
    });
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

  async function login(role: 'admin' | 'employee' | 'customer') {
    const password = {
      admin: 'AdminDemo123',
      employee: 'EmployeeDemo123',
      customer: 'CustomerDemo123',
    }[role];
    const response = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: `${role}@rephone.local`, password })
      .expect(200);
    return (response.body as { data: { accessToken: string } }).data.accessToken;
  }
  async function read(token: string) {
    const response = await request(server)
      .get(endpoint)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    return (response.body as { data: { counts: TaskCounts } }).data.counts;
  }

  it('rejects anonymous and customer access', async () => {
    const anonymous = await request(server).get(endpoint).expect(401);
    expect(anonymous.headers['cache-control']).toBe('no-store');
    const customer = await login('customer');
    await request(server).get(endpoint).auth(customer, { type: 'bearer' }).expect(403);
  });

  it('counts pending records once and decreases counts after their state changes', async () => {
    const token = await login('employee');
    const baseline = await read(token);
    const first = await createOrder(prisma);
    const second = await createOrder(prisma);
    const admin = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'admin@rephone.local' },
    });
    const payment = await prisma.payment.create({
      data: {
        orderId: first.id,
        method: 'OTHER',
        purpose: 'FULL_PAYMENT',
        status: 'UNDER_REVIEW',
        submittedAt: new Date(),
        expectedAmount: '1000000',
      },
    });
    const refund = await prisma.refund.create({
      data: {
        orderId: first.id,
        amount: '100000',
        method: 'CASH',
        reason: 'Pending task count fixture',
        requestedByType: 'SYSTEM',
        status: 'REQUESTED',
      },
    });
    const orderItem = first.items[0];
    if (orderItem === undefined) throw new Error('Expected the fixture order item');
    const caseRecord = await prisma.afterSalesRequest.create({
      data: {
        orderItemId: orderItem.id,
        requestNumber: 'RPH-AS-20261013-ABCDEF',
        type: 'RETURN',
        issueDescription: 'Pending support task fixture',
      },
    });
    const unit = await prisma.inventoryUnit.findFirstOrThrow({
      where: { lifecycleStatus: 'AVAILABLE' },
    });
    await prisma.inventoryUnit.update({
      where: { id: unit.id },
      data: { lifecycleStatus: 'RECEIVED' },
    });
    expect(await read(token)).toEqual({
      ...baseline,
      orders: baseline.orders + 2,
      payments: baseline.payments + 1,
      refunds: baseline.refunds + 1,
      afterSales: baseline.afterSales + 1,
      inventory: baseline.inventory + 1,
    });

    await prisma.order.update({
      where: { id: first.id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
    await prisma.order.update({
      where: { id: second.id },
      data: {
        status: 'CANCELLED',
        fulfillmentStatus: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: 'Count test cancellation',
      },
    });
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'VERIFIED',
        reviewedAt: new Date(),
        reviewedById: admin.id,
        receivedAmount: '1000000',
      },
    });
    await prisma.refund.update({
      where: { id: refund.id },
      data: {
        status: 'PROCESSING',
        processedById: admin.id,
        processingAt: new Date(),
      },
    });
    await prisma.afterSalesRequest.update({
      where: { id: caseRecord.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: 'Count test cancellation',
      },
    });
    // Processing refunds stay visible until they are complete; confirmed/cancelled orders do not.
    expect(await read(token)).toEqual({
      ...baseline,
      refunds: baseline.refunds + 1,
      inventory: baseline.inventory + 1,
    });
    await prisma.refund.update({
      where: { id: refund.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        note: 'Cash refund completed for count test',
      },
    });
    await prisma.inventoryUnit.update({
      where: { id: unit.id },
      data: { lifecycleStatus: 'AVAILABLE' },
    });
    expect(await read(token)).toEqual(baseline);
  });

  it('limits partner tasks to the permitted role and skips unavailable partner services', async () => {
    const customer = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'customer@rephone.local' },
    });
    const dealer = await prisma.dealerProfile.create({
      data: {
        ownerUserId: customer.id,
        displayName: 'Count fixture dealer',
        legalName: 'Count fixture dealer',
        businessType: 'INDIVIDUAL',
        representativeName: 'Count fixture',
        businessAddress: '123 Test Street',
        contactEmail: customer.email,
        contactPhone: '0900000000',
        termsVersion: 'dealer-v1.0',
        termsAcceptedAt: new Date(),
      },
    });
    const affiliate = await prisma.affiliateProfile.create({
      data: {
        ownerUserId: customer.id,
        displayName: 'Count fixture affiliate',
        code: 'COUNTFIXTURE',
        phone: '0900000000',
        promotionChannels: 'Website for test fixtures',
        termsVersion: 'affiliate-v1.0',
        termsAcceptedAt: new Date(),
      },
    });
    const admin = await login('admin');
    const employee = await login('employee');
    expect(await read(admin)).toMatchObject({ dealers: 1, affiliates: 1 });
    const staffCounts = await read(employee);
    expect(staffCounts.dealers).toBe(0);
    expect(staffCounts).not.toHaveProperty('affiliates');

    const dealerRuntime = app.get(DealerRuntime);
    const affiliateRuntime = app.get(AffiliateRuntime);
    Object.defineProperty(dealerRuntime, 'enabled', { value: false, configurable: true });
    Object.defineProperty(affiliateRuntime, 'enabled', { value: false, configurable: true });
    try {
      expect(await read(admin)).toMatchObject({ dealers: 0, affiliates: 0 });
    } finally {
      Object.defineProperty(dealerRuntime, 'enabled', { value: true });
      Object.defineProperty(affiliateRuntime, 'enabled', { value: true });
    }
    await prisma.dealerProfile.update({
      where: { id: dealer.id },
      data: { businessStatus: 'REJECTED' },
    });
    await prisma.affiliateProfile.update({
      where: { id: affiliate.id },
      data: { status: 'REJECTED' },
    });
    expect(await read(admin)).toMatchObject({ dealers: 0, affiliates: 0 });
  });
});

async function createOrder(prisma: PrismaClient) {
  const unit = await prisma.inventoryUnit.findFirstOrThrow({
    where: { lifecycleStatus: 'AVAILABLE' },
    include: { variant: { include: { product: true } } },
  });
  const customer = await prisma.user.findUniqueOrThrow({
    where: { normalizedEmail: 'customer@rephone.local' },
  });
  const cart = await prisma.cart.create({ data: { customerId: customer.id, status: 'CONVERTED' } });
  return prisma.order.create({
    data: {
      orderNumber: `PENDING-${randomUUID()}`,
      sourceCartId: cart.id,
      customerId: customer.id,
      customerName: customer.fullName,
      customerEmail: customer.email,
      customerPhone: '0900000000',
      fulfillmentType: 'PICKUP',
      fulfillmentLocationId: unit.locationId,
      pickupLocationId: unit.locationId,
      placedAt: new Date(Date.now() - 60_000),
      pickupHoldUntil: new Date(Date.now() + 86_400_000),
      subtotal: '1000000',
      grandTotal: '1000000',
      balanceDue: '0',
      paidAmount: '1000000',
      paymentStatus: 'PAID',
      items: {
        create: {
          productId: unit.variant.productId,
          variantId: unit.variantId,
          inventoryUnitId: unit.id,
          productTypeSnapshot: 'IPHONE',
          productNameSnapshot: unit.variant.product.name,
          variantNameSnapshot: unit.variant.displayName,
          skuSnapshot: unit.variant.sku,
          inventoryCodeSnapshot: unit.inventoryCode,
          quantity: 1,
          unitPrice: '1000000',
          lineSubtotal: '1000000',
          lineTotal: '1000000',
          warrantyDaysSnapshot: 90,
          warrantyTermsSnapshot: 'Pending count fixture warranty',
        },
      },
    },
    include: { items: true },
  });
}
