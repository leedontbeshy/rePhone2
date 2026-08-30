import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import { InMemoryStorageProvider } from '../../src/common/providers/in-memory-storage.provider.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { AuthRateLimiter } from '../../src/modules/auth/auth-rate-limiter.service.js';
import { BackofficeRateLimiter } from '../../src/modules/auth/backoffice-rate-limiter.service.js';
import { OrderRateLimiter } from '../../src/modules/orders/order-rate-limiter.service.js';
import { PaymentRateLimiter } from '../../src/modules/payment-operations/payment-rate-limiter.service.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

const EVIDENCE = readFileSync(
  new URL('../../prisma/demo-assets/catalog/iphone-13.png', import.meta.url),
);
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const CASH_COMPLETION_NOTE = 'Đã hoàn tiền mặt trực tiếp cho khách hàng';
const BANK_COMPLETION_NOTE = 'Đã chuyển khoản hoàn tiền và đối soát thành công';

describe('Slice 10 cancellation and refund HTTP contract', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: Server;

  beforeAll(async () => {
    setTestEnvironment();
    const { createApplication } = await import('../../src/application.js');
    app = await createApplication({ enableSwagger: false });
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer() as Server;
    prisma = createTestPrisma();
  });

  beforeEach(async () => {
    app.get(AuthRateLimiter).clear();
    app.get(BackofficeRateLimiter).clear();
    app.get(OrderRateLimiter).clear();
    app.get(PaymentRateLimiter).clear();
    app.get(InMemoryStorageProvider).clear();
    await resetTestDatabase(prisma);
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('enforces no-store and staff RBAC on all ten Slice 10 routes', async () => {
    const routes = [
      {
        staffStatus: 404,
        call: (headers: Record<string, string>) =>
          request(server)
            .post(`/api/v1/backoffice/orders/${MISSING_ID}/cancel`)
            .set(headers)
            .send({ reason: 'Kiểm thử phân quyền hủy đơn hàng' }),
      },
      {
        staffStatus: 200,
        call: (headers: Record<string, string>) =>
          request(server).get('/api/v1/backoffice/refunds').set(headers),
      },
      {
        staffStatus: 404,
        call: (headers: Record<string, string>) =>
          request(server).get(`/api/v1/backoffice/refunds/${MISSING_ID}`).set(headers),
      },
      {
        staffStatus: 404,
        call: (headers: Record<string, string>) =>
          request(server)
            .post(`/api/v1/backoffice/orders/${MISSING_ID}/refunds`)
            .set(headers)
            .send({
              amount: '10000',
              method: 'CASH',
              reason: 'Kiểm thử phân quyền tạo hoàn tiền',
            }),
      },
      {
        staffStatus: 404,
        call: (headers: Record<string, string>) =>
          request(server)
            .post(`/api/v1/backoffice/refunds/${MISSING_ID}/start-processing`)
            .set(headers)
            .send({ note: 'Kiểm thử phân quyền bắt đầu xử lý' }),
      },
      {
        staffStatus: 404,
        call: (headers: Record<string, string>) =>
          request(server)
            .post(`/api/v1/backoffice/refunds/${MISSING_ID}/complete-bank-transfer`)
            .set(headers)
            .field('note', BANK_COMPLETION_NOTE),
      },
      {
        staffStatus: 404,
        call: (headers: Record<string, string>) =>
          request(server)
            .post(`/api/v1/backoffice/refunds/${MISSING_ID}/complete-cash`)
            .set(headers)
            .send({ note: CASH_COMPLETION_NOTE }),
      },
      {
        staffStatus: 404,
        call: (headers: Record<string, string>) =>
          request(server)
            .post(`/api/v1/backoffice/refunds/${MISSING_ID}/reject`)
            .set(headers)
            .send({ reason: 'Kiểm thử phân quyền từ chối hoàn tiền' }),
      },
      {
        staffStatus: 404,
        call: (headers: Record<string, string>) =>
          request(server)
            .post(`/api/v1/backoffice/refunds/${MISSING_ID}/cancel`)
            .set(headers)
            .send({ reason: 'Kiểm thử phân quyền hủy yêu cầu hoàn tiền' }),
      },
      {
        staffStatus: 404,
        call: (headers: Record<string, string>) =>
          request(server).get(`/api/v1/backoffice/refunds/${MISSING_ID}/evidence-url`).set(headers),
      },
    ];

    for (const route of routes) {
      const anonymous = await route.call({}).expect(401);
      expectNoStore(anonymous);
      expect(errorCode(anonymous)).toBe('AUTH_REQUIRED');
    }

    const customer = await login(server, 'CUSTOMER');
    for (const route of routes) {
      const forbidden = await route.call(bearer(customer)).expect(403);
      expectNoStore(forbidden);
      expect(errorCode(forbidden)).toBe('FORBIDDEN');
    }

    for (const role of ['EMPLOYEE', 'ADMIN'] as const) {
      const staff = await login(server, role);
      for (const route of routes) {
        const response = await route.call(bearer(staff)).expect(route.staffStatus);
        expectNoStore(response);
        if (route.staffStatus === 404) expect(errorCode(response)).toBe('RESOURCE_NOT_FOUND');
      }
    }
  });

  it('cancels a paid pre-handover order once and creates exactly one refund obligation', async () => {
    const fixture = await createPaidOrder(prisma, {
      status: 'CONFIRMED',
      paidAmount: '40000',
      grandTotal: '100000',
    });
    const employee = await login(server, 'EMPLOYEE');
    const reason = 'Khách đổi ý trước khi đơn được bàn giao cho đơn vị vận chuyển';

    const cancelled = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/cancel`)
      .set(bearer(employee))
      .send({ reason })
      .expect(200);
    expectNoStore(cancelled);
    expect(successRecord(cancelled)).toMatchObject({
      id: fixture.orderId,
      status: 'CANCELLED',
      fulfillmentStatus: 'CANCELLED',
      cancelReason: reason,
      refunds: [
        expect.objectContaining({
          amount: '40000',
          method: 'BANK_TRANSFER',
          status: 'REQUESTED',
          reason,
        }),
      ],
    });

    const replay = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/cancel`)
      .set(bearer(employee))
      .send({ reason })
      .expect(200);
    expectNoStore(replay);
    expect(successRecord(replay)).toMatchObject({
      status: 'CANCELLED',
      fulfillmentStatus: 'CANCELLED',
    });

    const [order, payment, refunds, cancellationAudits] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
      prisma.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }),
      prisma.refund.findMany({ where: { orderId: fixture.orderId } }),
      prisma.auditLog.count({
        where: { resourceId: fixture.orderId, action: 'order.cancelled' },
      }),
    ]);
    expect(order).toMatchObject({ status: 'CANCELLED', fulfillmentStatus: 'CANCELLED' });
    expect(payment.status).toBe('VERIFIED');
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      paymentId: fixture.paymentId,
      method: 'BANK_TRANSFER',
      status: 'REQUESTED',
      requestedByType: 'STAFF',
    });
    expect(refunds[0]?.amount.toString()).toBe('40000');
    expect(cancellationAudits).toBe(1);
  });

  it('runs a manual CASH refund through completion, replay and over-refund rejection', async () => {
    const fixture = await createPaidOrder(prisma, {
      status: 'COMPLETED',
      paidAmount: '100000',
      grandTotal: '100000',
    });
    const employee = await login(server, 'EMPLOYEE');

    const created = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/refunds`)
      .set(bearer(employee))
      .send({
        paymentId: fixture.paymentId,
        amount: '30000',
        method: 'CASH',
        reason: 'Hoàn tiền một phần theo thỏa thuận với khách',
      })
      .expect(201);
    expectNoStore(created);
    const refundId = stringProperty(successRecord(created), 'id');
    expect(successRecord(created)).toMatchObject({
      amount: '30000',
      method: 'CASH',
      status: 'REQUESTED',
      evidenceAvailable: false,
      availableActions: ['START_PROCESSING', 'REJECT', 'CANCEL'],
    });

    const list = await request(server)
      .get(`/api/v1/backoffice/refunds?status=REQUESTED&orderNumber=${fixture.orderNumber}`)
      .set(bearer(employee))
      .expect(200);
    expectNoStore(list);
    expect(successArray(list)).toEqual([
      expect.objectContaining({ id: refundId, orderNumber: fixture.orderNumber }),
    ]);

    const started = await request(server)
      .post(`/api/v1/backoffice/refunds/${refundId}/start-processing`)
      .set(bearer(employee))
      .send({ note: 'Đã xác nhận lịch hẹn hoàn tiền tại cửa hàng' })
      .expect(200);
    expectNoStore(started);
    expect(successRecord(started)).toMatchObject({
      status: 'PROCESSING',
      availableActions: ['COMPLETE_CASH'],
    });

    const completed = await request(server)
      .post(`/api/v1/backoffice/refunds/${refundId}/complete-cash`)
      .set(bearer(employee))
      .send({ note: CASH_COMPLETION_NOTE })
      .expect(200);
    expectNoStore(completed);
    expect(successRecord(completed)).toMatchObject({
      id: refundId,
      status: 'COMPLETED',
      method: 'CASH',
      note: CASH_COMPLETION_NOTE,
      evidenceAvailable: false,
      availableActions: [],
      order: {
        status: 'COMPLETED',
        paymentStatus: 'PARTIALLY_REFUNDED',
        paidAmount: '100000',
        refundedAmount: '30000',
      },
    });

    const replay = await request(server)
      .post(`/api/v1/backoffice/refunds/${refundId}/complete-cash`)
      .set(bearer(employee))
      .send({ note: CASH_COMPLETION_NOTE })
      .expect(200);
    expectNoStore(replay);
    expect(successRecord(replay)).toMatchObject({ id: refundId, status: 'COMPLETED' });

    const exceedsPaid = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/refunds`)
      .set(bearer(employee))
      .send({
        amount: '80000',
        method: 'CASH',
        reason: 'Yêu cầu vượt quá phần tiền còn có thể hoàn',
      })
      .expect(422);
    expectNoStore(exceedsPaid);
    expect(errorCode(exceedsPaid)).toBe('REFUND_AMOUNT_EXCEEDS_PAID');

    const [refund, order, completionAudits] = await Promise.all([
      prisma.refund.findUniqueOrThrow({ where: { id: refundId } }),
      prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
      prisma.auditLog.count({ where: { resourceId: refundId, action: 'refund.completed' } }),
    ]);
    expect(refund).toMatchObject({ status: 'COMPLETED', method: 'CASH' });
    expect(refund.evidenceBucket).toBeNull();
    expect(refund.evidenceObjectPath).toBeNull();
    expect(order).toMatchObject({ paymentStatus: 'PARTIALLY_REFUNDED' });
    expect(order.refundedAmount.toString()).toBe('30000');
    expect(completionAudits).toBe(1);

    const customer = await login(server, 'CUSTOMER');
    const publicDetail = await request(server)
      .get(`/api/v1/orders/${fixture.orderNumber}`)
      .set(bearer(customer))
      .expect(200);
    expectNoStore(publicDetail);
    const publicRefund = record(arrayProperty(successRecord(publicDetail), 'refunds')[0]);
    expect(publicRefund).toMatchObject({
      id: refundId,
      amount: '30000',
      method: 'CASH',
      status: 'COMPLETED',
    });
    for (const privateField of [
      'note',
      'requester',
      'processor',
      'terminalActor',
      'evidenceBucket',
      'evidenceObjectPath',
      'evidenceSha256',
    ]) {
      expect(publicRefund).not.toHaveProperty(privateField);
    }
  });

  it('returns completion actions only to the processor employee or an admin', async () => {
    const fixture = await createPaidOrder(prisma, {
      status: 'COMPLETED',
      paidAmount: '100000',
      grandTotal: '100000',
    });
    const employee = await login(server, 'EMPLOYEE');
    const otherEmployee = await createAndLoginSecondEmployee(server, prisma);
    const admin = await login(server, 'ADMIN');

    const created = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/refunds`)
      .set(bearer(employee))
      .send({
        amount: '30000',
        method: 'CASH',
        reason: 'Hoàn tiền để kiểm thử quyền người xử lý',
      })
      .expect(201);
    const refundId = stringProperty(successRecord(created), 'id');

    const started = await request(server)
      .post(`/api/v1/backoffice/refunds/${refundId}/start-processing`)
      .set(bearer(employee))
      .send({ note: 'Nhân viên thứ nhất nhận xử lý hoàn tiền' })
      .expect(200);
    expect(successRecord(started)).toMatchObject({
      status: 'PROCESSING',
      availableActions: ['COMPLETE_CASH'],
    });

    const hiddenFromOtherEmployee = await request(server)
      .get(`/api/v1/backoffice/refunds/${refundId}`)
      .set(bearer(otherEmployee))
      .expect(200);
    expect(successRecord(hiddenFromOtherEmployee)).toMatchObject({
      status: 'PROCESSING',
      availableActions: [],
    });

    const forbiddenCompletion = await request(server)
      .post(`/api/v1/backoffice/refunds/${refundId}/complete-cash`)
      .set(bearer(otherEmployee))
      .send({ note: CASH_COMPLETION_NOTE })
      .expect(403);
    expect(errorCode(forbiddenCompletion)).toBe('FORBIDDEN');

    const visibleToAdmin = await request(server)
      .get(`/api/v1/backoffice/refunds/${refundId}`)
      .set(bearer(admin))
      .expect(200);
    expect(successRecord(visibleToAdmin)).toMatchObject({
      status: 'PROCESSING',
      availableActions: ['COMPLETE_CASH'],
    });

    const completedByAdmin = await request(server)
      .post(`/api/v1/backoffice/refunds/${refundId}/complete-cash`)
      .set(bearer(admin))
      .send({ note: CASH_COMPLETION_NOTE })
      .expect(200);
    expect(successRecord(completedByAdmin)).toMatchObject({
      status: 'COMPLETED',
      availableActions: [],
      processor: { fullName: 'Nhân viên Demo' },
    });
  });

  it('completes a BANK_TRANSFER refund with private evidence and exact replay', async () => {
    const fixture = await createPaidOrder(prisma, {
      status: 'COMPLETED',
      paidAmount: '100000',
      grandTotal: '100000',
    });
    const employee = await login(server, 'EMPLOYEE');
    const storage = app.get(InMemoryStorageProvider);

    const created = await request(server)
      .post(`/api/v1/backoffice/orders/${fixture.orderId}/refunds`)
      .set(bearer(employee))
      .send({
        amount: '50000',
        method: 'BANK_TRANSFER',
        reason: 'Hoàn tiền chuyển khoản theo xác nhận của khách',
      })
      .expect(201);
    const refundId = stringProperty(successRecord(created), 'id');
    await request(server)
      .post(`/api/v1/backoffice/refunds/${refundId}/start-processing`)
      .set(bearer(employee))
      .send({ note: 'Đã kiểm tra thông tin tài khoản nhận tiền' })
      .expect(200);

    const completed = await request(server)
      .post(`/api/v1/backoffice/refunds/${refundId}/complete-bank-transfer`)
      .set(bearer(employee))
      .field('note', BANK_COMPLETION_NOTE)
      .attach('file', EVIDENCE, { filename: 'refund.png', contentType: 'image/png' })
      .expect(200);
    expectNoStore(completed);
    expect(successRecord(completed)).toMatchObject({
      id: refundId,
      status: 'COMPLETED',
      method: 'BANK_TRANSFER',
      evidenceAvailable: true,
      availableActions: ['VIEW_EVIDENCE'],
    });
    expect(JSON.stringify(completed.body)).not.toMatch(
      /evidenceBucket|evidenceObjectPath|evidenceSha256|private-test/,
    );
    expect(storage.objectCount()).toBe(1);

    const replay = await request(server)
      .post(`/api/v1/backoffice/refunds/${refundId}/complete-bank-transfer`)
      .set(bearer(employee))
      .field('note', BANK_COMPLETION_NOTE)
      .attach('file', EVIDENCE, { filename: 'refund.png', contentType: 'image/png' })
      .expect(200);
    expectNoStore(replay);
    expect(successRecord(replay)).toMatchObject({ id: refundId, status: 'COMPLETED' });
    expect(storage.objectCount()).toBe(1);

    const evidenceUrl = await request(server)
      .get(`/api/v1/backoffice/refunds/${refundId}/evidence-url`)
      .set(bearer(employee))
      .expect(200);
    expectNoStore(evidenceUrl);
    const signed = successRecord(evidenceUrl);
    expect(stringProperty(signed, 'url')).toContain(`private-test/refunds/${refundId}/`);
    const ttlMilliseconds = new Date(stringProperty(signed, 'expiresAt')).getTime() - Date.now();
    expect(ttlMilliseconds).toBeGreaterThan(295_000);
    expect(ttlMilliseconds).toBeLessThanOrEqual(300_000);

    const [refund, completionAudits, viewAudits] = await Promise.all([
      prisma.refund.findUniqueOrThrow({ where: { id: refundId } }),
      prisma.auditLog.count({ where: { resourceId: refundId, action: 'refund.completed' } }),
      prisma.auditLog.count({ where: { resourceId: refundId, action: 'refund.evidence_viewed' } }),
    ]);
    expect(refund.evidenceBucket).toBe('private-test');
    expect(refund.evidenceObjectPath).toMatch(new RegExp(`^refunds/${refundId}/`));
    expect(refund.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect({ completionAudits, viewAudits }).toEqual({ completionAudits: 1, viewAudits: 1 });

    const customer = await login(server, 'CUSTOMER');
    const publicDetail = await request(server)
      .get(`/api/v1/orders/${fixture.orderNumber}`)
      .set(bearer(customer))
      .expect(200);
    expectNoStore(publicDetail);
    expect(JSON.stringify(publicDetail.body)).not.toMatch(
      /evidenceBucket|evidenceObjectPath|evidenceSha256|private-test|storage\.test/,
    );
  });

  it('serializes concurrent manual creates so active refund obligations never exceed paid money', async () => {
    const fixture = await createPaidOrder(prisma, {
      status: 'COMPLETED',
      paidAmount: '100000',
      grandTotal: '100000',
    });
    const employee = await login(server, 'EMPLOYEE');
    const admin = await login(server, 'ADMIN');
    const barrier = new Barrier(2);

    const responses = await Promise.all(
      [employee, admin].map(async (token, index) => {
        await barrier.arrive();
        return request(server)
          .post(`/api/v1/backoffice/orders/${fixture.orderId}/refunds`)
          .set(bearer(token))
          .send({
            amount: '70000',
            method: index === 0 ? 'CASH' : 'BANK_TRANSFER',
            reason: `Yêu cầu hoàn tiền đồng thời số ${String(index + 1)}`,
          });
      }),
    );

    expect(responses.filter(({ status }) => status === 201)).toHaveLength(1);
    const loser = responses.find(({ status }) => status !== 201);
    expect(loser).toBeDefined();
    expect([409, 422]).toContain(loser?.status);
    for (const response of responses) expectNoStore(response);

    const activeRefunds = await prisma.refund.findMany({
      where: {
        orderId: fixture.orderId,
        status: { in: ['REQUESTED', 'PROCESSING', 'COMPLETED'] },
      },
    });
    const covered = activeRefunds.reduce(
      (sum, refund) => sum + BigInt(refund.amount.toString()),
      0n,
    );
    expect(activeRefunds).toHaveLength(1);
    expect(covered).toBe(70_000n);
    expect(covered).toBeLessThanOrEqual(100_000n);
  });
});

interface PaidOrderFixture {
  orderId: string;
  orderNumber: string;
  paymentId: string;
}

async function createPaidOrder(
  prisma: PrismaClient,
  input: {
    status: 'CONFIRMED' | 'COMPLETED';
    paidAmount: string;
    grandTotal: string;
  },
): Promise<PaidOrderFixture> {
  const [customer, reviewer, location] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { normalizedEmail: 'customer@rephone.local' } }),
    prisma.user.findUniqueOrThrow({ where: { normalizedEmail: 'admin@rephone.local' } }),
    prisma.inventoryLocation.findFirstOrThrow({
      where: { type: 'WAREHOUSE', status: 'ACTIVE' },
      orderBy: { code: 'asc' },
    }),
  ]);
  const sourceCart = await prisma.cart.create({
    data: { customerId: customer.id, status: 'CONVERTED' },
  });
  const placedAt = new Date(Date.now() - 60_000);
  const confirmedAt = new Date(placedAt.getTime() + 1_000);
  const isCompleted = input.status === 'COMPLETED';
  const grandTotal = BigInt(input.grandTotal);
  const paidAmount = BigInt(input.paidAmount);
  const orderNumber = `RPH-20260824-${randomUUID().replace(/[-01]/g, '2').slice(0, 8).toUpperCase()}`;
  const order = await prisma.order.create({
    data: {
      orderNumber,
      sourceCartId: sourceCart.id,
      customerId: customer.id,
      customerName: customer.fullName,
      customerEmail: customer.email,
      customerPhone: customer.phone ?? '0900000000',
      fulfillmentType: 'SHIPPING',
      fulfillmentStatus: isCompleted ? 'COMPLETED' : 'PENDING',
      fulfillmentLocationId: location.id,
      shippingAddressSnapshot: {
        receiverName: customer.fullName,
        phone: customer.phone ?? '0900000000',
        addressLine: '1 Nguyễn Huệ',
        ward: 'Bến Nghé',
        district: 'Quận 1',
        province: 'TP.HCM',
      },
      status: input.status,
      paymentStatus: paidAmount >= grandTotal ? 'PAID' : 'PARTIALLY_PAID',
      subtotal: input.grandTotal,
      shippingFeeOriginal: '0',
      shippingFee: '0',
      grandTotal: input.grandTotal,
      depositRequired: '10000',
      paidAmount: input.paidAmount,
      refundedAmount: '0',
      balanceDue: (grandTotal > paidAmount ? grandTotal - paidAmount : 0n).toString(),
      placedAt,
      confirmedAt,
      ...(isCompleted ? { completedAt: new Date(confirmedAt.getTime() + 1_000) } : {}),
    },
  });
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      purpose: 'FULL_PAYMENT',
      method: 'OTHER',
      expectedAmount: input.paidAmount,
      receivedAmount: input.paidAmount,
      status: 'VERIFIED',
      reviewedById: reviewer.id,
      reviewedAt: confirmedAt,
      note: 'Verified finance fixture for Slice 10 HTTP tests',
    },
  });
  return { orderId: order.id, orderNumber, paymentId: payment.id };
}

async function login(server: Server, role: 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER'): Promise<string> {
  const credentials = {
    ADMIN: ['admin@rephone.local', 'AdminDemo123'],
    EMPLOYEE: ['employee@rephone.local', 'EmployeeDemo123'],
    CUSTOMER: ['customer@rephone.local', 'CustomerDemo123'],
  } as const;
  const [email, password] = credentials[role];
  return loginWithCredentials(server, email, password);
}

async function createAndLoginSecondEmployee(server: Server, prisma: PrismaClient): Promise<string> {
  const source = await prisma.user.findUniqueOrThrow({
    where: { normalizedEmail: 'employee@rephone.local' },
  });
  const email = 'employee-second@rephone.local';
  await prisma.user.create({
    data: {
      email,
      normalizedEmail: email,
      passwordHash: source.passwordHash,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      fullName: 'Nhân viên thứ hai',
      employeeCode: 'EMP-002',
      emailVerifiedAt: source.emailVerifiedAt,
      passwordChangedAt: source.passwordChangedAt,
    },
  });
  return loginWithCredentials(server, email, 'EmployeeDemo123');
}

async function loginWithCredentials(
  server: Server,
  email: string,
  password: string,
): Promise<string> {
  const response = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return stringProperty(successRecord(response), 'accessToken');
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function expectNoStore(response: Response): void {
  expect(response.headers['cache-control']).toBe('no-store');
}

function successRecord(response: Response): Record<string, unknown> {
  return objectProperty(response.body as unknown, 'data');
}

function successArray(response: Response): Array<Record<string, unknown>> {
  const value = record(response.body as unknown)['data'];
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error('Expected success data array');
  }
  return value;
}

function errorCode(response: Response): string {
  return stringProperty(objectProperty(response.body as unknown, 'error'), 'code');
}

function objectProperty(value: unknown, key: string): Record<string, unknown> {
  const property = record(value)[key];
  if (!isRecord(property)) throw new Error(`Expected ${key} to be an object`);
  return property;
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
  if (!isRecord(value)) throw new Error('Expected an object');
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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
