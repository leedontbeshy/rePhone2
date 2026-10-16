import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { AuthRateLimiter } from '../../src/modules/auth/auth-rate-limiter.service.js';
import { BackofficeRateLimiter } from '../../src/modules/auth/backoffice-rate-limiter.service.js';
import { DealerRuntime, dealerHash } from '../../src/modules/dealers/dealer-runtime.service.js';
import { DealerPaymentService } from '../../src/modules/dealers/dealer-payment.service.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';
import { DealerWebhookService } from '../../src/modules/dealers/dealer-webhook.service.js';
import { DealerProfileService } from '../../src/modules/dealers/dealer-profile.service.js';
import { MAIL_PROVIDER, type MailProvider } from '../../src/common/providers/mail-provider.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { SerializableTransactionRunner } from '../../src/database/serializable-transaction.runner.js';
import { AuditWriter } from '../../src/modules/audit/audit-writer.service.js';
import { CheckoutCatalogReader } from '../../src/modules/catalog/checkout-catalog.reader.js';
import { sendDealerWebhook } from '../../src/modules/dealers/dealer-webhook.transport.js';
import { createHmac } from 'node:crypto';
import type * as DealerWebhookTransport from '../../src/modules/dealers/dealer-webhook.transport.js';
import { createOpenApiDocument } from '../../src/openapi/openapi.js';

vi.mock('../../src/modules/dealers/dealer-webhook.transport.js', async (importOriginal) => ({
  ...(await importOriginal<typeof DealerWebhookTransport>()),
  sendDealerWebhook: vi.fn().mockResolvedValue(204),
}));

const ADDRESS = {
  receiverName: 'Khách đại lý',
  phone: '0900000000',
  addressLine: '1 Nguyễn Huệ',
  ward: 'Bến Nghé',
  district: 'Quận 1',
  province: 'TP.HCM',
};
const PROOF = readFileSync(
  new URL('../../prisma/demo-assets/catalog/iphone-13.png', import.meta.url),
);
const KEY = 'rp_test_' + 'a'.repeat(43);
describe('Dealer commerce: real PostgreSQL and HTTP', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: Server;
  let dealerId: string;
  let adminToken: string;
  let ownerToken: string;
  let unitId: string;
  beforeAll(async () => {
    setTestEnvironment();
    process.env['DEALER_ENABLED'] = 'true';
    process.env['DEALER_ENVIRONMENT'] = 'TEST';
    const { createApplication } = await import('../../src/application.js');
    app = await createApplication({ enableSwagger: false });
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer() as Server;
    prisma = createTestPrisma();
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.mocked(sendDealerWebhook).mockReset().mockResolvedValue(204);
    app.get(AuthRateLimiter).clear();
    app.get(BackofficeRateLimiter).clear();
    await resetTestDatabase(prisma);
    await seedDatabase(prisma);
    await app.get(DealerRuntime).onModuleInit();
    adminToken = await login('admin@rephone.local', 'AdminDemo123');
    ownerToken = await login('customer@rephone.local', 'CustomerDemo123');
    const owner = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'customer@rephone.local' },
    });
    const admin = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'admin@rephone.local' },
    });
    const dealer = await prisma.dealerProfile.create({
      data: {
        ownerUserId: owner.id,
        legalName: 'Đại lý kiểm thử',
        businessType: 'COMPANY',
        taxCode: '0123456789',
        representativeName: 'Đại diện',
        businessAddress: 'TP.HCM',
        contactEmail: owner.email,
        contactPhone: '0900000000',
        displayName: 'Đại lý Demo',
        approvedDomains: ['example.com'],
        businessStatus: 'ACTIVE',
        termsVersion: 'dealer-v1.0',
        termsAcceptedAt: new Date(),
        approvedById: admin.id,
        approvedAt: new Date(),
      },
    });
    dealerId = dealer.id;
    await prisma.dealerBankAccount.create({
      data: {
        dealerId,
        bankName: 'Bank Test',
        accountNumberCiphertext: app.get(DealerRuntime).encrypt('0123456789'),
        accountLastFour: '6789',
        accountHolder: dealer.legalName,
        emailConfirmedAt: new Date(),
        verifiedAt: new Date(),
        verifiedById: admin.id,
        effectiveAt: new Date(),
      },
    });
    await prisma.dealerApiClient.create({
      data: {
        dealerId,
        name: 'Integration',
        keyHash: dealerHash(KEY),
        keyPrefix: KEY.slice(0, 16),
        environment: 'TEST',
        scopes: [
          'catalog:read',
          'orders:read',
          'orders:write',
          'payments:read',
          'payments:write',
          'after-sales:read',
          'after-sales:write',
        ],
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    await prisma.dealerPricingPolicy.update({
      where: { key: 'GLOBAL' },
      data: {
        enabled: true,
        reserveAmount: '100000',
        minimumProfit: '100000',
        supportedProvinces: ['TP.HCM'],
      },
    });
    const unit = await prisma.inventoryUnit.findFirstOrThrow({
      where: {
        lifecycleStatus: 'AVAILABLE',
        salePrice: { gt: 500000 },
        reservations: { none: { status: 'ACTIVE' } },
      },
    });
    unitId = unit.id;
    await prisma.inventoryUnit.update({
      where: { id: unitId },
      data: { acquisitionCost: '100000', additionalCost: '0' },
    });
  });
  afterAll(async () => {
    process.env['DEALER_ENABLED'] = 'false';
    await prisma.$disconnect();
    await app.close();
  });

  it('does not expose removed simulator routes or contracts when TEST dealer access is enabled', async () => {
    expect(app.get(DealerRuntime)).toMatchObject({ enabled: true, mode: 'TEST' });
    await request(server)
      .get('/api/v1/backoffice/dealers/sandbox/configuration')
      .set(adminHeaders())
      .expect(404);
    await request(server)
      .post(`/api/v1/backoffice/dealers/sandbox/orders/${randomUUID()}/simulate`)
      .set(adminHeaders())
      .send({ action: 'PAYMENT', reason: 'Removed route regression' })
      .expect(404);
    const document = createOpenApiDocument(app);
    expect(Object.keys(document.paths).some((path) => path.includes('/sandbox'))).toBe(false);
    expect(document.components?.schemas).not.toHaveProperty('DealerSimulationDto');
  });

  it('lists eligible offers before pagination, batches details and supports search, price sorting and condition filters', async () => {
    await prisma.inventoryUnit.updateMany({
      where: { lifecycleStatus: 'AVAILABLE' },
      data: { acquisitionCost: '100000', additionalCost: '0' },
    });
    const details = vi.spyOn(app.get(CheckoutCatalogReader), 'readLines');
    const getCatalog = async (query: Record<string, string | number>) =>
      data(
        (
          await request(server)
            .get('/api/v1/dealer/catalog')
            .set('X-Dealer-Api-Key', KEY)
            .query(query)
            .expect(200)
        ).body,
      );
    const all = await getCatalog({ pageSize: 100, sort: 'price-asc' });
    const offers = all['items'] as Array<Record<string, unknown>>;
    expect(offers.length).toBeGreaterThan(2);
    expect(details).toHaveBeenCalledTimes(1);
    expect(all).toMatchObject({ page: 1, pageSize: 100, hasMore: false });
    const prices = offers.map((item) => Number(item['dealerPrice']));
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(JSON.stringify(all)).not.toMatch(
      /acquisitionCost|additionalCost|minimumProfit|imei|Ciphertext/,
    );
    const [first, second, third] = offers;
    if (!first || !second || !third) throw new Error('Expected three available fixture machines');
    const byCode = await getCatalog({ q: `  ${String(first['inventoryCode']).toLowerCase()}  ` });
    expect(byCode['items'] as unknown[]).toHaveLength(1);
    const byWords = await getCatalog({ q: '  IPHONE    13  ', condition: 'A' });
    for (const offer of byWords['items'] as Array<Record<string, unknown>>) {
      expect(offer['productName']).toBe('iPhone 13');
      expect(offer['configuration']).toMatchObject({ conditionGrade: 'A' });
    }
    expect((byWords['items'] as unknown[]).length).toBeGreaterThan(0);
    const bySku = await getCatalog({ q: String(first['sku']) });
    expect(
      (bySku['items'] as Array<Record<string, unknown>>).some(
        (row) => row['inventoryUnitId'] === first['inventoryUnitId'],
      ),
    ).toBe(true);
    // Hide the cheapest offer. Its row must not consume a result slot.
    const admin = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'admin@rephone.local' },
    });
    await prisma.dealerInventoryOverride.create({
      data: {
        inventoryUnitId: String(first['inventoryUnitId']),
        enabled: false,
        reason: 'Test hidden offer pagination',
        updatedById: admin.id,
      },
    });
    const page1 = await getCatalog({ page: 1, pageSize: 1, sort: 'price-asc' });
    expect(page1).toMatchObject({
      hasMore: true,
      items: [{ inventoryUnitId: second['inventoryUnitId'] }],
    });
    const page2 = await getCatalog({ page: 2, pageSize: 1, sort: 'price-asc' });
    expect(page2).toMatchObject({ items: [{ inventoryUnitId: third['inventoryUnitId'] }] });
    const descending = await getCatalog({ sort: 'price-desc' });
    expect(
      (descending['items'] as Array<Record<string, unknown>>).map((item) =>
        Number(item['dealerPrice']),
      ),
    ).toEqual(prices.slice(1).reverse());
    expect(await getCatalog({ q: 'not-existing-machine' })).toMatchObject({
      items: [],
      hasMore: false,
    });
    await request(server)
      .get('/api/v1/dealer/catalog')
      .set('X-Dealer-Api-Key', KEY)
      .query({ sort: 'arbitrary', pageSize: 1000 })
      .expect(400);
  });

  it('saves a bank once when mail fails and simultaneous retries reuse the saved account', async () => {
    const send = vi
      .spyOn(app.get<MailProvider>(MAIL_PROVIDER), 'send')
      .mockRejectedValue(new Error('SMTP unavailable'));
    const body = {
      bankName: 'Retry Bank',
      accountNumber: '123456789012',
      accountHolder: 'Retry Dealer',
      currentPassword: 'CustomerDemo123',
    };
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        request(server)
          .post('/api/v1/dealer-portal/bank-accounts')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send(body)
          .expect(201),
      ),
    );
    const accounts = responses.map((response) => data(response.body));
    expect(new Set(accounts.map((row) => row['id'])).size).toBe(1);
    expect(accounts.map((row) => row['emailDelivery']).sort()).toEqual([
      'EXISTING',
      'EXISTING',
      'FAILED',
    ]);
    expect(send).toHaveBeenCalledTimes(2); // Bounded notification retry, same token.
    expect(
      await prisma.dealerBankAccount.count({ where: { dealerId, bankName: 'Retry Bank' } }),
    ).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'dealer.bank.requested' } })).toBe(1);
    expect(JSON.stringify(accounts)).not.toMatch(
      /123456789012|confirmationHash|confirmationExpiresAt|CustomerDemo123/,
    );
    expect(accounts[0]).toMatchObject({ emailConfirmedAt: null, verifiedAt: null });
    const replay = data(
      (
        await request(server)
          .post('/api/v1/dealer-portal/bank-accounts')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ ...body, bankName: '  retry  bank ', accountHolder: 'RETRY DEALER' })
          .expect(201)
      ).body,
    );
    expect(replay['id']).toBe(accounts[0]?.['id']);
    await request(server)
      .post('/api/v1/dealer-portal/bank-accounts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...body, accountNumber: '999956789012' })
      .expect(201);
    expect(
      await prisma.dealerBankAccount.count({ where: { dealerId, bankName: 'Retry Bank' } }),
    ).toBe(2);
  });

  it('resends on the same bank, limits parallel resends, and requires email plus admin verification before approval', async () => {
    const send = vi.spyOn(app.get<MailProvider>(MAIL_PROVIDER), 'send').mockResolvedValue();
    await prisma.dealerBankAccount.updateMany({
      where: { dealerId },
      data: { disabledAt: new Date() },
    });
    const profile = await prisma.dealerProfile.update({
      where: { id: dealerId },
      data: { businessStatus: 'PENDING' },
    });
    const account = data(
      (
        await request(server)
          .post('/api/v1/dealer-portal/bank-accounts')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({
            bankName: 'Confirm Bank',
            accountNumber: '123456789012',
            accountHolder: 'Test Dealer',
            currentPassword: 'CustomerDemo123',
          })
          .expect(201)
      ).body,
    );
    expect(account['emailDelivery']).toBe('SENT');
    const id = string(account['id']);
    const originalToken = new URL(
      string(send.mock.calls[0]?.[0].text.split(' ').at(-1)),
    ).hash.split('=')[1];
    const resendPath = `/api/v1/dealer-portal/bank-accounts/${id}/resend-confirmation`;
    const approve = () =>
      request(server)
        .post(`/api/v1/backoffice/dealers/${dealerId}/status`)
        .set(adminHeaders())
        .send({
          action: 'APPROVE',
          reason: 'Kiểm tra đủ điều kiện',
          expectedVersion: profile.version,
        });
    await approve().expect(409);
    await request(server)
      .post(resendPath)
      .set(adminHeaders())
      .send({ currentPassword: 'AdminDemo123' })
      .expect(403);
    await request(server)
      .post(resendPath)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ currentPassword: 'incorrect' })
      .expect(422);
    await request(server)
      .post(resendPath)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ currentPassword: 'CustomerDemo123' })
      .expect(429);
    await prisma.dealerBankAccount.update({
      where: { id },
      data: { confirmationExpiresAt: new Date(Date.now() + 28 * 60_000) },
    });
    const results = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(server)
          .post(resendPath)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ currentPassword: 'CustomerDemo123' }),
      ),
    );
    expect(results.map((response) => response.status).sort()).toEqual([200, 429]);
    expect(
      await prisma.dealerBankAccount.count({ where: { dealerId, bankName: 'Confirm Bank' } }),
    ).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
    const latestToken = new URL(string(send.mock.calls[1]?.[0].text.split(' ').at(-1))).hash.split(
      '=',
    )[1];
    const confirm = (token: string | undefined) =>
      request(server)
        .post('/api/v1/dealer-portal/bank-accounts/confirm')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ token });
    await confirm(originalToken).expect(422);
    await confirm(latestToken).expect(200);
    await confirm(latestToken).expect(422);
    await approve().expect(409);
    await request(server)
      .post(`/api/v1/backoffice/dealers/bank-accounts/${id}/verify`)
      .set(adminHeaders())
      .expect(200);
    // Previous verified bank means the replacement must still cool for 24 hours.
    await approve().expect(409);
    await prisma.dealerBankAccount.update({
      where: { id },
      data: { effectiveAt: new Date(Date.now() - 1000) },
    });
    await approve().expect(200);
    await request(server)
      .post(resendPath)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ currentPassword: 'CustomerDemo123' })
      .expect(409);
  });

  it('lets only admins pause new business while old orders and payment continue', async () => {
    const order = await createOrder();
    const config = data(
      (
        await request(server)
          .get('/api/v1/backoffice/dealers/configuration')
          .set(adminHeaders())
          .expect(200)
      ).body,
    );
    expect(config).toMatchObject({
      enabled: true,
      open: true,
      pricingReady: true,
      environment: 'TEST',
    });
    expect(config).not.toHaveProperty('simulationEnabled');
    expect(config['connection']).toEqual({ apiBaseUrl: 'http://localhost:4001/api/v1' });
    const body = {
      open: false,
      expectedVersion: config['version'],
      reason: 'Tạm đóng để kiểm tra vận hành',
    };
    await request(server)
      .post('/api/v1/backoffice/dealers/configuration')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(body)
      .expect(403);
    const employeeToken = await login('employee@rephone.local', 'EmployeeDemo123');
    await request(server)
      .post('/api/v1/backoffice/dealers/configuration')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send(body)
      .expect(403);
    const closed = data(
      (
        await request(server)
          .post('/api/v1/backoffice/dealers/configuration')
          .set(adminHeaders())
          .send(body)
          .expect(200)
      ).body,
    );
    expect(closed['open']).toBe(false);
    await request(server)
      .post('/api/v1/backoffice/dealers/configuration')
      .set(adminHeaders())
      .send(body)
      .expect(409);
    const portal = data(
      (
        await request(server)
          .get('/api/v1/dealer-portal/configuration')
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(200)
      ).body,
    );
    expect(portal).toMatchObject({ enabled: true, open: false });
    await request(server)
      .post('/api/v1/dealer/orders/preview')
      .set('X-Dealer-Api-Key', KEY)
      .send({ inventoryUnitId: unitId, shippingAddress: ADDRESS })
      .expect(409);
    await request(server)
      .get(`/api/v1/dealer/orders/${string(order['id'])}`)
      .set('X-Dealer-Api-Key', KEY)
      .expect(200);
    await request(server)
      .post('/api/v1/backoffice/dealers/receipts')
      .set(adminHeaders())
      .send(receipt(string(order['id']), string(order['grandTotal']), 'PAY-WHILE-CLOSED'))
      .expect(201);
    await request(server)
      .post('/api/v1/dealer-portal/application')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        legalName: 'Đại lý đăng ký khi đóng',
        businessType: 'INDIVIDUAL',
        representativeName: 'Người thử nghiệm',
        businessAddress: 'Địa chỉ thử nghiệm',
        contactEmail: 'dealer@example.test',
        contactPhone: '0900000000',
        displayName: 'Đại lý mới',
        approvedDomains: [],
        termsVersion: 'dealer-v1.0',
      })
      .expect(503);
    const reopened = data(
      (
        await request(server)
          .post('/api/v1/backoffice/dealers/configuration')
          .set(adminHeaders())
          .send({ ...body, open: true, expectedVersion: closed['version'] })
          .expect(200)
      ).body,
    );
    expect(reopened['open']).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'dealer.channel.updated' } })).toBe(2);
  });

  it('requires a pricing floor before opening and exposes per-unit prices to admins only', async () => {
    await prisma.dealerPricingPolicy.update({
      where: { key: 'GLOBAL' },
      data: { enabled: false, reserveAmount: null, minimumProfit: null },
    });
    const policy = await prisma.dealerPricingPolicy.findUniqueOrThrow({ where: { key: 'GLOBAL' } });
    await request(server)
      .post('/api/v1/backoffice/dealers/configuration')
      .set(adminHeaders())
      .send({ open: true, expectedVersion: policy.version, reason: 'Thử mở khi chưa có sàn' })
      .expect(400);
    await prisma.dealerPricingPolicy.update({
      where: { key: 'GLOBAL' },
      data: { reserveAmount: '100000', minimumProfit: '100000', discountBps: 500 },
    });
    await prisma.inventoryUnit.update({
      where: { id: unitId },
      data: { salePrice: '10000000', acquisitionCost: '9000000', additionalCost: '0' },
    });
    const path = `/api/v1/backoffice/dealers/inventory/${unitId}/pricing`;
    await request(server).get(path).set('Authorization', `Bearer ${ownerToken}`).expect(403);
    const employeeToken = await login('employee@rephone.local', 'EmployeeDemo123');
    await request(server).get(path).set('Authorization', `Bearer ${employeeToken}`).expect(403);
    const price = data((await request(server).get(path).set(adminHeaders()).expect(200)).body);
    expect(price).toMatchObject({
      dealerPrice: '9500000',
      floorPrice: '9200000',
      overridePrice: null,
      channelOpen: false,
    });
    await request(server)
      .post(path)
      .set(adminHeaders())
      .send({ enabled: true, price: '9100000', reason: 'Thử giá dưới sàn' })
      .expect(400);
    await request(server)
      .post(path)
      .set(adminHeaders())
      .send({ enabled: true, price: '9400000', reason: 'Áp giá riêng cho máy' })
      .expect(200);
    expect(
      data((await request(server).get(path).set(adminHeaders()).expect(200)).body),
    ).toMatchObject({ dealerPrice: '9400000', overridePrice: '9400000' });
    await request(server)
      .post(path)
      .set(adminHeaders())
      .send({ enabled: true, reason: 'Trở lại giá tự tính' })
      .expect(200);
    expect(
      data((await request(server).get(path).set(adminHeaders()).expect(200)).body),
    ).toMatchObject({ dealerPrice: '9500000', overridePrice: null });
  });

  it('previews without holding, snapshots one unit, durably replays and hides the order from storefront', async () => {
    const body = await quote('EXT-001');
    expect(await prisma.inventoryReservation.count()).toBe(0);
    const created = await postOrder(body, 'idem-dealer-00000001').expect(201);
    const order = object(data(created.body)['order']);
    const id = string(order['id']);
    const detail = await prisma.dealerOrderDetail.findUniqueOrThrow({ where: { orderId: id } });
    expect(detail.commercialSnapshot).toMatchObject({
      commercialModel: 'DEALER_RESALE',
      sellerOfRecord: 'DEALER',
      refundRecipient: 'DEALER',
    });
    const replay = await postOrder(body, 'idem-dealer-00000001').expect(201);
    expect(data(replay.body)['replayed']).toBe(true);
    await postOrder({ ...body, note: 'Different payload' }, 'idem-dealer-00000001').expect(409);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.cart.count()).toBe(0);
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.dealerPaymentRequest.count()).toBe(1);
    expect(await prisma.inventoryReservation.count({ where: { status: 'ACTIVE' } })).toBe(1);
    await request(server)
      .get(`/api/v1/orders/${string(order['orderNumber'])}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
    const response = await request(server)
      .get(`/api/v1/dealer/orders/${id}`)
      .set('X-Dealer-Api-Key', KEY)
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(response.body)).not.toMatch(
      /acquisitionCost|minimumProfit|imei1|keyHash|evidenceObjectPath|accountNumberCiphertext/,
    );
    expect(await prisma.dealerOutboxEvent.count({ where: { resourceId: id } })).toBeGreaterThan(0);
  });

  it('lets only one of two concurrent creates reserve the physical unit', async () => {
    const first = await quote('RACE-A');
    const second = { ...first, externalOrderId: 'RACE-B' };
    const outcomes = await Promise.all([
      postOrder(first, 'concurrent-key-000001'),
      postOrder(second, 'concurrent-key-000002'),
    ]);
    expect(outcomes.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(
      await prisma.inventoryReservation.count({
        where: { inventoryUnitId: unitId, status: 'ACTIVE' },
      }),
    ).toBe(1);
  });

  it('keeps bank overpayment separate and fully funds the order only after verified allocations', async () => {
    const order = await createOrder();
    const id = string(order['id']);
    const total = BigInt(string(order['grandTotal']));
    const proofRequest = object((order['paymentRequests'] as unknown[])[0]);
    await request(server)
      .post(`/api/v1/dealer/payment-requests/${string(proofRequest['id'])}/proofs`)
      .set('X-Dealer-Api-Key', KEY)
      .attach('file', PROOF, { filename: 'proof.png', contentType: 'image/png' })
      .expect(201);
    expect((await prisma.order.findUniqueOrThrow({ where: { id } })).paidAmount.toString()).toBe(
      '0',
    );
    const partial = receipt(id, '100000', 'BANK-PARTIAL');
    await request(server)
      .post('/api/v1/backoffice/dealers/receipts')
      .set(adminHeaders())
      .send(partial)
      .expect(201);
    const detail = await prisma.dealerOrderDetail.findUniqueOrThrow({ where: { orderId: id } });
    expect(detail.balanceDeadlineAt).not.toBeNull();
    await request(server)
      .post('/api/v1/backoffice/dealers/receipts')
      .set(adminHeaders())
      .send(partial)
      .expect(201);
    expect(await prisma.dealerPaymentAllocation.count()).toBe(1);
    await request(server)
      .post('/api/v1/backoffice/dealers/receipts')
      .set(adminHeaders())
      .send(receipt(id, (total - 100000n + 50000n).toString(), 'BANK-BALANCE'))
      .expect(201);
    const funded = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(funded.status).toBe('CONFIRMED');
    expect(funded.balanceDue.toString()).toBe('0');
    expect(funded.paidAmount.toString()).toBe(total.toString());
    const refund = await prisma.refund.findFirstOrThrow({ where: { dealerId } });
    expect(refund.orderId).toBeNull();
    expect(refund.amount.toString()).toBe('50000');
    expect(
      (await prisma.dealerOrderDetail.findUniqueOrThrow({ where: { orderId: id } }))
        .balanceDeadlineAt,
    ).toEqual(detail.balanceDeadlineAt);
    expect(
      (await prisma.inventoryReservation.findFirstOrThrow({ where: { orderId: id } })).holdReason,
    ).toBe('FULFILLMENT');
  });

  it('arbitrates the same physical machine between retail checkout and a dealer order', async () => {
    const headers = {
      Origin: 'http://localhost:3001',
      'X-Rephone-CSRF': '1',
      Authorization: `Bearer ${ownerToken}`,
    };
    const unit = await prisma.inventoryUnit.findUniqueOrThrow({ where: { id: unitId } });
    await request(server)
      .post('/api/v1/cart/items')
      .set(headers)
      .send({ itemType: 'IPHONE', inventoryCode: unit.inventoryCode })
      .expect(201);
    const retail = data(
      (
        await request(server)
          .post('/api/v1/checkouts/preview')
          .set(headers)
          .send({ fulfillmentType: 'SHIPPING' })
          .expect(200)
      ).body,
    );
    const pricing = object(retail['pricing']);
    const dealer = await quote('CROSS-CHANNEL');
    const results = await Promise.all([
      postOrder(dealer, 'cross-channel-key-001'),
      request(server).post('/api/v1/checkouts').set(headers).send({
        fulfillmentType: 'SHIPPING',
        contact: dealer.contact,
        shippingAddress: ADDRESS,
        expectedPreviewFingerprint: retail['previewFingerprint'],
        expectedCartUpdatedAt: retail['cartUpdatedAt'],
        expectedGrandTotal: pricing['grandTotal'],
        expectedDepositRequired: pricing['depositRequired'],
      }),
    ]);
    expect(results.map((row) => row.status).sort()).toEqual([201, 409]);
    expect(
      await prisma.inventoryReservation.count({
        where: { inventoryUnitId: unitId, status: 'ACTIVE' },
      }),
    ).toBe(1);
    expect(await prisma.order.count()).toBe(1);
  });

  it('serializes expiration against bank verification without losing money or reviving cancelled orders', async () => {
    const order = await createOrder();
    const id = string(order['id']);
    await prisma.dealerOrderDetail.update({
      where: { orderId: id },
      data: { submissionDeadlineAt: new Date(Date.now() - 1000) },
    });
    const [, response] = await Promise.all([
      app.get(DealerPaymentService).expireDue(),
      request(server)
        .post('/api/v1/backoffice/dealers/receipts')
        .set(adminHeaders())
        .send(receipt(id, string(order['grandTotal']), 'EXPIRY-RACE')),
    ]);
    expect(response.status).toBe(201);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(['CANCELLED', 'CONFIRMED']).toContain(saved.status);
    expect(await prisma.dealerBankTransaction.count()).toBe(1);
    if (saved.status === 'CANCELLED') {
      expect(
        await prisma.inventoryReservation.count({ where: { orderId: id, status: 'ACTIVE' } }),
      ).toBe(0);
      expect(await prisma.dealerPaymentAllocation.count()).toBe(0);
      expect(await prisma.refund.count({ where: { dealerId } })).toBe(1);
    } else {
      expect(saved.paidAmount.toString()).toBe(order['grandTotal']);
      expect(
        await prisma.inventoryReservation.count({ where: { orderId: id, status: 'ACTIVE' } }),
      ).toBe(1);
    }
  });

  it('requires payment scope for bank instructions even when the key can read orders', async () => {
    const order = await createOrder();
    const id = string(order['id']);
    await prisma.dealerApiClient.update({
      where: { keyHash: dealerHash(KEY) },
      data: { scopes: ['orders:read'] },
    });
    const response = await request(server)
      .get(`/api/v1/dealer/orders/${id}`)
      .set('X-Dealer-Api-Key', KEY)
      .expect(200);
    expect(data(response.body)['paymentRequests']).toEqual([]);
    await request(server)
      .get(`/api/v1/dealer/orders/${id}/payment-requests`)
      .set('X-Dealer-Api-Key', KEY)
      .expect(403);
    expect(JSON.stringify(response.body)).not.toContain('bankAccountNumber');
  });

  it('settles failed shipping once and keeps returned inventory under inspection before refunding', async () => {
    const order = await createOrder();
    const id = string(order['id']);
    await fundOrder(order, 'RETURNED-ORDER');
    const shipmentId = await handOverOrder(id);
    await shipmentCommand(shipmentId, 'mark-failed', { reason: 'Khách từ chối nhận máy' }).expect(
      200,
    );
    const saved = await prisma.order.findUniqueOrThrow({ where: { id } });
    await shipmentCommand(shipmentId, 'mark-returned', {
      reason: 'Đã nhận lại máy từ đơn vị vận chuyển',
      returnedToLocationId: string(saved.fulfillmentLocationId),
    }).expect(200);
    await cancelDealerOrder(id).expect(409);
    await request(server)
      .post(`/api/v1/backoffice/dealers/orders/${id}/return-settlement`)
      .set(adminHeaders())
      .send({
        responsibleParty: 'DEALER',
        outboundCost: '30000',
        returnCost: '20000',
        agreement: 'Đại lý chịu phí theo chứng từ giao hàng',
        reason: 'Khách từ chối nhận máy',
      })
      .expect(200);
    await cancelDealerOrder(id).expect(200);
    await cancelDealerOrder(id).expect(200);
    const refunds = await prisma.refund.findMany({ where: { orderId: id } });
    expect(refunds).toHaveLength(1);
    const firstRefund = refunds[0];
    if (firstRefund === undefined) throw new Error('Expected reserved refund');
    expect(firstRefund.amount.toString()).toBe(
      (BigInt(string(order['grandTotal'])) - 50000n).toString(),
    );
    expect(
      (await prisma.inventoryUnit.findUniqueOrThrow({ where: { id: unitId } })).lifecycleStatus,
    ).toBe('INSPECTING');
    for (const action of ['START', 'MARK_SENT'])
      await request(server)
        .post(`/api/v1/backoffice/dealers/refunds/${firstRefund.id}/actions`)
        .set(adminHeaders())
        .send({ action, reason: 'Đã đối chiếu và xử lý hoàn tiền cho đại lý' })
        .expect(200);
    await request(server)
      .post(`/api/v1/backoffice/dealers/refunds/${firstRefund.id}/complete`)
      .set(adminHeaders())
      .attach('file', PROOF, { filename: 'refund.png', contentType: 'image/png' })
      .expect(200);
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: firstRefund.id } })).status).toBe(
      'COMPLETED',
    );
  });

  it('does not resurrect an expired order when money arrives late', async () => {
    const order = await createOrder();
    const id = string(order['id']);
    await prisma.dealerOrderDetail.update({
      where: { orderId: id },
      data: { submissionDeadlineAt: new Date(Date.now() - 1000) },
    });
    await app.get(DealerPaymentService).expireDue();
    await request(server)
      .post('/api/v1/backoffice/dealers/receipts')
      .set(adminHeaders())
      .send(receipt(id, string(order['grandTotal']), 'LATE-MONEY'))
      .expect(201);
    expect((await prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe('CANCELLED');
    expect(
      await prisma.inventoryReservation.count({ where: { orderId: id, status: 'ACTIVE' } }),
    ).toBe(0);
    expect(await prisma.dealerPaymentAllocation.count()).toBe(0);
    expect((await prisma.refund.findFirstOrThrow({ where: { dealerId } })).amount.toString()).toBe(
      order['grandTotal'],
    );
  });

  it('preserves old-order reads during business suspension but rejects all locked credentials', async () => {
    const order = await createOrder();
    await prisma.dealerProfile.update({
      where: { id: dealerId },
      data: { businessStatus: 'BUSINESS_SUSPENDED' },
    });
    await request(server)
      .get(`/api/v1/dealer/orders/${string(order['id'])}`)
      .set('X-Dealer-Api-Key', KEY)
      .expect(200);
    await request(server)
      .post('/api/v1/dealer/orders/preview')
      .set('X-Dealer-Api-Key', KEY)
      .send({ inventoryUnitId: unitId, shippingAddress: ADDRESS })
      .expect(403);
    await prisma.dealerProfile.update({
      where: { id: dealerId },
      data: { securityStatus: 'SECURITY_LOCKED' },
    });
    await request(server)
      .get(`/api/v1/dealer/orders/${string(order['id'])}`)
      .set('X-Dealer-Api-Key', KEY)
      .expect(403);
  });

  it('pauses proof review, resumes remaining time, and rejects reuse of rejected evidence', async () => {
    const order = await createOrder();
    const id = string(order['id']);
    const payment = object((order['paymentRequests'] as unknown[])[0]);
    const paymentId = string(payment['id']);
    const proof = await request(server)
      .post(`/api/v1/dealer/payment-requests/${paymentId}/proofs`)
      .set('X-Dealer-Api-Key', KEY)
      .attach('file', PROOF, { filename: 'proof.png', contentType: 'image/png' })
      .expect(201);
    const proofId = string(data(proof.body)['id']);
    await request(server)
      .post(`/api/v1/dealer/payment-requests/${paymentId}/proofs`)
      .set('X-Dealer-Api-Key', KEY)
      .attach('file', PROOF, { filename: 'proof.png', contentType: 'image/png' })
      .expect(201);
    expect(await prisma.dealerPaymentProof.count()).toBe(1);
    await prisma.dealerOrderDetail.update({
      where: { orderId: id },
      data: { submissionDeadlineAt: new Date(Date.now() - 1000) },
    });
    expect(await app.get(DealerPaymentService).expireDue()).toBe(0);
    const remaining = (await prisma.dealerOrderDetail.findUniqueOrThrow({ where: { orderId: id } }))
      .submissionRemainingMs;
    await request(server)
      .post(`/api/v1/backoffice/dealers/proofs/${proofId}/reject`)
      .set(adminHeaders())
      .send({ reason: 'Chứng từ không khớp giao dịch' })
      .expect(200);
    const detail = await prisma.dealerOrderDetail.findUniqueOrThrow({ where: { orderId: id } });
    expect(detail.reviewStartedAt).toBeNull();
    expect(detail.submissionDeadlineAt.getTime() - Date.now()).toBeGreaterThan(
      (remaining ?? 0) - 5000,
    );
    await request(server)
      .post(`/api/v1/dealer/payment-requests/${paymentId}/proofs`)
      .set('X-Dealer-Api-Key', KEY)
      .attach('file', PROOF, { filename: 'proof.png', contentType: 'image/png' })
      .expect(400);
  });

  it('splits refund obligations by source and prevents concurrent over-refund and replay', async () => {
    const order = await createOrder();
    const id = string(order['id']);
    const total = BigInt(string(order['grandTotal']));
    await request(server)
      .post('/api/v1/backoffice/dealers/receipts')
      .set(adminHeaders())
      .send(receipt(id, '100000', 'FIRST'))
      .expect(201);
    await request(server)
      .post('/api/v1/backoffice/dealers/receipts')
      .set(adminHeaders())
      .send(receipt(id, (total - 100000n).toString(), 'SECOND'))
      .expect(201);
    const body = {
      dealerId,
      orderId: id,
      amount: total.toString(),
      reason: 'Hoàn toàn bộ theo thỏa thuận',
    };
    const send = (key: string) =>
      request(server)
        .post('/api/v1/backoffice/dealers/refunds')
        .set(adminHeaders())
        .set('Idempotency-Key', key)
        .send(body);
    const outcomes = await Promise.all([
      send('refund-command-00001'),
      send('refund-command-00002'),
    ]);
    expect(outcomes.map((row) => row.status).sort()).toEqual([201, 422]);
    const winner = outcomes[0].status === 201 ? 'refund-command-00001' : 'refund-command-00002';
    await send(winner).expect(201);
    const refunds = await prisma.refund.findMany({
      where: { orderId: id },
      include: { dealerSources: true },
    });
    expect(refunds).toHaveLength(2);
    expect(refunds.every((row) => row.dealerSources.length === 1)).toBe(true);
    expect(refunds.reduce((sum, row) => sum + BigInt(row.amount.toString()), 0n)).toBe(total);
    const response = await request(server)
      .post(`/api/v1/backoffice/orders/${id}/shipment`)
      .set(adminHeaders())
      .send({ carrierName: 'Test', trackingCode: 'NO-SHIP' });
    expect(response.status).not.toBe(201);
    expect(await prisma.shipment.count()).toBe(0);
  });

  it('enforces immutable receipts and aggregate allocation limits in PostgreSQL', async () => {
    const order = await createOrder();
    const id = string(order['id']);
    await request(server)
      .post('/api/v1/backoffice/dealers/receipts')
      .set(adminHeaders())
      .send(receipt(id, '100000', 'DB-CAPS'))
      .expect(201);
    const bank = await prisma.dealerBankTransaction.findFirstOrThrow();
    const allocation = await prisma.dealerPaymentAllocation.findFirstOrThrow();
    await expect(
      prisma.dealerBankTransaction.update({
        where: { id: bank.id },
        data: { receivedAmount: '200000' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.dealerPaymentAllocation.create({
        data: {
          orderId: id,
          bankTransactionId: bank.id,
          paymentRequestId: allocation.paymentRequestId,
          amount: '1',
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.dealerOrderDetail.update({
        where: { orderId: id },
        data: { brandSnapshot: { displayName: 'Modified' } },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.order.update({ where: { id }, data: { dealerId: randomUUID() } }),
    ).rejects.toThrow();
  });

  it('holds payout when a destination is disabled and never silently switches a refund snapshot', async () => {
    const order = await createOrder();
    const id = string(order['id']);
    await request(server)
      .post('/api/v1/backoffice/dealers/receipts')
      .set(adminHeaders())
      .send(receipt(id, string(order['grandTotal']), 'REFUND-BANK'))
      .expect(201);
    await request(server)
      .post(`/api/v1/dealer/orders/${id}/cancel`)
      .set('X-Dealer-Api-Key', KEY)
      .send({ reason: 'Khách thay đổi nhu cầu' })
      .expect(200);
    const refund = await prisma.refund.findFirstOrThrow({ where: { orderId: id } });
    const oldSnapshot = refund.destinationSnapshot;
    await request(server)
      .post(`/api/v1/backoffice/dealers/refunds/${refund.id}/actions`)
      .set(adminHeaders())
      .send({ action: 'START', reason: 'Chuẩn bị hoàn cho đại lý' })
      .expect(200);
    await request(server)
      .post(
        `/api/v1/backoffice/dealers/bank-accounts/${string(refund.dealerBankAccountId)}/disable`,
      )
      .set(adminHeaders())
      .send({ reason: 'Đại lý báo tài khoản mất an toàn' })
      .expect(200);
    const held = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(held.payoutHold).toBe(true);
    expect(held.destinationSnapshot).toEqual(oldSnapshot);
    await request(server)
      .get(`/api/v1/backoffice/dealers/refunds/${refund.id}/destination`)
      .set(adminHeaders())
      .expect(409);
    await request(server)
      .post(`/api/v1/backoffice/dealers/refunds/${refund.id}/actions`)
      .set(adminHeaders())
      .send({ action: 'CANCEL', reason: 'Không được xóa nghĩa vụ đang xử lý' })
      .expect(409);
  });

  it('requires cooling for a replacement bank and revokes all keys on a security lock', async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'admin@rephone.local' },
    });
    const bank = await prisma.dealerBankAccount.create({
      data: {
        dealerId,
        bankName: 'NEW TEST BANK',
        accountNumberCiphertext: app.get(DealerRuntime).encrypt('1111111111'),
        accountLastFour: '1111',
        accountHolder: 'Đại lý',
        emailConfirmedAt: new Date(),
      },
    });
    const before = Date.now();
    await request(server)
      .post(`/api/v1/backoffice/dealers/bank-accounts/${bank.id}/verify`)
      .set(adminHeaders())
      .expect(200);
    const verified = await prisma.dealerBankAccount.findUniqueOrThrow({ where: { id: bank.id } });
    expect(verified.verifiedById).toBe(admin.id);
    if (verified.effectiveAt === null) throw new Error('Missing bank activation time');
    expect(verified.effectiveAt.getTime() - before).toBeGreaterThanOrEqual(86400_000);
    await request(server)
      .post(`/api/v1/backoffice/dealers/${dealerId}/status`)
      .set(adminHeaders())
      .send({ action: 'LOCK', expectedVersion: 1, reason: 'Kiểm thử thu hồi truy cập' })
      .expect(200);
    expect(await prisma.dealerApiClient.count({ where: { dealerId, revokedAt: null } })).toBe(0);
    await request(server).get('/api/v1/dealer/orders').set('X-Dealer-Api-Key', KEY).expect(401);
    await request(server)
      .get('/api/v1/dealer-portal/profile')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(401);
  });

  it('isolates scopes, tenants and server credentials', async () => {
    const order = await createOrder();
    const id = string(order['id']);
    const key = await prisma.dealerApiClient.findFirstOrThrow();
    await prisma.dealerApiClient.update({
      where: { id: key.id },
      data: { scopes: ['orders:read'] },
    });
    await request(server).get('/api/v1/dealer/catalog').set('X-Dealer-Api-Key', KEY).expect(403);
    await request(server)
      .get(`/api/v1/dealer/orders/${id}`)
      .set('X-Dealer-Api-Key', KEY)
      .set('Origin', 'https://example.com')
      .expect(403);
    await request(server)
      .get(`/api/v1/dealer/orders/${id}`)
      .set('X-Dealer-Api-Key', KEY.replace('rp_test_', 'rp_live_'))
      .expect(401);
    const seedOwner = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'customer@rephone.local' },
    });
    const user = await prisma.user.create({
      data: {
        email: 'other-dealer@example.test',
        normalizedEmail: 'other-dealer@example.test',
        fullName: 'Other dealer',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        passwordHash: seedOwner.passwordHash,
      },
    });
    const other = await prisma.dealerProfile.create({
      data: {
        ownerUserId: user.id,
        legalName: 'Other Company',
        businessType: 'COMPANY',
        representativeName: 'Other',
        businessAddress: 'Other Address',
        contactEmail: user.email,
        contactPhone: '0900000001',
        displayName: 'Other',
        termsVersion: 'dealer-v1.0',
        termsAcceptedAt: new Date(),
        businessStatus: 'ACTIVE',
      },
    });
    const otherOwnerToken = await login('other-dealer@example.test', 'CustomerDemo123');
    const originalBank = await prisma.dealerBankAccount.findFirstOrThrow({ where: { dealerId } });
    await request(server)
      .post(`/api/v1/dealer-portal/bank-accounts/${originalBank.id}/resend-confirmation`)
      .set('Authorization', `Bearer ${otherOwnerToken}`)
      .send({ currentPassword: 'CustomerDemo123' })
      .expect(404);
    await prisma.dealerApiClient.update({ where: { id: key.id }, data: { dealerId: other.id } });
    await request(server)
      .get(`/api/v1/dealer/orders/${id}`)
      .set('X-Dealer-Api-Key', KEY)
      .expect(404);
    expect(await prisma.dealerPaymentProof.count()).toBe(0);
  });

  it('runs funded dealer shipping and protected warranty intake through normal admin commands', async () => {
    const order = await createOrder();
    const id = string(order['id']);
    await orderCommand(id, 'start-preparing').expect(409);
    expect(await prisma.shipment.count()).toBe(0);
    await fundOrder(order, 'WARRANTY-INTAKE');
    const shipmentId = await handOverOrder(id);
    await shipmentCommand(shipmentId, 'mark-delivered', { confirmCodCollected: false }).expect(200);
    await shipmentCommand(shipmentId, 'mark-delivered', { confirmCodCollected: false }).expect(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe('COMPLETED');
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.warranty.count()).toBe(1);
    const response = await request(server)
      .get(`/api/v1/dealer/orders/${id}/warranties`)
      .set('X-Dealer-Api-Key', KEY)
      .expect(200);
    expect(JSON.stringify(response.body)).not.toMatch(/dealerPrice|grandTotal|bankAccount|imei/);
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: id } });
    const body = {
      orderItemId: item.id,
      type: 'WARRANTY',
      issueDescription: 'Máy không lên màn hình khi khởi động',
    };
    const send = () =>
      request(server)
        .post('/api/v1/dealer/after-sales')
        .set('X-Dealer-Api-Key', KEY)
        .set('Idempotency-Key', 'warranty-request-0001')
        .send(body);
    const first = await send().expect(201);
    await send().expect(201);
    expect(await prisma.afterSalesRequest.count()).toBe(1);
    await prisma.dealerProfile.update({
      where: { id: dealerId },
      data: { businessStatus: 'BUSINESS_SUSPENDED' },
    });
    await request(server)
      .get(`/api/v1/dealer/after-sales/${string(data(first.body)['id'])}`)
      .set('X-Dealer-Api-Key', KEY)
      .expect(200);
  });

  it('recovers expired webhook leases, signs retries, and suppresses security-locked destinations', async () => {
    const endpoint = await prisma.dealerWebhookEndpoint.create({
      data: {
        dealerId,
        url: 'https://example.com/hooks',
        secretCiphertext: app.get(DealerRuntime).encrypt('current-secret'),
        keyId: randomUUID(),
        previousSecretCiphertext: app.get(DealerRuntime).encrypt('old-secret'),
        previousKeyId: randomUUID(),
        previousValidUntil: new Date(Date.now() + 86400_000),
      },
    });
    await prisma.dealerOutboxEvent.updateMany({ data: { expandedAt: new Date() } });
    const event = await prisma.dealerOutboxEvent.create({
      data: {
        dealerId,
        eventType: 'order.updated',
        resourceType: 'order',
        resourceId: randomUUID(),
        resourceVersion: 7,
        data: { status: 'CONFIRMED' },
        expandedAt: new Date(),
      },
    });
    const delivery = await prisma.dealerWebhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        eventId: event.id,
        dueAt: new Date(Date.now() - 1000),
        leaseToken: randomUUID(),
        leaseUntil: new Date(Date.now() - 1000),
      },
    });
    await app.get(DealerWebhookService).tick();
    expect(
      (await prisma.dealerWebhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status,
    ).toBe('DELIVERED');
    const call = vi.mocked(sendDealerWebhook).mock.calls[0];
    expect(call).toBeDefined();
    if (call === undefined) throw new Error('Expected webhook call');
    const body = call[1];
    const headers = call[2];
    const expected = createHmac('sha256', 'current-secret')
      .update(`${string(headers['X-Rephone-Timestamp'])}.${body}`)
      .digest('hex');
    expect(headers['X-Rephone-Signature']).toContain(`${endpoint.keyId}:${expected}`);
    expect(headers['X-Rephone-Signature']?.split(',')).toHaveLength(2);
    expect(JSON.parse(body)).toMatchObject({
      eventId: event.id,
      resourceVersion: 7,
      environment: 'TEST',
    });
    await prisma.dealerWebhookDelivery.update({
      where: { id: delivery.id },
      data: { status: 'PENDING', dueAt: new Date(Date.now() - 1000) },
    });
    await prisma.dealerProfile.update({
      where: { id: dealerId },
      data: { securityStatus: 'SECURITY_LOCKED' },
    });
    await app.get(DealerWebhookService).tick();
    expect(vi.mocked(sendDealerWebhook)).toHaveBeenCalledTimes(1);
    expect(
      (await prisma.dealerWebhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status,
    ).toBe('SUPPRESSED');
    const worker = new DealerWebhookService(
      app.get(PrismaService),
      app.get(SerializableTransactionRunner),
      app.get(DealerRuntime),
      app.get(DealerProfileService),
      app.get(DealerPaymentService),
      app.get(AuditWriter),
    );
    await worker.tick();
  });

  it('keeps concurrent webhook workers from sending two deliveries to one endpoint', async () => {
    const endpoint = await prisma.dealerWebhookEndpoint.create({
      data: {
        dealerId,
        url: 'https://example.com/hooks',
        secretCiphertext: app.get(DealerRuntime).encrypt('secret'),
        keyId: randomUUID(),
      },
    });
    await prisma.dealerOutboxEvent.updateMany({ data: { expandedAt: new Date() } });
    for (let index = 0; index < 2; index++) {
      const event = await prisma.dealerOutboxEvent.create({
        data: {
          dealerId,
          eventType: 'order.updated',
          resourceType: 'order',
          resourceId: randomUUID(),
          resourceVersion: 1,
          data: { status: 'CONFIRMED' },
          expandedAt: new Date(),
        },
      });
      await prisma.dealerWebhookDelivery.create({
        data: { endpointId: endpoint.id, eventId: event.id, dueAt: new Date(Date.now() - 1000) },
      });
    }
    let begin: () => void = () => {};
    let release: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      begin = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(sendDealerWebhook).mockImplementationOnce(async () => {
      begin();
      await gate;
      return 204;
    });
    const first = app.get(DealerWebhookService).tick();
    const second = new DealerWebhookService(
      app.get(PrismaService),
      app.get(SerializableTransactionRunner),
      app.get(DealerRuntime),
      app.get(DealerProfileService),
      app.get(DealerPaymentService),
      app.get(AuditWriter),
    );
    try {
      await started;
      await second.tick();
      expect(vi.mocked(sendDealerWebhook)).toHaveBeenCalledTimes(1);
      expect(
        await prisma.dealerWebhookDelivery.count({
          where: { endpointId: endpoint.id, leaseUntil: { gt: new Date() } },
        }),
      ).toBe(1);
    } finally {
      release();
      await first;
    }
    await second.tick();
    expect(
      await prisma.dealerWebhookDelivery.count({
        where: { endpointId: endpoint.id, status: 'DELIVERED' },
      }),
    ).toBe(2);
  });

  it('requires dealer fault assessment and extends repaired warranty once across retries', async () => {
    const order = await createOrder();
    const id = string(order['id']);
    await fundOrder(order, 'WARRANTY-REPAIR');
    const shipmentId = await handOverOrder(id);
    await shipmentCommand(shipmentId, 'mark-delivered', { confirmCodCollected: false }).expect(200);
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: id } });
    const warranty = await prisma.warranty.findUniqueOrThrow({ where: { orderItemId: item.id } });
    const unit = await prisma.inventoryUnit.findUniqueOrThrow({ where: { id: unitId } });
    const template = await prisma.inventoryInspection.findFirstOrThrow({
      where: { inventoryUnitId: unitId, status: 'COMPLETED' },
    });
    const created = await request(server)
      .post('/api/v1/dealer/after-sales')
      .set('X-Dealer-Api-Key', KEY)
      .set('Idempotency-Key', 'repair-warranty-00001')
      .send({
        orderItemId: item.id,
        type: 'WARRANTY',
        issueDescription: 'Máy không khởi động ổn định',
      })
      .expect(201);
    const caseId = string(data(created.body)['id']);
    const command = (action: string, body?: object) =>
      request(server)
        .post(`/api/v1/backoffice/after-sales/${caseId}/${action}`)
        .set(adminHeaders())
        .send(body ?? {});
    await command('receive', { receivedLocationId: unit.locationId }).expect(200);
    await command('start-inspection').expect(200);
    const pending = await prisma.afterSalesRequest.findUniqueOrThrow({ where: { id: caseId } });
    if (pending.inventoryInspectionId === null) throw new Error('Missing warranty inspection');
    // Completed technician inspection is a DB fixture; inventory inspection endpoints have their own baseline suite.
    await prisma.$transaction(async (tx) => {
      await tx.inventoryInspection.updateMany({
        where: { inventoryUnitId: unitId, isCurrent: true },
        data: { isCurrent: false },
      });
      await tx.inventoryInspection.update({
        where: { id: pending.inventoryInspectionId ?? '' },
        data: {
          status: 'COMPLETED',
          overallResult: 'PASSED',
          isCurrent: true,
          inspectedAt: new Date(),
          batteryHealthPercent: template.batteryHealthPercent,
          batteryCycleCount: template.batteryCycleCount,
          batteryReplacementStatus: template.batteryReplacementStatus,
          conditionGrade: template.conditionGrade,
          checks: template.checks ?? {},
          repairHistoryStatus: template.repairHistoryStatus,
        },
      });
    });
    await command('approve', { note: 'Lỗi thuộc phạm vi bảo hành' }).expect(409);
    const assessment = {
      finding: 'Xác nhận lỗi phần cứng có sẵn',
      cause: 'EXISTING_DEFECT',
      coverage: 'COVERED',
      shippingPayer: 'REPHONE',
      shippingCost: '30000',
      shippingAlreadyPaid: '0',
      feeAgreement: 'rePhone chịu toàn bộ phí giao bảo hành',
    };
    await request(server)
      .post(`/api/v1/backoffice/dealers/after-sales/${caseId}/assessment`)
      .set(adminHeaders())
      .send({ ...assessment, shippingPayer: 'DEALER' })
      .expect(400);
    await request(server)
      .post(`/api/v1/backoffice/dealers/after-sales/${caseId}/assessment`)
      .set(adminHeaders())
      .send(assessment)
      .expect(200);
    await command('approve', { note: 'Lỗi thuộc phạm vi bảo hành' }).expect(200);
    await command('resolve-repaired', {
      resolutionNote: 'Đã sửa và kiểm tra ổn định, bàn giao lại máy',
    }).expect(200);
    const updated = await prisma.warranty.findUniqueOrThrow({ where: { id: warranty.id } });
    expect(updated.daysSnapshot).toBe(warranty.daysSnapshot + 1);
    expect(updated.endAt.getTime()).toBe(warranty.endAt.getTime() + 86400_000);
    await command('resolve-repaired', {
      resolutionNote: 'Đã sửa và kiểm tra ổn định, bàn giao lại máy',
    }).expect(200);
    expect((await prisma.warranty.findUniqueOrThrow({ where: { id: warranty.id } })).endAt).toEqual(
      updated.endAt,
    );
    expect(
      (await prisma.inventoryUnit.findUniqueOrThrow({ where: { id: unitId } })).lifecycleStatus,
    ).toBe('SOLD');
  });

  async function login(email: string, password: string) {
    return string(
      data(
        (await request(server).post('/api/v1/auth/login').send({ email, password }).expect(200))
          .body,
      )['accessToken'],
    );
  }
  function adminHeaders() {
    return { Authorization: `Bearer ${adminToken}` };
  }
  async function fundOrder(order: Record<string, unknown>, bankReference: string) {
    await request(server)
      .post('/api/v1/backoffice/dealers/receipts')
      .set(adminHeaders())
      .send(receipt(string(order['id']), string(order['grandTotal']), bankReference))
      .expect(201);
  }
  function orderCommand(id: string, action: string, body: object = {}) {
    return request(server)
      .post(`/api/v1/backoffice/orders/${id}/${action}`)
      .set(adminHeaders())
      .send(body);
  }
  async function handOverOrder(id: string) {
    await orderCommand(id, 'start-preparing').expect(200);
    const response = await orderCommand(id, 'shipment', {
      carrierName: 'Test carrier',
      trackingCode: `TEST-${id}`,
    }).expect(201);
    const shipmentId = string(data(response.body)['id']);
    await shipmentCommand(shipmentId, 'hand-over').expect(200);
    return shipmentId;
  }
  function shipmentCommand(id: string, action: string, body: object = {}) {
    return request(server)
      .post(`/api/v1/backoffice/shipments/${id}/${action}`)
      .set(adminHeaders())
      .send(body);
  }
  function cancelDealerOrder(id: string) {
    return request(server)
      .post(`/api/v1/backoffice/dealers/orders/${id}/cancel`)
      .set(adminHeaders())
      .send({ reason: 'Hủy đơn sau khi đã đối chiếu nghiệp vụ hoàn hàng' });
  }
  async function quote(externalOrderId: string) {
    const preview = data(
      (
        await request(server)
          .post('/api/v1/dealer/orders/preview')
          .set('X-Dealer-Api-Key', KEY)
          .send({ inventoryUnitId: unitId, shippingAddress: ADDRESS })
          .expect(200)
      ).body,
    );
    return {
      inventoryUnitId: unitId,
      shippingAddress: ADDRESS,
      previewFingerprint: string(preview['previewFingerprint']),
      externalOrderId,
      contact: { fullName: 'Khách đại lý', email: 'buyer@example.test', phone: '0900000000' },
    };
  }
  function postOrder(body: unknown, key: string) {
    return request(server)
      .post('/api/v1/dealer/orders')
      .set('X-Dealer-Api-Key', KEY)
      .set('Idempotency-Key', key)
      .send(body as object);
  }
  async function createOrder() {
    return object(
      data((await postOrder(await quote(randomUUID()), randomUUID()).expect(201)).body)['order'],
    );
  }
  function receipt(orderId: string, receivedAmount: string, bankReference: string) {
    return {
      orderId,
      receivedAmount,
      bankReference,
      bankAccountKey: 'STORE-BANK',
      receivedAt: new Date().toISOString(),
      reason: 'Đã đối chiếu sao kê ngân hàng',
    };
  }
});
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected object');
  return value as Record<string, unknown>;
}
function data(value: unknown) {
  return object(object(value)['data']);
}
function string(value: unknown) {
  if (typeof value !== 'string') throw new Error('Expected string');
  return value;
}
