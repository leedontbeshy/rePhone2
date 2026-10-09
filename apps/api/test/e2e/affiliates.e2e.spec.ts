import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import type { Request } from 'express';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { AuthRateLimiter } from '../../src/modules/auth/auth-rate-limiter.service.js';
import { BackofficeRateLimiter } from '../../src/modules/auth/backoffice-rate-limiter.service.js';
import { CommerceRateLimiter } from '../../src/modules/auth/commerce-rate-limiter.service.js';
import { OrderRateLimiter } from '../../src/modules/orders/order-rate-limiter.service.js';
import { MAIL_PROVIDER, type MailProvider } from '../../src/common/providers/mail-provider.js';
import { AffiliateLedgerService } from '../../src/modules/affiliate-core/affiliate-ledger.service.js';
import { AffiliateRuntime } from '../../src/modules/affiliate-core/affiliate-runtime.service.js';
import { AffiliateQueryService } from '../../src/modules/affiliates/affiliate-query.service.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';
const headers = {
  Origin: 'http://localhost:3001',
  'X-Rephone-CSRF': '1',
  'Content-Type': 'application/json',
};
const proof = readFileSync(
  new URL('../../prisma/demo-assets/catalog/iphone-13.png', import.meta.url),
);
function defined<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Expected fixture value');
  return value;
}
const rec = (v: unknown) => v as Record<string, unknown>;
const data = (v: unknown) => rec(rec(v)['data']);
describe('Affiliate v1: PostgreSQL and HTTP', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: Server;
  let admin: string;
  let owner: string;
  let profileId: string;
  let unitId: string;
  let inventoryCode: string;
  const code = '0123456789abcdef';
  beforeAll(async () => {
    setTestEnvironment();
    process.env['AFFILIATE_ENABLED'] = 'true';
    process.env['AFFILIATE_ENVIRONMENT'] = 'TEST';
    process.env['DEALER_ENABLED'] = 'false';
    const { createApplication } = await import('../../src/application.js');
    app = await createApplication({ enableSwagger: false });
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer() as Server;
    prisma = createTestPrisma();
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    app.get(AuthRateLimiter).clear();
    app.get(BackofficeRateLimiter).clear();
    app.get(CommerceRateLimiter).clear();
    app.get(OrderRateLimiter).clear();
    await resetTestDatabase(prisma);
    await seedDatabase(prisma);
    admin = await login('admin@rephone.local', 'AdminDemo123');
    owner = await login('customer@rephone.local', 'CustomerDemo123');
    await prisma.affiliatePolicy.create({
      data: { enabled: true, rateBps: 300, reserveAmount: '100000', minimumProfit: '100000' },
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'customer@rephone.local' },
    });
    const profile = await prisma.affiliateProfile.create({
      data: {
        ownerUserId: user.id,
        code,
        displayName: 'CTV Demo',
        phone: '0900000000',
        promotionChannels: 'Facebook và website',
        termsVersion: 'affiliate-v1.0',
        termsAcceptedAt: new Date(),
        status: 'ACTIVE',
      },
    });
    profileId = profile.id;
    await prisma.affiliateBankAccount.create({
      data: {
        affiliateId: profileId,
        bankName: 'Bank Test',
        accountHolder: 'CTV Demo',
        accountCiphertext: app.get(AffiliateRuntime).encrypt('1234567890'),
        accountFingerprint: 'a'.repeat(64),
        lastFour: '7890',
        emailConfirmedAt: new Date(),
        verifiedAt: new Date(),
        effectiveAt: new Date(0),
      },
    });
    const unit = await prisma.inventoryUnit.findFirstOrThrow({
      where: {
        lifecycleStatus: 'AVAILABLE',
        salePrice: { not: null },
        variant: { status: 'ACTIVE', product: { status: 'ACTIVE' } },
      },
    });
    unitId = unit.id;
    inventoryCode = unit.inventoryCode;
    await prisma.inventoryUnit.update({
      where: { id: unitId },
      data: { acquisitionCost: '7000000', additionalCost: '0', salePrice: '10000000' },
    });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
    delete process.env['AFFILIATE_ENABLED'];
  });
  async function login(email: string, password: string) {
    return data(
      (await request(server).post('/api/v1/auth/login').send({ email, password }).expect(200)).body,
    )['accessToken'] as string;
  }
  function adminPost(path: string, body: object = {}) {
    return request(server)
      .post(`/api/v1/backoffice/affiliates/${path}`)
      .auth(admin, { type: 'bearer' })
      .send(body);
  }
  function withdraw(key = randomUUID()) {
    return request(server)
      .post('/api/v1/affiliate/payouts')
      .auth(owner, { type: 'bearer' })
      .send({ requestKey: key });
  }
  async function checkout(self = false, referralCode: string | string[] = code) {
    const agent = request.agent(server);
    for (const referral of Array.isArray(referralCode) ? referralCode : [referralCode])
      await agent
        .post('/api/v1/affiliate-program/referrals')
        .set(headers)
        .send({ code: referral })
        .expect(200);
    await agent
      .post('/api/v1/cart/items')
      .set(headers)
      .send({ itemType: 'IPHONE', inventoryCode })
      .expect(201);
    const preview = data(
      (
        await agent
          .post('/api/v1/checkouts/preview')
          .set(headers)
          .send({ fulfillmentType: 'PICKUP' })
          .expect(200)
      ).body,
    );
    const pricing = rec(preview['pricing']);
    const body = {
      fulfillmentType: 'PICKUP',
      contact: {
        fullName: 'Khách giới thiệu',
        email: self ? 'customer@rephone.local' : 'buyer@example.com',
        phone: self ? '0900000000' : '0912345678',
      },
      expectedPreviewFingerprint: preview['previewFingerprint'],
      expectedCartUpdatedAt: preview['cartUpdatedAt'],
      expectedGrandTotal: pricing['grandTotal'],
      expectedDepositRequired: pricing['depositRequired'],
    };
    const created = data(
      (await agent.post('/api/v1/checkouts').set(headers).send(body).expect(201)).body,
    );
    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: rec(created['order'])['orderNumber'] as string },
      include: { items: true },
    });
    return { agent, body, order };
  }
  async function mature() {
    const result = await checkout();
    const old = new Date(Date.now() - 15 * 86400_000);
    await prisma.order.update({
      where: { id: result.order.id },
      data: {
        status: 'COMPLETED',
        fulfillmentStatus: 'COMPLETED',
        paymentStatus: 'PAID',
        placedAt: old,
        confirmedAt: old,
        pickupReadyAt: old,
        pickedUpAt: old,
        completedAt: old,
        paidAmount: result.order.grandTotal,
        balanceDue: '0',
      },
    });
    await prisma.payment.create({
      data: {
        orderId: result.order.id,
        purpose: 'FULL_PAYMENT',
        method: 'CASH',
        expectedAmount: result.order.grandTotal,
        receivedAmount: result.order.grandTotal,
        status: 'VERIFIED',
        createdAt: old,
        reviewedAt: old,
        reviewedById: (
          await prisma.user.findUniqueOrThrow({ where: { normalizedEmail: 'admin@rephone.local' } })
        ).id,
      },
    });
    await app.get(AffiliateQueryService).reconcileBatch();
    return result.order;
  }
  async function refund(orderId: string, itemId: string, amount = '1000000') {
    return request(server)
      .post(`/api/v1/backoffice/orders/${orderId}/refunds`)
      .auth(admin, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({
        amount,
        method: 'CASH',
        reason: 'Kiểm thử hoàn tiền hợp lệ',
        allocations: [{ kind: 'ITEM', orderItemId: itemId, amount }],
      });
  }
  it('uses the most recent valid click and rejects expired attribution', async () => {
    const other = await prisma.user.create({
      data: {
        email: 'another@example.com',
        normalizedEmail: 'another@example.com',
        fullName: 'Another CTV',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        passwordHash: (
          await prisma.user.findUniqueOrThrow({
            where: { normalizedEmail: 'customer@rephone.local' },
          })
        ).passwordHash,
      },
    });
    const second = await prisma.affiliateProfile.create({
      data: {
        ownerUserId: other.id,
        code: 'bbbbbbbbbbbbbbbb',
        displayName: 'Second CTV',
        phone: '0987654321',
        promotionChannels: 'Website',
        termsVersion: 'affiliate-v1.0',
        termsAcceptedAt: new Date(),
        status: 'ACTIVE',
      },
    });
    const result = await checkout(false, [code, second.code]);
    expect((await prisma.affiliateAttribution.findFirstOrThrow()).affiliateId).toBe(second.id);
    const response = await result.agent
      .post('/api/v1/affiliate-program/referrals')
      .set(headers)
      .send({ code })
      .expect(200);
    const cookie =
      defined(defined(response.headers['set-cookie'] as unknown as string[])[0]).split(';')[0] ??
      '';
    // The converted cart is immutable: a later click cannot replace its affiliate.
    await result.agent.post('/api/v1/checkouts').set(headers).send(result.body).expect(200);
    expect(
      (await prisma.affiliateAttribution.findUniqueOrThrow({ where: { orderId: result.order.id } }))
        .affiliateId,
    ).toBe(second.id);
    // Capture for a separate existing order is suppressed after expiry.
    await prisma.affiliateReferral.updateMany({ data: { expiresAt: new Date(0) } });
    await prisma.$transaction((tx) =>
      app
        .get(AffiliateLedgerService)
        .capture(tx, result.order.id, { headers: { cookie } } as Request),
    );
    expect(await prisma.affiliateAttribution.count()).toBe(1);
  });
  it('keeps unpaid and recently completed commissions unavailable', async () => {
    const order = await mature();
    await prisma.payment.updateMany({
      where: { orderId: order.id },
      data: { reviewedAt: new Date() },
    });
    await app.get(AffiliateQueryService).reconcileBatch();
    expect((await prisma.affiliateCommission.findFirstOrThrow()).status).toBe('PENDING');
    await withdraw().expect(400);
  });
  it('suspension closes new referrals but preserves old earned withdrawals', async () => {
    await mature();
    await adminPost(`members/${profileId}`, {
      status: 'SUSPENDED',
      payoutHold: false,
      reason: 'Tạm ngừng giới thiệu mới',
      expectedVersion: 1,
    }).expect(200);
    const r = await request(server)
      .post('/api/v1/affiliate-program/referrals')
      .set(headers)
      .send({ code })
      .expect(200);
    expect(data(r.body)['captured']).toBe(false);
    await withdraw().expect(200);
  });
  it('confirms bank ownership and waits 24 hours for a replacement', async () => {
    const send = vi.spyOn(app.get<MailProvider>(MAIL_PROVIDER), 'send').mockResolvedValue();
    const r = await request(server)
      .post('/api/v1/affiliate/banks')
      .auth(owner, { type: 'bearer' })
      .send({
        bankName: 'Replacement',
        accountHolder: 'CTV Demo',
        accountNumber: '2345678910',
        currentPassword: 'CustomerDemo123',
      })
      .expect(200);
    const id = rec(data(r.body)['bank'])['id'] as string;
    await adminPost(`banks/${id}/verify`).expect(409);
    const token = defined(defined(send.mock.calls[0])[0].text.match(/bank-token=([\w-]{43})/))[1];
    await request(server)
      .post('/api/v1/affiliate/banks/confirm')
      .auth(owner, { type: 'bearer' })
      .send({ token })
      .expect(200);
    await adminPost(`banks/${id}/verify`).expect(200);
    const bank = await prisma.affiliateBankAccount.findUniqueOrThrow({ where: { id } });
    expect(defined(bank.effectiveAt).getTime() - defined(bank.verifiedAt).getTime()).toBe(
      86400_000,
    );
    await request(server)
      .post('/api/v1/affiliate/banks/confirm')
      .auth(owner, { type: 'bearer' })
      .send({ token })
      .expect(422);
  });
  it('refund allocations cannot name another order item or exceed their total', async () => {
    const order = await mature();
    expect((await refund(order.id, randomUUID())).status).toBe(400);
    expect((await refund(order.id, defined(order.items[0]).id, '10000001')).status).toBe(422);
  });
  it('missing cost preserves retail checkout without a commission', async () => {
    await prisma.inventoryUnit.update({ where: { id: unitId }, data: { acquisitionCost: null } });
    await checkout();
    expect(await prisma.affiliateCommission.count()).toBe(0);
  });
  it('a disabled machine override preserves retail checkout without a commission', async () => {
    await prisma.affiliateInventoryOverride.create({
      data: { inventoryUnitId: unitId, enabled: false },
    });
    await checkout();
    expect(await prisma.affiliateCommission.count()).toBe(0);
  });
  it('allocates cancellation overpayment from verified money before order projection catches up', async () => {
    const order = await mature();
    await prisma.payment.updateMany({
      where: { orderId: order.id, status: 'VERIFIED' },
      data: { method: 'BANK_TRANSFER', receivedAmount: '11000000' },
    });
    const allocations = await prisma.$transaction((tx) =>
      app.get(AffiliateLedgerService).cancellationAllocations(tx, order.id, 11000000n),
    );
    expect(allocations).toEqual([
      { kind: 'OVERPAYMENT', amount: '1000000' },
      { kind: 'ITEM', orderItemId: defined(order.items[0]).id, amount: '10000000' },
    ]);
  });
  it('requires role, validates rate cap and optimistic policy version', async () => {
    await request(server)
      .get('/api/v1/backoffice/affiliates/dashboard')
      .auth(owner, { type: 'bearer' })
      .expect(403);
    await adminPost('policy', {
      enabled: true,
      rateBps: 501,
      minimumProfit: '0',
      reserveAmount: '0',
      expectedVersion: 1,
    }).expect(400);
    await adminPost('policy', {
      enabled: false,
      rateBps: 200,
      minimumProfit: '0',
      reserveAmount: '0',
      expectedVersion: 0,
    }).expect(409);
    await adminPost('policy', {
      enabled: false,
      rateBps: 200,
      minimumProfit: '0',
      reserveAmount: '0',
      expectedVersion: 1,
    }).expect(200);
    expect(await prisma.affiliateCommission.count()).toBe(0);
  });
  it('captures HttpOnly referral, rejects CSRF and preserves old cookie on invalid link', async () => {
    await request(server).post('/api/v1/affiliate-program/referrals').send({ code }).expect(403);
    const agent = request.agent(server);
    const first = await agent
      .post('/api/v1/affiliate-program/referrals')
      .set(headers)
      .send({ code })
      .expect(200);
    expect(first.headers['set-cookie']?.toString()).toMatch(/HttpOnly/);
    expect(first.headers['set-cookie']?.toString()).toMatch(/SameSite=Lax/);
    const invalid = await agent
      .post('/api/v1/affiliate-program/referrals')
      .set(headers)
      .send({ code: 'ffffffffffffffff' })
      .expect(200);
    expect(data(invalid.body)['captured']).toBe(false);
    expect(invalid.headers['set-cookie']).toBeUndefined();
    const stored = await prisma.affiliateReferral.findFirstOrThrow();
    expect(stored.tokenHash).toHaveLength(64);
  });
  it('snapshots commission once on checkout retry and never leaks customer data', async () => {
    const { agent, body, order } = await checkout();
    await agent.post('/api/v1/checkouts').set(headers).send(body).expect(200);
    const c = await prisma.affiliateCommission.findFirstOrThrow();
    expect(c.amount.toString()).toBe('300000');
    expect(await prisma.affiliateCommission.count()).toBe(1);
    expect(c.orderId).toBe(order.id);
    const response = await request(server)
      .get('/api/v1/affiliate/dashboard')
      .auth(owner, { type: 'bearer' })
      .expect(200);
    expect(JSON.stringify(response.body)).not.toMatch(
      /buyer@example|0912345678|floorAmount|acquisitionCost|Ciphertext|tokenHash/,
    );
  });
  it('does not reward self referral', async () => {
    await checkout(true);
    expect(await prisma.affiliateCommission.count()).toBe(0);
  });
  it('serializes two withdrawals and replays same request without double reservation', async () => {
    await mature();
    const key = randomUUID();
    const results = await Promise.all([withdraw(key), withdraw(key)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(data(results[0].body)['id']).toBe(data(results[1].body)['id']);
    expect(await prisma.affiliatePayout.count()).toBe(1);
    expect(await prisma.affiliatePayoutItem.count({ where: { active: true } })).toBe(1);
    await withdraw().expect(409);
  });
  it('requires refund allocation and holds commission before withdrawal', async () => {
    const order = await mature();
    await request(server)
      .post(`/api/v1/backoffice/orders/${order.id}/refunds`)
      .auth(admin, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '1000000', method: 'CASH', reason: 'Hoàn theo yêu cầu khách' })
      .expect(400);
    expect((await refund(order.id, defined(order.items[0]).id)).status).toBe(201);
    await withdraw().expect(400);
    const c = await prisma.affiliateCommission.findFirstOrThrow();
    expect(c.paidAmount.toString()).toBe('0');
  });
  it('refund racing withdrawal never permits a transfer from an invalid source', async () => {
    const order = await mature();
    const results = await Promise.all([withdraw(), refund(order.id, defined(order.items[0]).id)]);
    expect(results[1].status).toBe(201);
    const p = await prisma.affiliatePayout.findFirst();
    if (p)
      await adminPost(`payouts/${p.id}`, {
        status: 'PROCESSING',
        note: 'Đối chiếu trước chuyển',
      }).expect(409);
    else expect(results[0].status).toBe(400);
  });
  it('records a real payout once, absorbs later item refund, and never creates negative balance', async () => {
    const order = await mature();
    const p = data((await withdraw().expect(200)).body);
    const id = p['id'] as string;
    await adminPost(`payouts/${id}`, {
      status: 'PROCESSING',
      note: 'Đã kiểm tra ngân hàng',
    }).expect(200);
    const transferredAt = new Date().toISOString();
    const complete = () =>
      request(server)
        .post(`/api/v1/backoffice/affiliates/payouts/${id}/complete`)
        .auth(admin, { type: 'bearer' })
        .field('transferReference', 'AFF-BANK-001')
        .field('transferredAt', transferredAt)
        .field('note', 'Đã kiểm tra chuyển thành công')
        .attach('file', proof, { filename: 'proof.png', contentType: 'image/png' });
    await complete().expect(200);
    await complete().expect(200);
    const ref = await refund(order.id, defined(order.items[0]).id, '10000000');
    expect(ref.status).toBe(201);
    await request(server)
      .post(`/api/v1/backoffice/refunds/${data(ref.body)['id'] as string}/start-processing`)
      .auth(admin, { type: 'bearer' })
      .send({ note: 'Đối chiếu khoản hoàn' })
      .expect(200);
    await request(server)
      .post(`/api/v1/backoffice/refunds/${data(ref.body)['id'] as string}/complete-cash`)
      .auth(admin, { type: 'bearer' })
      .send({ note: 'Đã trả tiền cho khách' })
      .expect(200);
    await app.get(AffiliateQueryService).reconcileBatch();
    const c = await prisma.affiliateCommission.findFirstOrThrow();
    expect(c.amount.toString()).toBe('0');
    expect(c.paidAmount.toString()).toBe('300000');
    expect(c.absorbedLoss.toString()).toBe('300000');
    expect(c.status).toBe('PAID');
  });
  it('does not release funds on an uncertain bank transfer without explicit reconciliation', async () => {
    await mature();
    const id = data((await withdraw().expect(200)).body)['id'] as string;
    await adminPost(`payouts/${id}`, {
      status: 'PROCESSING',
      note: 'Đang chuyển ngân hàng',
    }).expect(200);
    await adminPost(`payouts/${id}`, {
      status: 'NEEDS_REVIEW',
      note: 'Ngân hàng chưa phản hồi',
    }).expect(200);
    await adminPost(`payouts/${id}`, {
      status: 'CANCELLED',
      note: 'Thử hủy khi chưa rõ tiền',
    }).expect(400);
    expect(await prisma.affiliatePayoutItem.count({ where: { active: true } })).toBe(1);
    await adminPost(`payouts/${id}`, {
      status: 'CANCELLED',
      note: 'Đã đối chiếu chưa chuyển',
      confirmedNotTransferred: true,
    }).expect(200);
    expect((await prisma.affiliateCommission.findFirstOrThrow()).status).toBe('AVAILABLE');
  });
  it('deduplicates bank submissions even when email fails after commit', async () => {
    vi.spyOn(app.get<MailProvider>(MAIL_PROVIDER), 'send').mockRejectedValue(
      new Error('mail unavailable'),
    );
    const body = {
      bankName: 'New bank',
      accountHolder: 'CTV Demo',
      accountNumber: '9876543210',
      currentPassword: 'CustomerDemo123',
    };
    const send = () =>
      request(server).post('/api/v1/affiliate/banks').auth(owner, { type: 'bearer' }).send(body);
    const first = await send().expect(200);
    const second = await send().expect(200);
    expect(data(first.body)['emailStatus']).toBe('FAILED');
    expect(rec(data(first.body)['bank'])['id']).toBe(rec(data(second.body)['bank'])['id']);
    expect(await prisma.affiliateBankAccount.count()).toBe(2);
    expect(JSON.stringify(first.body)).not.toMatch(/9876543210|accountCiphertext|confirmationHash/);
  });
});
