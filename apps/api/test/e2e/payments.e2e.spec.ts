import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import { InMemoryStorageProvider } from '../../src/common/providers/in-memory-storage.provider.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { AuthRateLimiter } from '../../src/modules/auth/auth-rate-limiter.service.js';
import { PaymentLifecycleNotificationService } from '../../src/modules/notifications/payment-lifecycle-notification.service.js';
import { DepositExpiryService } from '../../src/modules/payment-operations/deposit-expiry.service.js';
import { PaymentOperationsRepository } from '../../src/modules/payment-operations/payment-operations.repository.js';
import { PaymentRateLimiter } from '../../src/modules/payment-operations/payment-rate-limiter.service.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

const JSON_MUTATION_HEADERS = {
  Origin: 'http://localhost:3001',
  'X-Rephone-CSRF': '1',
  'Content-Type': 'application/json',
};
const PROOF = readFileSync(
  new URL('../../prisma/demo-assets/catalog/iphone-13.png', import.meta.url),
);

describe('Slice 07 payment proof and review HTTP contract', () => {
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
    app.get(AuthRateLimiter).clear();
    app.get(PaymentRateLimiter).clear();
    app.get(InMemoryStorageProvider).clear();
    await resetTestDatabase(prisma);
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('sets no-store before payment guards and upload interceptors run', async () => {
    const missingId = '0198e4f0-7d16-4c1a-a2bd-39bc2a0f6997';
    const proofGuardFailure = await request(server)
      .post(`/api/v1/payments/${missingId}/submit-proof`)
      .set('Origin', 'http://localhost:3001')
      .set('X-Rephone-CSRF', '1')
      .field('unused', 'value')
      .expect(404);
    expect(proofGuardFailure.headers['cache-control']).toBe('no-store');

    const backofficeGuardFailures = await Promise.all([
      request(server).get('/api/v1/backoffice/payments').expect(401),
      request(server).get(`/api/v1/backoffice/payments/${missingId}`).expect(401),
      request(server).get(`/api/v1/backoffice/payments/${missingId}/evidence-url`).expect(401),
      request(server)
        .post(`/api/v1/backoffice/payments/${missingId}/verify`)
        .send({ receivedAmount: '500000' })
        .expect(401),
      request(server)
        .post(`/api/v1/backoffice/payments/${missingId}/reject`)
        .send({ reason: 'Không xác minh được giao dịch này' })
        .expect(401),
    ]);
    for (const response of backofficeGuardFailures) {
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submits, queues, signs and verifies customer evidence without leaking private location', async () => {
    const checkout = await createCustomerShippingOrder(server, prisma);
    const submitted = await request(server)
      .post(`/api/v1/payments/${checkout.paymentId}/submit-proof`)
      .set('Authorization', `Bearer ${checkout.customerToken}`)
      .attach('file', PROOF, { filename: 'deposit.png', contentType: 'image/png' })
      .expect(200);
    expect(submitted.headers['cache-control']).toBe('no-store');
    expect(data(submitted.body)).toMatchObject({
      id: checkout.paymentId,
      orderNumber: checkout.orderNumber,
      status: 'UNDER_REVIEW',
    });
    expect(JSON.stringify(submitted.body)).not.toMatch(
      /evidenceBucket|evidenceObjectPath|private-test/,
    );

    const persistedProof = await prisma.payment.findUniqueOrThrow({
      where: { id: checkout.paymentId },
    });
    expect(persistedProof.evidenceBucket).toBe('private-test');
    expect(persistedProof.evidenceObjectPath).toMatch(
      new RegExp(`^payments/${checkout.paymentId}/[0-9a-f-]+\\.png$`),
    );
    expect(persistedProof.status).toBe('UNDER_REVIEW');
    const submissionAudit = await prisma.auditLog.findFirstOrThrow({
      where: { resourceId: checkout.paymentId, action: 'payment.proof_submitted' },
    });
    expect(JSON.stringify(submissionAudit)).not.toContain(persistedProof.evidenceObjectPath);
    expect(
      await prisma.inventoryReservation.findFirstOrThrow({
        where: { orderId: checkout.orderId, status: 'ACTIVE' },
      }),
    ).toMatchObject({ holdReason: 'REVIEW', expiresAt: null });

    await request(server)
      .post(`/api/v1/orders/${checkout.orderNumber}/cancel`)
      .set('Authorization', `Bearer ${checkout.customerToken}`)
      .send({ reason: 'Tôi muốn hủy trong lúc review' })
      .expect(409);

    const employee = await login(server, 'employee@rephone.local', 'EmployeeDemo123');
    const queue = await request(server)
      .get('/api/v1/backoffice/payments')
      .set('Authorization', `Bearer ${employee}`)
      .expect(200);
    expect(arrayProperty(queue.body, 'data')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: checkout.paymentId, status: 'UNDER_REVIEW' }),
      ]),
    );
    const detail = await request(server)
      .get(`/api/v1/backoffice/payments/${checkout.paymentId}`)
      .set('Authorization', `Bearer ${employee}`)
      .expect(200);
    expect(data(detail.body)).toMatchObject({ evidenceAvailable: true });
    expect(JSON.stringify(detail.body)).not.toMatch(
      /evidenceBucket|evidenceObjectPath|private-test/,
    );

    const evidence = await request(server)
      .get(`/api/v1/backoffice/payments/${checkout.paymentId}/evidence-url`)
      .set('Authorization', `Bearer ${employee}`)
      .expect(200);
    expect(stringProperty(data(evidence.body), 'url')).toMatch(/^https:\/\/storage\.test\//);
    expect(
      await prisma.auditLog.count({
        where: { resourceId: checkout.paymentId, action: 'payment.evidence_viewed' },
      }),
    ).toBe(1);

    await request(server)
      .post(`/api/v1/backoffice/payments/${checkout.paymentId}/verify`)
      .set('Authorization', `Bearer ${employee}`)
      .send({ receivedAmount: (BigInt(checkout.expectedAmount) - 1n).toString() })
      .expect(422);
    await request(server)
      .post(`/api/v1/backoffice/payments/${checkout.paymentId}/verify`)
      .set('Authorization', `Bearer ${employee}`)
      .send({ receivedAmount: (BigInt(checkout.expectedAmount) + 1n).toString() })
      .expect(400);
    const verified = await request(server)
      .post(`/api/v1/backoffice/payments/${checkout.paymentId}/verify`)
      .set('Authorization', `Bearer ${employee}`)
      .send({ receivedAmount: checkout.expectedAmount })
      .expect(200);
    expect(data(verified.body)).toMatchObject({
      payment: { status: 'VERIFIED', receivedAmount: checkout.expectedAmount },
      order: { status: 'CONFIRMED', paidAmount: checkout.expectedAmount },
      notificationDelivery: 'SENT',
    });
    expect(
      await prisma.inventoryReservation.findFirstOrThrow({
        where: { orderId: checkout.orderId, status: 'ACTIVE' },
      }),
    ).toMatchObject({ holdReason: 'FULFILLMENT', expiresAt: null });

    const replay = await request(server)
      .post(`/api/v1/backoffice/payments/${checkout.paymentId}/verify`)
      .set('Authorization', `Bearer ${employee}`)
      .send({ receivedAmount: checkout.expectedAmount })
      .expect(200);
    expect(data(replay.body)).toMatchObject({ notificationDelivery: 'SKIPPED_REPLAY' });
    await request(server)
      .post(`/api/v1/backoffice/payments/${checkout.paymentId}/verify`)
      .set('Authorization', `Bearer ${employee}`)
      .send({
        receivedAmount: (BigInt(checkout.expectedAmount) + 1n).toString(),
        note: 'Khác lần đầu',
      })
      .expect(409);
    expect(
      await prisma.auditLog.count({
        where: { resourceId: checkout.paymentId, action: 'payment.verified' },
      }),
    ).toBe(1);
  });

  it('enforces guest credential precedence, multipart CSRF and evidence validation', async () => {
    const checkout = await createGuestShippingOrder(server, prisma);
    const storage = app.get(InMemoryStorageProvider);
    await checkout.agent
      .post(`/api/v1/payments/${checkout.paymentId}/submit-proof`)
      .set('X-Guest-Order-Token', 'B'.repeat(43))
      .send({})
      .expect(404);
    await checkout.agent
      .post(`/api/v1/payments/${checkout.paymentId}/submit-proof`)
      .send({})
      .expect(403);
    expect(storage.objectCount()).toBe(0);
    await checkout.agent
      .post(`/api/v1/payments/${checkout.paymentId}/submit-proof`)
      .set('Origin', 'http://localhost:3001')
      .set('X-Rephone-CSRF', '1')
      .attach('file', Buffer.from('not an image'), {
        filename: 'fake.png',
        contentType: 'image/png',
      })
      .expect(415);
    storage.setBeforeUpload(() => Promise.reject(new Error('storage unavailable')));
    await checkout.agent
      .post(`/api/v1/payments/${checkout.paymentId}/submit-proof`)
      .set('X-Guest-Order-Token', checkout.guestOrderToken)
      .attach('file', PROOF, { filename: 'deposit.png', contentType: 'image/png' })
      .expect(503);
    expect(
      await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } }),
    ).toMatchObject({
      status: 'AWAITING_PROOF',
      evidenceBucket: null,
      evidenceObjectPath: null,
    });
    storage.clear();
    const tooLarge = await checkout.agent
      .post(`/api/v1/payments/${checkout.paymentId}/submit-proof`)
      .set('X-Guest-Order-Token', checkout.guestOrderToken)
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1, 0x41), {
        filename: 'too-large.png',
        contentType: 'image/png',
      })
      .expect(413);
    expect(tooLarge.headers['cache-control']).toBe('no-store');
    const submitted = await checkout.agent
      .post(`/api/v1/payments/${checkout.paymentId}/submit-proof`)
      .set('X-Guest-Order-Token', checkout.guestOrderToken)
      .attach('file', PROOF, { filename: 'deposit.png', contentType: 'image/png' })
      .expect(200);
    expect(data(submitted.body)).toMatchObject({ status: 'UNDER_REVIEW' });

    const customer = await login(server, 'customer@rephone.local', 'CustomerDemo123');
    await request(server)
      .get('/api/v1/backoffice/payments')
      .set('Authorization', `Bearer ${customer}`)
      .expect(403);
  });

  it('returns a sequential no-file replay without another object, audit or email', async () => {
    const checkout = await createCustomerShippingOrder(server, prisma);
    const storage = app.get(InMemoryStorageProvider);
    const notification = vi.spyOn(
      app.get(PaymentLifecycleNotificationService),
      'sendProofSubmitted',
    );

    await request(server)
      .post(`/api/v1/payments/${checkout.paymentId}/submit-proof`)
      .set('Authorization', `Bearer ${checkout.customerToken}`)
      .attach('file', PROOF, { filename: 'deposit.png', contentType: 'image/png' })
      .expect(200);
    const replay = await request(server)
      .post(`/api/v1/payments/${checkout.paymentId}/submit-proof`)
      .set('Authorization', `Bearer ${checkout.customerToken}`)
      .send({})
      .expect(200);
    expect(data(replay.body)).toMatchObject({
      id: checkout.paymentId,
      status: 'UNDER_REVIEW',
    });

    const admin = await login(server, 'admin@rephone.local', 'AdminDemo123');
    await request(server)
      .post(`/api/v1/payments/${checkout.paymentId}/submit-proof`)
      .set('Authorization', `Bearer ${admin}`)
      .send({})
      .expect(403);
    expect(storage.objectCount()).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { resourceId: checkout.paymentId, action: 'payment.proof_submitted' },
      }),
    ).toBe(1);
    expect(notification).toHaveBeenCalledOnce();
    expect(notification.mock.calls[0]?.[0].reviewSlaDueAt).toBeInstanceOf(Date);
  });

  it('keeps a successful submit when the post-commit notification throws', async () => {
    const checkout = await createCustomerShippingOrder(server, prisma);
    const storage = app.get(InMemoryStorageProvider);
    const deleteObject = vi.spyOn(storage, 'delete');
    const notification = vi
      .spyOn(app.get(PaymentLifecycleNotificationService), 'sendProofSubmitted')
      .mockRejectedValueOnce(new Error('post-commit notification failure'));

    const submitted = await request(server)
      .post(`/api/v1/payments/${checkout.paymentId}/submit-proof`)
      .set('Authorization', `Bearer ${checkout.customerToken}`)
      .attach('file', PROOF, { filename: 'deposit.png', contentType: 'image/png' })
      .expect(200);
    expect(data(submitted.body)).toMatchObject({
      id: checkout.paymentId,
      status: 'UNDER_REVIEW',
    });
    const committed = await prisma.payment.findUniqueOrThrow({
      where: { id: checkout.paymentId },
    });
    expect(committed).toMatchObject({ status: 'UNDER_REVIEW', evidenceBucket: 'private-test' });
    expect(committed.evidenceObjectPath).not.toBeNull();
    expect(storage.objectCount()).toBe(1);
    expect(deleteObject).not.toHaveBeenCalled();
    expect(
      await prisma.auditLog.count({
        where: { resourceId: checkout.paymentId, action: 'payment.proof_submitted' },
      }),
    ).toBe(1);

    await request(server)
      .post(`/api/v1/payments/${checkout.paymentId}/submit-proof`)
      .set('Authorization', `Bearer ${checkout.customerToken}`)
      .send({})
      .expect(200);
    expect(storage.objectCount()).toBe(1);
    expect(deleteObject).not.toHaveBeenCalled();
    expect(notification).toHaveBeenCalledOnce();
  });

  it('runs rate-limit and CSRF guards before payment database access', async () => {
    const checkout = await createGuestShippingOrder(server, prisma);
    const payments = app.get(PaymentOperationsRepository);
    const findPayment = vi.spyOn(payments, 'findById');

    await checkout.agent
      .post(`/api/v1/payments/${checkout.paymentId}/submit-proof`)
      .send({})
      .expect(403);
    expect(findPayment).not.toHaveBeenCalled();

    app.get(PaymentRateLimiter).clear();
    findPayment.mockClear();
    for (let requestIndex = 0; requestIndex < 10; requestIndex += 1) {
      await checkout.agent
        .post(`/api/v1/payments/${checkout.paymentId}/submit-proof`)
        .set('X-Guest-Order-Token', 'B'.repeat(43))
        .send({})
        .expect(404);
    }
    await checkout.agent
      .post(`/api/v1/payments/${checkout.paymentId}/submit-proof`)
      .set('X-Guest-Order-Token', 'B'.repeat(43))
      .send({})
      .expect(429);
    expect(findPayment).toHaveBeenCalledTimes(10);
  });

  it('allows exactly one verify or reject terminal transition under concurrency', async () => {
    const checkout = await createCustomerShippingOrder(server, prisma);
    await request(server)
      .post(`/api/v1/payments/${checkout.paymentId}/submit-proof`)
      .set('Authorization', `Bearer ${checkout.customerToken}`)
      .attach('file', PROOF, { filename: 'deposit.png', contentType: 'image/png' })
      .expect(200);
    const employee = await login(server, 'employee@rephone.local', 'EmployeeDemo123');
    const admin = await login(server, 'admin@rephone.local', 'AdminDemo123');
    const barrier = new Barrier(2);
    const [verifyResponse, rejectResponse] = await Promise.all([
      (async () => {
        await barrier.arrive();
        return request(server)
          .post(`/api/v1/backoffice/payments/${checkout.paymentId}/verify`)
          .set('Authorization', `Bearer ${employee}`)
          .send({ receivedAmount: checkout.expectedAmount });
      })(),
      (async () => {
        await barrier.arrive();
        return request(server)
          .post(`/api/v1/backoffice/payments/${checkout.paymentId}/reject`)
          .set('Authorization', `Bearer ${admin}`)
          .send({ reason: 'Không xác minh được giao dịch này' });
      })(),
    ]);
    expect([verifyResponse.status, rejectResponse.status].sort()).toEqual([200, 409]);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } });
    expect(['VERIFIED', 'REJECTED']).toContain(payment.status);
    expect(
      await prisma.auditLog.count({
        where: {
          resourceId: checkout.paymentId,
          action: { in: ['payment.verified', 'payment.rejected'] },
        },
      }),
    ).toBe(1);
    const activeReservations = await prisma.inventoryReservation.count({
      where: { orderId: checkout.orderId, status: 'ACTIVE' },
    });
    expect(activeReservations).toBe(payment.status === 'VERIFIED' ? 1 : 0);
  });

  it('attaches one object and writes one audit for two concurrent proof submissions', async () => {
    const checkout = await createCustomerShippingOrder(server, prisma);
    const storage = app.get(InMemoryStorageProvider);
    const barrier = new Barrier(2);
    storage.setBeforeUpload(() => barrier.arrive());
    const responses = await Promise.all(
      [0, 1].map(() =>
        request(server)
          .post(`/api/v1/payments/${checkout.paymentId}/submit-proof`)
          .set('Authorization', `Bearer ${checkout.customerToken}`)
          .attach('file', PROOF, { filename: 'deposit.png', contentType: 'image/png' }),
      ),
    );
    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(storage.objectCount()).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { resourceId: checkout.paymentId, action: 'payment.proof_submitted' },
      }),
    ).toBe(1);
    expect(
      await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } }),
    ).toMatchObject({
      status: 'UNDER_REVIEW',
    });
  });

  it('lets cancellation win safely after submit authorization but before attachment', async () => {
    const checkout = await createCustomerShippingOrder(server, prisma);
    const storage = app.get(InMemoryStorageProvider);
    const latch = new Latch();
    storage.setBeforeUpload(() => latch.block());
    const submission = request(server)
      .post(`/api/v1/payments/${checkout.paymentId}/submit-proof`)
      .set('Authorization', `Bearer ${checkout.customerToken}`)
      .attach('file', PROOF, { filename: 'deposit.png', contentType: 'image/png' })
      .then((response) => response);
    await latch.waitUntilBlocked();
    await request(server)
      .post(`/api/v1/orders/${checkout.orderNumber}/cancel`)
      .set('Authorization', `Bearer ${checkout.customerToken}`)
      .send({ reason: 'Hủy trong lúc đang tải bằng chứng' })
      .expect(200);
    latch.release();
    expect((await submission).status).toBe(409);
    expect(storage.objectCount()).toBe(0);
    expect(
      await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } }),
    ).toMatchObject({
      status: 'CANCELLED',
      evidenceBucket: null,
      evidenceObjectPath: null,
    });
    expect(
      await prisma.inventoryReservation.findFirstOrThrow({ where: { orderId: checkout.orderId } }),
    ).toMatchObject({ status: 'RELEASED' });
  });

  it('lets expiry win safely after submit authorization and cleans the uploaded loser', async () => {
    const checkout = await createCustomerShippingOrder(server, prisma);
    const storage = app.get(InMemoryStorageProvider);
    const latch = new Latch();
    storage.setBeforeUpload(() => latch.block());
    const submission = request(server)
      .post(`/api/v1/payments/${checkout.paymentId}/submit-proof`)
      .set('Authorization', `Bearer ${checkout.customerToken}`)
      .attach('file', PROOF, { filename: 'deposit.png', contentType: 'image/png' })
      .then((response) => response);
    await latch.waitUntilBlocked();
    const future = new Date('2035-01-01T00:00:00.000Z');
    await expect(app.get(DepositExpiryService).expireDue(future)).resolves.toMatchObject({
      expired: 1,
      failed: 0,
    });
    latch.release();
    expect((await submission).status).toBe(409);
    expect(storage.objectCount()).toBe(0);
    expect(
      await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } }),
    ).toMatchObject({
      status: 'EXPIRED',
      evidenceBucket: null,
      evidenceObjectPath: null,
    });
    expect(
      await prisma.inventoryReservation.findFirstOrThrow({ where: { orderId: checkout.orderId } }),
    ).toMatchObject({ status: 'EXPIRED' });
  });

  it('expires only awaiting deposits once and releases stock and voucher counters', async () => {
    await prisma.voucher.create({
      data: {
        code: 'EXPIRYTEST',
        normalizedCode: 'EXPIRYTEST',
        name: 'Expiry test voucher',
        discountType: 'FIXED',
        discountValue: '1000',
        minimumOrderAmount: '0',
        startsAt: new Date('2026-01-01T00:00:00.000Z'),
        endsAt: new Date('2030-01-01T00:00:00.000Z'),
        totalUsageLimit: 10,
        visibility: 'PUBLIC',
        scopeType: 'ORDER',
        status: 'ACTIVE',
      },
    });
    const checkout = await createCustomerShippingOrder(server, prisma, 'EXPIRYTEST');
    const future = new Date('2035-01-01T00:00:00.000Z');
    const expiry = app.get(DepositExpiryService);
    const first = await expiry.expireDue(future);
    expect(first).toMatchObject({ expired: 1, failed: 0, skippedOverlap: false });
    expect(
      await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } }),
    ).toMatchObject({
      status: 'EXPIRED',
    });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId } })).toMatchObject(
      {
        status: 'CANCELLED',
        fulfillmentStatus: 'CANCELLED',
      },
    );
    expect(
      await prisma.inventoryReservation.findFirstOrThrow({ where: { orderId: checkout.orderId } }),
    ).toMatchObject({ status: 'EXPIRED' });
    expect(
      await prisma.voucherUsage.findUniqueOrThrow({ where: { orderId: checkout.orderId } }),
    ).toMatchObject({ status: 'RELEASED' });
    expect(
      (await prisma.stockLevel.findUniqueOrThrow({ where: { id: checkout.stockLevelId } }))
        .quantityReserved,
    ).toBe(0);
    const replay = await expiry.expireDue(future);
    expect(replay.expired).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { resourceId: checkout.paymentId, action: 'payment.expired' },
      }),
    ).toBe(1);
  });

  it('keeps the review queue p95 below 500ms at 20 concurrent readers', async () => {
    const checkout = await createCustomerShippingOrder(server, prisma);
    await request(server)
      .post(`/api/v1/payments/${checkout.paymentId}/submit-proof`)
      .set('Authorization', `Bearer ${checkout.customerToken}`)
      .attach('file', PROOF, { filename: 'deposit.png', contentType: 'image/png' })
      .expect(200);
    const employee = await login(server, 'employee@rephone.local', 'EmployeeDemo123');
    await request(server)
      .get('/api/v1/backoffice/payments')
      .set('Authorization', `Bearer ${employee}`)
      .expect(200);
    const durations = await Promise.all(
      Array.from({ length: 20 }, async () => {
        const startedAt = performance.now();
        await request(server)
          .get('/api/v1/backoffice/payments')
          .set('Authorization', `Bearer ${employee}`)
          .expect(200);
        return performance.now() - startedAt;
      }),
    );
    durations.sort((left, right) => left - right);
    expect(durations[Math.ceil(durations.length * 0.95) - 1]).toBeLessThan(500);
  });
});

interface CheckoutFixture {
  customerToken: string;
  orderId: string;
  orderNumber: string;
  paymentId: string;
  expectedAmount: string;
  stockLevelId: string;
}

async function createCustomerShippingOrder(
  server: Server,
  prisma: PrismaClient,
  voucherCode?: string,
): Promise<CheckoutFixture> {
  const customerToken = await login(server, 'customer@rephone.local', 'CustomerDemo123');
  const created = await createShippingOrder(
    request(server),
    prisma,
    { Authorization: `Bearer ${customerToken}` },
    voucherCode,
  );
  return { customerToken, ...created };
}

async function createGuestShippingOrder(server: Server, prisma: PrismaClient) {
  const agent = request.agent(server);
  const created = await createShippingOrder(agent, prisma, JSON_MUTATION_HEADERS);
  return { agent, ...created };
}

async function createShippingOrder(
  client: ReturnType<typeof request>,
  prisma: PrismaClient,
  headers: Record<string, string>,
  voucherCode?: string,
) {
  const stock = await prisma.stockLevel.findFirstOrThrow({
    where: {
      location: { type: 'WAREHOUSE', status: 'ACTIVE' },
      variant: { inventoryMode: 'QUANTITY', status: 'ACTIVE', salePrice: { not: null } },
      quantityOnHand: { gt: 0 },
    },
    select: { id: true, variantId: true },
  });
  await client
    .post('/api/v1/cart/items')
    .set(headers)
    .send({ itemType: 'ACCESSORY', variantId: stock.variantId, quantity: 1 })
    .expect(201);
  const previewResponse = await client
    .post('/api/v1/checkouts/preview')
    .set(headers)
    .send({ fulfillmentType: 'SHIPPING', ...(voucherCode === undefined ? {} : { voucherCode }) })
    .expect(200);
  const preview = data(previewResponse.body);
  const pricing = objectProperty(preview, 'pricing');
  const created = await client
    .post('/api/v1/checkouts')
    .set(headers)
    .send({
      fulfillmentType: 'SHIPPING',
      contact: { fullName: 'Khách Test', email: 'payment@example.com', phone: '0900000000' },
      shippingAddress: {
        receiverName: 'Khách Test',
        phone: '0900000000',
        addressLine: '1 Nguyễn Huệ',
        ward: 'Bến Nghé',
        district: 'Quận 1',
        province: 'TP.HCM',
      },
      ...(voucherCode === undefined ? {} : { voucherCode }),
      expectedCartUpdatedAt: stringProperty(preview, 'cartUpdatedAt'),
      expectedGrandTotal: stringProperty(pricing, 'grandTotal'),
      expectedDepositRequired: stringProperty(pricing, 'depositRequired'),
    })
    .expect(201);
  const checkout = data(created.body);
  const orderDto = objectProperty(checkout, 'order');
  const orderNumber = stringProperty(orderDto, 'orderNumber');
  const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber } });
  const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
  return {
    orderId: order.id,
    orderNumber,
    paymentId: payment.id,
    expectedAmount: payment.expectedAmount.toString(),
    stockLevelId: stock.id,
    guestOrderToken:
      typeof checkout['guestAccessToken'] === 'string' ? checkout['guestAccessToken'] : '',
  };
}

async function login(server: Server, email: string, password: string): Promise<string> {
  const response = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return stringProperty(data(response.body), 'accessToken');
}

function data(body: unknown): Record<string, unknown> {
  return objectProperty(body, 'data');
}

function objectProperty(value: unknown, key: string): Record<string, unknown> {
  const property = record(value)[key];
  if (typeof property !== 'object' || property === null || Array.isArray(property)) {
    throw new Error(`Expected ${key} to be an object`);
  }
  return property as Record<string, unknown>;
}

function arrayProperty(value: unknown, key: string): unknown[] {
  const property = record(value)[key];
  if (!Array.isArray(property)) throw new Error(`Expected ${key} to be an array`);
  return property;
}

function stringProperty(value: unknown, key: string): string {
  const property = record(value)[key];
  if (typeof property !== 'string') throw new Error(`Expected ${key} to be a string`);
  return property;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected an object');
  }
  return value as Record<string, unknown>;
}

class Barrier {
  private arrived = 0;
  private release!: () => void;
  private readonly released = new Promise<void>((resolve) => {
    this.release = resolve;
  });

  public constructor(private readonly parties: number) {}

  public async arrive(): Promise<void> {
    this.arrived += 1;
    if (this.arrived === this.parties) this.release();
    await this.released;
  }
}

class Latch {
  private signalBlocked!: () => void;
  private signalReleased!: () => void;
  private readonly blocked = new Promise<void>((resolve) => {
    this.signalBlocked = resolve;
  });
  private readonly released = new Promise<void>((resolve) => {
    this.signalReleased = resolve;
  });

  public async block(): Promise<void> {
    this.signalBlocked();
    await this.released;
  }

  public waitUntilBlocked(): Promise<void> {
    return this.blocked;
  }

  public release(): void {
    this.signalReleased();
  }
}
