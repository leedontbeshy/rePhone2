import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { OrderRateLimiter } from '../../src/modules/orders/order-rate-limiter.service.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

const MUTATION_HEADERS = {
  Origin: 'http://localhost:3001',
  'X-Rephone-CSRF': '1',
  'Content-Type': 'application/json',
};

describe('Slice 06 checkout and customer order HTTP contract', () => {
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
    app.get(OrderRateLimiter).clear();
    await resetTestDatabase(prisma);
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it.each([
    ['missing', undefined],
    ['null', null],
  ])('rejects checkout when contact is %s', async (_case, contact) => {
    const response = await request(server)
      .post('/api/v1/checkouts')
      .set(MUTATION_HEADERS)
      .send({
        fulfillmentType: 'PICKUP',
        expectedPreviewFingerprint: `v1:${'a'.repeat(64)}`,
        expectedCartUpdatedAt: '2026-09-02T00:00:00.000Z',
        expectedGrandTotal: '1000000',
        expectedDepositRequired: '0',
        ...(contact === undefined ? {} : { contact }),
      })
      .expect(400);

    const error = record(record(response.body)['error']);
    const details = Array.isArray(error['details']) ? error['details'] : [];
    expect(error['code']).toBe('VALIDATION_FAILED');
    expect(
      details.some(
        (detail) =>
          typeof detail === 'object' &&
          detail !== null &&
          !Array.isArray(detail) &&
          record(detail)['field'] === 'contact' &&
          record(detail)['code'] === 'IS_DEFINED',
      ),
    ).toBe(true);
  });

  it('creates, replays, reads and cancels a guest shipping order without leaking token storage', async () => {
    const variant = await accessoryVariant(prisma);
    const agent = request.agent(server);
    await agent
      .post('/api/v1/cart/items')
      .set(MUTATION_HEADERS)
      .send({ itemType: 'ACCESSORY', variantId: variant.id, quantity: 2 })
      .expect(201);
    const previewResponse = await agent
      .post('/api/v1/checkouts/preview')
      .set(MUTATION_HEADERS)
      .send({ fulfillmentType: 'SHIPPING' })
      .expect(200);
    const preview = data(previewResponse.body);
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.inventoryReservation.count()).toBe(0);

    const body = checkoutBody(preview, 'SHIPPING');
    const created = await agent
      .post('/api/v1/checkouts')
      .set(MUTATION_HEADERS)
      .send(body)
      .expect(201);
    const result = data(created.body);
    const order = objectProperty(result, 'order');
    const orderNumber = stringProperty(order, 'orderNumber');
    const rawToken = stringProperty(result, 'guestAccessToken');
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const persisted = await prisma.order.findUniqueOrThrow({ where: { orderNumber } });
    expect(persisted.guestAccessTokenHash).toBe(
      createHash('sha256').update(rawToken).digest('hex'),
    );
    expect(persisted.guestAccessTokenHash).not.toContain(rawToken);
    expect(await prisma.payment.count({ where: { orderId: persisted.id } })).toBe(1);
    expect(await prisma.inventoryReservation.count({ where: { orderId: persisted.id } })).toBe(1);

    const replay = await agent
      .post('/api/v1/checkouts')
      .set(MUTATION_HEADERS)
      .send(body)
      .expect(200);
    expect(data(replay.body)).not.toHaveProperty('guestAccessToken');
    expect(objectProperty(data(replay.body), 'order')).toMatchObject({ orderNumber });
    expect(await prisma.order.count()).toBe(1);

    await request(server)
      .get(`/api/v1/orders/${orderNumber}`)
      .set('X-Guest-Order-Token', 'B'.repeat(43))
      .expect(404);
    const detail = await request(server)
      .get(`/api/v1/orders/${orderNumber}`)
      .set('X-Guest-Order-Token', rawToken)
      .expect(200);
    expect(detail.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(detail.body)).not.toMatch(
      /guestAccessTokenHash|sourceCartId|internalNote/,
    );

    const cancelled = await request(server)
      .post(`/api/v1/orders/${orderNumber}/cancel`)
      .set('X-Guest-Order-Token', rawToken)
      .send({ reason: 'Tôi thay đổi nhu cầu mua hàng' })
      .expect(200);
    expect(data(cancelled.body)).toMatchObject({ status: 'CANCELLED' });
    expect(await prisma.inventoryReservation.count({ where: { status: 'ACTIVE' } })).toBe(0);
    const stockLevelId = await reservationStockId(prisma, persisted.id);
    expect(
      (await prisma.stockLevel.findUniqueOrThrow({ where: { id: stockLevelId } })).quantityReserved,
    ).toBe(0);
    await request(server)
      .post(`/api/v1/orders/${orderNumber}/cancel`)
      .set('X-Guest-Order-Token', rawToken)
      .send({ reason: 'Tôi thay đổi nhu cầu mua hàng' })
      .expect(200);
    expect(await prisma.auditLog.count({ where: { resourceId: persisted.id } })).toBe(2);
  });

  it('supports customer pickup, list/detail ownership and review-required reconfirmation', async () => {
    const variant = await accessoryVariant(prisma);
    const token = await login(server, 'customer@rephone.local', 'CustomerDemo123');
    await request(server)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ itemType: 'ACCESSORY', variantId: variant.id, quantity: 1 })
      .expect(201);
    const preview = data(
      (
        await request(server)
          .post('/api/v1/checkouts/preview')
          .set('Authorization', `Bearer ${token}`)
          .send({ fulfillmentType: 'PICKUP' })
          .expect(200)
      ).body,
    );
    expect(objectProperty(preview, 'pricing')).toMatchObject({
      shippingFee: '0',
      depositRequired: '0',
    });

    await request(server)
      .post('/api/v1/checkouts')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...checkoutBody(preview, 'PICKUP'), expectedGrandTotal: '1' })
      .expect(409)
      .expect(({ body }) => {
        expect(record(body)['error']).toMatchObject({ code: 'CHECKOUT_REVIEW_REQUIRED' });
      });
    expect(await prisma.order.count()).toBe(0);

    const created = await request(server)
      .post('/api/v1/checkouts')
      .set('Authorization', `Bearer ${token}`)
      .send(checkoutBody(preview, 'PICKUP'))
      .expect(201);
    const orderNumber = stringProperty(objectProperty(data(created.body), 'order'), 'orderNumber');
    expect(data(created.body)).not.toHaveProperty('guestAccessToken');
    const list = await request(server)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(arrayProperty(list.body, 'data')).toEqual(
      expect.arrayContaining([expect.objectContaining({ orderNumber })]),
    );
    await request(server)
      .get(`/api/v1/orders/${orderNumber}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(server)
      .post('/api/v1/auth/register')
      .send({ email: 'other@example.com', password: 'OtherDemo123', fullName: 'Other Customer' })
      .expect(201);
    const other = await login(server, 'other@example.com', 'OtherDemo123');
    await request(server)
      .get(`/api/v1/orders/${orderNumber}`)
      .set('Authorization', `Bearer ${other}`)
      .expect(404);
  });

  it('requires reconfirmation when preview metadata changes without changing totals', async () => {
    const variant = await accessoryVariant(prisma);
    const token = await login(server, 'customer@rephone.local', 'CustomerDemo123');
    await request(server)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ itemType: 'ACCESSORY', variantId: variant.id, quantity: 1 })
      .expect(201);
    const preview = data(
      (
        await request(server)
          .post('/api/v1/checkouts/preview')
          .set('Authorization', `Bearer ${token}`)
          .send({ fulfillmentType: 'PICKUP' })
          .expect(200)
      ).body,
    );
    const previewItem = record(arrayProperty(preview, 'items')[0]);
    const productId = stringProperty(objectProperty(previewItem, 'target'), 'productId');
    await prisma.product.update({
      where: { id: productId },
      data: { name: 'Tên sản phẩm đã cập nhật' },
    });

    const stale = await request(server)
      .post('/api/v1/checkouts')
      .set('Authorization', `Bearer ${token}`)
      .send(checkoutBody(preview, 'PICKUP'))
      .expect(409);
    const error = objectProperty(stale.body, 'error');
    expect(error).toMatchObject({ code: 'CHECKOUT_REVIEW_REQUIRED' });
    const detail = record(arrayProperty(error, 'details')[0]);
    const current = objectProperty(detail, 'current');
    expect(stringProperty(current, 'previewFingerprint')).not.toBe(
      stringProperty(preview, 'previewFingerprint'),
    );
    expect(objectProperty(current, 'pricing')).toEqual(objectProperty(preview, 'pricing'));
    expect(objectProperty(record(arrayProperty(current, 'items')[0]), 'target')).toMatchObject({
      productName: 'Tên sản phẩm đã cập nhật',
    });
    expect(await prisma.order.count()).toBe(0);

    await request(server)
      .post('/api/v1/checkouts')
      .set('Authorization', `Bearer ${token}`)
      .send(checkoutBody(current, 'PICKUP'))
      .expect(201);
  });

  it('serializes two creates from one source cart into one 201 and one 200 replay', async () => {
    const variant = await accessoryVariant(prisma);
    const token = await login(server, 'customer@rephone.local', 'CustomerDemo123');
    await request(server)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ itemType: 'ACCESSORY', variantId: variant.id, quantity: 1 })
      .expect(201);
    const preview = data(
      (
        await request(server)
          .post('/api/v1/checkouts/preview')
          .set('Authorization', `Bearer ${token}`)
          .send({ fulfillmentType: 'PICKUP' })
          .expect(200)
      ).body,
    );
    const barrier = new Barrier(2);
    const responses = await Promise.all(
      [0, 1].map(async () => {
        await barrier.arrive();
        return request(server)
          .post('/api/v1/checkouts')
          .set('Authorization', `Bearer ${token}`)
          .send(checkoutBody(preview, 'PICKUP'));
      }),
    );
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 201]);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.inventoryReservation.count({ where: { status: 'ACTIVE' } })).toBe(1);
  });

  it('allows only one checkout to reserve the same serialized iPhone', async () => {
    const unit = await prisma.inventoryUnit.findFirstOrThrow({
      where: { lifecycleStatus: 'AVAILABLE', location: { type: 'STORE', status: 'ACTIVE' } },
      select: { inventoryCode: true },
    });
    const first = await login(server, 'customer@rephone.local', 'CustomerDemo123');
    const second = await registerAndLogin(server, 'iphone-race@example.com');
    for (const token of [first, second]) {
      await request(server)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ itemType: 'IPHONE', inventoryCode: unit.inventoryCode })
        .expect(201);
    }
    const previews = await Promise.all(
      [first, second].map(async (token) =>
        data(
          (
            await request(server)
              .post('/api/v1/checkouts/preview')
              .set('Authorization', `Bearer ${token}`)
              .send({ fulfillmentType: 'PICKUP' })
              .expect(200)
          ).body,
        ),
      ),
    );
    const barrier = new Barrier(2);
    const responses = await Promise.all(
      [first, second].map(async (token, index) => {
        await barrier.arrive();
        return request(server)
          .post('/api/v1/checkouts')
          .set('Authorization', `Bearer ${token}`)
          .send(checkoutBody(previews[index] as Record<string, unknown>, 'PICKUP'));
      }),
    );
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(await prisma.inventoryReservation.count({ where: { status: 'ACTIVE' } })).toBe(1);
    expect(await prisma.order.count()).toBe(1);
  }, 30_000);

  it('does not exceed the final voucher quota under concurrency', async () => {
    const storeStock = await prisma.stockLevel.findFirstOrThrow({
      where: { location: { type: 'STORE', status: 'ACTIVE' }, variant: { status: 'ACTIVE' } },
      select: { id: true, variantId: true },
    });
    await prisma.stockLevel.updateMany({
      where: { variantId: storeStock.variantId },
      data: { quantityOnHand: 0, quantityReserved: 0 },
    });
    await prisma.stockLevel.update({
      where: { id: storeStock.id },
      data: { quantityOnHand: 2, quantityReserved: 0 },
    });
    await prisma.voucher.create({
      data: {
        code: 'FINALQUOTA',
        normalizedCode: 'FINALQUOTA',
        name: 'Final quota',
        discountType: 'FIXED',
        discountValue: '1000',
        minimumOrderAmount: '0',
        startsAt: new Date('2026-01-01T00:00:00.000Z'),
        endsAt: new Date('2030-01-01T00:00:00.000Z'),
        totalUsageLimit: 1,
        visibility: 'PUBLIC',
        scopeType: 'ORDER',
        status: 'ACTIVE',
      },
    });
    const first = await login(server, 'customer@rephone.local', 'CustomerDemo123');
    const second = await registerAndLogin(server, 'voucher-race@example.com');
    for (const token of [first, second]) {
      await request(server)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ itemType: 'ACCESSORY', variantId: storeStock.variantId, quantity: 1 })
        .expect(201);
    }
    const previews = await Promise.all(
      [first, second].map(async (token) =>
        data(
          (
            await request(server)
              .post('/api/v1/checkouts/preview')
              .set('Authorization', `Bearer ${token}`)
              .send({ fulfillmentType: 'PICKUP', voucherCode: 'FINALQUOTA' })
              .expect(200)
          ).body,
        ),
      ),
    );
    const barrier = new Barrier(2);
    const responses = await Promise.all(
      [first, second].map(async (token, index) => {
        await barrier.arrive();
        return request(server)
          .post('/api/v1/checkouts')
          .set('Authorization', `Bearer ${token}`)
          .send({
            ...checkoutBody(previews[index] as Record<string, unknown>, 'PICKUP'),
            voucherCode: 'FINALQUOTA',
          });
      }),
    );
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.voucherUsage.count({ where: { status: 'RESERVED' } })).toBe(1);
    expect(
      (await prisma.stockLevel.findUniqueOrThrow({ where: { id: storeStock.id } }))
        .quantityReserved,
    ).toBe(1);
  });

  it('keeps accessory reserved quantity within on-hand under two concurrent carts', async () => {
    const storeStock = await prisma.stockLevel.findFirstOrThrow({
      where: { location: { type: 'STORE', status: 'ACTIVE' }, variant: { status: 'ACTIVE' } },
      select: { id: true, variantId: true },
    });
    await prisma.stockLevel.updateMany({
      where: { variantId: storeStock.variantId },
      data: { quantityOnHand: 0, quantityReserved: 0 },
    });
    await prisma.stockLevel.update({
      where: { id: storeStock.id },
      data: { quantityOnHand: 1, quantityReserved: 0 },
    });
    const first = await login(server, 'customer@rephone.local', 'CustomerDemo123');
    const second = await registerAndLogin(server, 'stock-race@example.com');
    for (const token of [first, second]) {
      await request(server)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ itemType: 'ACCESSORY', variantId: storeStock.variantId, quantity: 1 })
        .expect(201);
    }
    const previews = await Promise.all(
      [first, second].map(async (token) =>
        data(
          (
            await request(server)
              .post('/api/v1/checkouts/preview')
              .set('Authorization', `Bearer ${token}`)
              .send({ fulfillmentType: 'PICKUP' })
              .expect(200)
          ).body,
        ),
      ),
    );
    const barrier = new Barrier(2);
    const responses = await Promise.all(
      [first, second].map(async (token, index) => {
        await barrier.arrive();
        return request(server)
          .post('/api/v1/checkouts')
          .set('Authorization', `Bearer ${token}`)
          .send(checkoutBody(previews[index] as Record<string, unknown>, 'PICKUP'));
      }),
    );
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    const stock = await prisma.stockLevel.findUniqueOrThrow({ where: { id: storeStock.id } });
    expect(stock.quantityReserved).toBe(1);
    expect(stock.quantityReserved).toBeLessThanOrEqual(stock.quantityOnHand);
  });
});

async function reservationStockId(prisma: PrismaClient, orderId: string): Promise<string> {
  return (
    await prisma.inventoryReservation.findFirstOrThrow({
      where: { orderId },
      select: { stockLevelId: true },
    })
  ).stockLevelId as string;
}

function accessoryVariant(prisma: PrismaClient) {
  return prisma.productVariant.findFirstOrThrow({
    where: { inventoryMode: 'QUANTITY', status: 'ACTIVE', salePrice: { not: null } },
    select: { id: true },
  });
}

function checkoutBody(preview: Record<string, unknown>, fulfillmentType: 'PICKUP' | 'SHIPPING') {
  const pricing = objectProperty(preview, 'pricing');
  return {
    fulfillmentType,
    contact: { fullName: 'Khách Test', email: 'checkout@example.com', phone: '0900000000' },
    ...(fulfillmentType === 'SHIPPING'
      ? {
          shippingAddress: {
            receiverName: 'Khách Test',
            phone: '0900000000',
            addressLine: '1 Nguyễn Huệ',
            ward: 'Bến Nghé',
            district: 'Quận 1',
            province: 'TP.HCM',
          },
        }
      : {}),
    expectedPreviewFingerprint: stringProperty(preview, 'previewFingerprint'),
    expectedCartUpdatedAt: stringProperty(preview, 'cartUpdatedAt'),
    expectedGrandTotal: stringProperty(pricing, 'grandTotal'),
    expectedDepositRequired: stringProperty(pricing, 'depositRequired'),
  };
}

async function login(server: Server, email: string, password: string): Promise<string> {
  const response = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return stringProperty(data(response.body), 'accessToken');
}

async function registerAndLogin(server: Server, email: string): Promise<string> {
  await request(server)
    .post('/api/v1/auth/register')
    .send({ email, password: 'OtherDemo123', fullName: 'Other Customer' })
    .expect(201);
  return login(server, email, 'OtherDemo123');
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
