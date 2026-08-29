import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import { CommerceRateLimiter } from '../../src/modules/auth/commerce-rate-limiter.service.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

const MUTATION_HEADERS = {
  Origin: 'http://localhost:3001',
  'X-Rephone-CSRF': '1',
  'Content-Type': 'application/json',
};

describe('Slice 05 commerce HTTP contract', () => {
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
    app.get(CommerceRateLimiter).clear();
    await resetTestDatabase(prisma);
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('keeps guest GET side-effect free and protects the first mutation with CSRF', async () => {
    const variant = await accessoryVariant(prisma);

    const empty = await request(server).get('/api/v1/cart').expect(200);
    expect(data(empty.body)).toMatchObject({ id: null, items: [], estimatedSubtotal: '0' });
    expect(await prisma.cart.count()).toBe(0);

    await request(server)
      .get('/api/v1/cart')
      .set('Authorization', 'Bearer definitely-invalid')
      .expect(401);

    await request(server)
      .post('/api/v1/cart/items')
      .send({ itemType: 'ACCESSORY', variantId: variant.id, quantity: 1 })
      .expect(403);
    expect(await prisma.cart.count()).toBe(0);
  });

  it('creates a hashed guest cart and applies set semantics to accessory quantity', async () => {
    const variant = await accessoryVariant(prisma);
    const agent = request.agent(server);
    const created = await agent
      .post('/api/v1/cart/items')
      .set(MUTATION_HEADERS)
      .send({ itemType: 'ACCESSORY', variantId: variant.id, quantity: 2 })
      .expect(201);
    const cookie = created.headers['set-cookie']?.[0];
    expect(cookie).toContain('rephone_guest_cart=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    const rawToken = /rephone_guest_cart=([^;]+)/.exec(cookie ?? '')?.[1];
    const persisted = await prisma.cart.findFirstOrThrow();
    expect(persisted.guestTokenHash).toBe(
      createHash('sha256')
        .update(rawToken ?? '')
        .digest('hex'),
    );
    expect(persisted.guestTokenHash).not.toContain(rawToken ?? 'not-present');

    const updated = await agent
      .post('/api/v1/cart/items')
      .set(MUTATION_HEADERS)
      .send({ itemType: 'ACCESSORY', variantId: variant.id, quantity: 3 })
      .expect(200);
    expect(data(updated.body)).toMatchObject({
      items: [{ quantity: 3, target: { variantId: variant.id } }],
    });
    expect(await prisma.cartItem.count()).toBe(1);

    const itemId = stringProperty(arrayProperty(data(updated.body), 'items')[0], 'id');
    await agent
      .patch(`/api/v1/cart/items/${itemId}`)
      .set(MUTATION_HEADERS)
      .send({ quantity: 4 })
      .expect(200);
    await agent.delete(`/api/v1/cart/items/${itemId}`).set(MUTATION_HEADERS).send({}).expect(204);
    expect(await prisma.cartItem.count()).toBe(0);
  });

  it('projects current price and availability warnings without reserving inventory', async () => {
    const variant = await accessoryVariant(prisma);
    const agent = request.agent(server);
    const created = await agent
      .post('/api/v1/cart/items')
      .set(MUTATION_HEADERS)
      .send({ itemType: 'ACCESSORY', variantId: variant.id, quantity: 2 })
      .expect(201);
    const initialItem = arrayProperty(data(created.body), 'items')[0];
    const originalPrice = stringProperty(initialItem, 'currentUnitPrice');
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { salePrice: (BigInt(originalPrice) + 10_000n).toString() },
    });
    await prisma.stockLevel.updateMany({
      where: { variantId: variant.id },
      data: { quantityOnHand: 0, quantityReserved: 0 },
    });

    const stale = await agent.get('/api/v1/cart').expect(200);
    const cart = data(stale.body);
    const staleItem = arrayProperty(cart, 'items')[0];
    expect(arrayProperty(staleItem, 'warnings')).toEqual(
      expect.arrayContaining(['PRICE_CHANGED', 'ITEM_UNAVAILABLE']),
    );
    expect(cart['estimatedSubtotal']).toBe('0');
    expect(await prisma.inventoryReservation.count()).toBe(0);
  });

  it('claims a guest cart after customer login without duplicating its serialized item', async () => {
    const unit = await prisma.inventoryUnit.findFirstOrThrow({
      where: { lifecycleStatus: 'AVAILABLE' },
      select: { inventoryCode: true },
    });
    const agent = request.agent(server);
    const iphoneAdded = await agent
      .post('/api/v1/cart/items')
      .set(MUTATION_HEADERS)
      .send({ itemType: 'IPHONE', inventoryCode: unit.inventoryCode })
      .expect(201);
    const iphoneItemId = stringProperty(arrayProperty(data(iphoneAdded.body), 'items')[0], 'id');
    await agent
      .patch(`/api/v1/cart/items/${iphoneItemId}`)
      .set(MUTATION_HEADERS)
      .send({ quantity: 2 })
      .expect(409);
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ email: 'customer@rephone.local', password: 'CustomerDemo123' })
      .expect(200);
    const token = stringProperty(data(login.body), 'accessToken');

    const merged = await agent
      .post('/api/v1/cart/merge')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);
    expect(arrayProperty(data(merged.body), 'items')).toHaveLength(1);
    expect(await prisma.cartItem.count()).toBe(1);
    const customerCart = await prisma.cart.findFirstOrThrow({
      where: { customerId: { not: null } },
    });
    expect(customerCart.guestTokenHash).toBeNull();
    expect(customerCart.expiresAt).toBeNull();
  });

  it('keeps wishlist customer-only, idempotent and ownership-hidden', async () => {
    const variant = await accessoryVariant(prisma);
    const ownerToken = await login(server, 'customer@rephone.local', 'CustomerDemo123');
    await request(server).get('/api/v1/wishlist').expect(401);

    const created = await request(server)
      .post('/api/v1/wishlist/items')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ itemType: 'ACCESSORY', variantId: variant.id })
      .expect(201);
    const itemId = stringProperty(data(created.body), 'id');
    await request(server)
      .post('/api/v1/wishlist/items')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ itemType: 'ACCESSORY', variantId: variant.id })
      .expect(200);
    expect(await prisma.wishlistItem.count()).toBe(1);

    await request(server)
      .post('/api/v1/auth/register')
      .send({ email: 'other@example.com', password: 'OtherDemo123', fullName: 'Other Customer' })
      .expect(201);
    const otherToken = await login(server, 'other@example.com', 'OtherDemo123');
    await request(server)
      .delete(`/api/v1/wishlist/items/${itemId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    await request(server)
      .delete(`/api/v1/wishlist/items/${itemId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    await request(server)
      .delete(`/api/v1/wishlist/items/${itemId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });

  it('enforces admin voucher lifecycle and public/account discovery visibility', async () => {
    const adminToken = await login(server, 'admin@rephone.local', 'AdminDemo123');
    const employeeToken = await login(server, 'employee@rephone.local', 'EmployeeDemo123');
    const customerToken = await login(server, 'customer@rephone.local', 'CustomerDemo123');
    await request(server)
      .get('/api/v1/backoffice/vouchers')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);
    const hiddenAccountOnly = await request(server)
      .get('/api/v1/vouchers')
      .query({ visibility: 'ACCOUNT_ONLY' })
      .expect(200);
    expect(arrayProperty(hiddenAccountOnly.body, 'data')).toEqual([]);

    const created = await request(server)
      .post('/api/v1/backoffice/vouchers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(voucherInput('SMOKE10', 'PUBLIC'))
      .expect(201);
    const voucherId = stringProperty(data(created.body), 'id');
    expect(data(created.body)).toMatchObject({ code: 'SMOKE10', status: 'DRAFT' });

    await request(server)
      .post(`/api/v1/backoffice/vouchers/${voucherId}/activate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);
    await request(server)
      .patch(`/api/v1/backoffice/vouchers/${voucherId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ discountValue: '20' })
      .expect(409);
    const publicList = await request(server).get('/api/v1/vouchers').expect(200);
    expect(arrayProperty(publicList.body, 'data')).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'SMOKE10', visibility: 'PUBLIC' })]),
    );

    const accountVoucher = await request(server)
      .post('/api/v1/backoffice/vouchers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(voucherInput('ACCOUNT5', 'ACCOUNT_ONLY'))
      .expect(201);
    const accountVoucherId = stringProperty(data(accountVoucher.body), 'id');
    await request(server)
      .post(`/api/v1/backoffice/vouchers/${accountVoucherId}/activate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);
    expect(
      arrayProperty((await request(server).get('/api/v1/vouchers')).body, 'data').some(
        (voucher) => record(voucher)['code'] === 'ACCOUNT5',
      ),
    ).toBe(false);
    const customerList = await request(server)
      .get('/api/v1/vouchers')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(
      arrayProperty(customerList.body, 'data').map((voucher) => record(voucher)['code']),
    ).toEqual(expect.arrayContaining(['WELCOME100', 'IPHONE5', 'SMOKE10', 'ACCOUNT5']));

    await request(server)
      .post(`/api/v1/backoffice/vouchers/${voucherId}/pause`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Tạm dừng smoke test' })
      .expect(200);
    await request(server)
      .post(`/api/v1/backoffice/vouchers/${voucherId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Kết thúc smoke test' })
      .expect(200);
    const usages = await request(server)
      .get(`/api/v1/backoffice/vouchers/${voucherId}/usages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(arrayProperty(usages.body, 'data')).toEqual([]);
    expect(
      await prisma.auditLog.count({ where: { resourceId: voucherId } }),
    ).toBeGreaterThanOrEqual(4);
  });

  it('serializes concurrent customer first-add into one active cart and one item', async () => {
    const variant = await accessoryVariant(prisma);
    const token = await login(server, 'customer@rephone.local', 'CustomerDemo123');
    const barrier = new Barrier(2);
    const responses = await Promise.all(
      [2, 2].map(async (quantity) => {
        await barrier.arrive();
        return request(server)
          .post('/api/v1/cart/items')
          .set('Authorization', `Bearer ${token}`)
          .send({ itemType: 'ACCESSORY', variantId: variant.id, quantity });
      }),
    );
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 201]);
    const customer = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'customer@rephone.local' },
      select: { id: true },
    });
    expect(await prisma.cart.count({ where: { customerId: customer.id, status: 'ACTIVE' } })).toBe(
      1,
    );
    expect(await prisma.cartItem.count()).toBe(1);
  });

  it('makes concurrent merge replay deterministic and caps accessory quantity once', async () => {
    const variant = await accessoryVariant(prisma);
    await prisma.stockLevel.updateMany({
      where: { variantId: variant.id },
      data: { quantityOnHand: 200, quantityReserved: 0 },
    });
    const guest = await request(server)
      .post('/api/v1/cart/items')
      .set(MUTATION_HEADERS)
      .send({ itemType: 'ACCESSORY', variantId: variant.id, quantity: 70 })
      .expect(201);
    const cookie = guest.headers['set-cookie']?.[0]?.split(';')[0] ?? '';
    const token = await login(server, 'customer@rephone.local', 'CustomerDemo123');
    await request(server)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ itemType: 'ACCESSORY', variantId: variant.id, quantity: 70 })
      .expect(201);

    const barrier = new Barrier(2);
    const responses = await Promise.all(
      [0, 1].map(async () => {
        await barrier.arrive();
        return request(server)
          .post('/api/v1/cart/merge')
          .set('Authorization', `Bearer ${token}`)
          .set('Cookie', cookie)
          .send({});
      }),
    );
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 200]);
    const items = await prisma.cartItem.findMany({
      where: { cart: { customerId: { not: null }, status: 'ACTIVE' } },
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(99);
    expect(await prisma.cart.count({ where: { status: 'ABANDONED' } })).toBe(1);
  });

  it('allows only one concurrent activation transition for a draft voucher', async () => {
    const token = await login(server, 'admin@rephone.local', 'AdminDemo123');
    const voucher = await prisma.voucher.findUniqueOrThrow({
      where: { normalizedCode: 'DEMO-DRAFT' },
      select: { id: true },
    });
    const barrier = new Barrier(2);
    const responses = await Promise.all(
      [0, 1].map(async () => {
        await barrier.arrive();
        return request(server)
          .post(`/api/v1/backoffice/vouchers/${voucher.id}/activate`)
          .set('Authorization', `Bearer ${token}`)
          .send({});
      }),
    );
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { id: voucher.id } })).status).toBe(
      'ACTIVE',
    );
  });

  it('keeps commerce read p95 below the P0 500ms budget at 20 concurrent users', async () => {
    await request(server).get('/api/v1/vouchers').expect(200);
    const barrier = new Barrier(20);
    const durations = await Promise.all(
      Array.from({ length: 20 }, async () => {
        await barrier.arrive();
        const startedAt = performance.now();
        await request(server).get('/api/v1/vouchers').expect(200);
        return performance.now() - startedAt;
      }),
    );
    durations.sort((left, right) => left - right);
    expect(durations[Math.ceil(durations.length * 0.95) - 1]).toBeLessThan(500);
  });
});

function accessoryVariant(prisma: PrismaClient) {
  return prisma.productVariant.findFirstOrThrow({
    where: { inventoryMode: 'QUANTITY', status: 'ACTIVE', salePrice: { not: null } },
    select: { id: true },
  });
}

async function login(server: Server, email: string, password: string): Promise<string> {
  const response = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return stringProperty(data(response.body), 'accessToken');
}

function voucherInput(code: string, visibility: 'PUBLIC' | 'ACCOUNT_ONLY') {
  return {
    code,
    name: `${code} demo`,
    description: 'Voucher smoke test',
    discountType: 'PERCENT',
    discountValue: '10',
    maxDiscountAmount: '100000',
    minimumOrderAmount: '100000',
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: '2030-01-01T00:00:00.000Z',
    totalUsageLimit: 100,
    perCustomerLimit: visibility === 'ACCOUNT_ONLY' ? 1 : null,
    visibility,
    scopeType: 'ORDER',
    scopeConfig: null,
  };
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
