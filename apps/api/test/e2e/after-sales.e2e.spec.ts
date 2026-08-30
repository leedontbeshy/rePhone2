import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request, { type Response, type Test } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import { InMemoryStorageProvider } from '../../src/common/providers/in-memory-storage.provider.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { AfterSalesRateLimiter } from '../../src/modules/after-sales/after-sales-rate-limiter.service.js';
import { AuthRateLimiter } from '../../src/modules/auth/auth-rate-limiter.service.js';
import { BackofficeRateLimiter } from '../../src/modules/auth/backoffice-rate-limiter.service.js';
import { OrderRateLimiter } from '../../src/modules/orders/order-rate-limiter.service.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

const WEB_ORIGIN = 'http://localhost:3001';
const JSON_MUTATION_HEADERS = {
  Origin: WEB_ORIGIN,
  'X-Rephone-CSRF': '1',
  'Content-Type': 'application/json',
};
const ATTACHMENT = readFileSync(
  new URL('../../prisma/demo-assets/catalog/iphone-13.png', import.meta.url),
);
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('Slice 11 after-sales HTTP contract', () => {
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
    app.get(AfterSalesRateLimiter).clear();
    app.get(InMemoryStorageProvider).clear();
    await resetTestDatabase(prisma);
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('registers the Slice 11 routes with no-store and enforces customer/staff roles', async () => {
    const customer = await login(server, 'CUSTOMER');
    const employee = await login(server, 'EMPLOYEE');
    const admin = await login(server, 'ADMIN');

    const anonymousCustomerList = await request(server).get('/api/v1/after-sales').expect(401);
    expectNoStore(anonymousCustomerList);
    expect(errorCode(anonymousCustomerList)).toBe('AUTH_REQUIRED');

    const staffCustomerList = await request(server)
      .get('/api/v1/after-sales')
      .set(bearer(employee))
      .expect(403);
    expectNoStore(staffCustomerList);
    expect(errorCode(staffCustomerList)).toBe('FORBIDDEN');

    const customerList = await request(server)
      .get('/api/v1/after-sales')
      .set(bearer(customer))
      .expect(200);
    expectNoStore(customerList);

    const anonymousBackoffice = await request(server)
      .get('/api/v1/backoffice/after-sales')
      .expect(401);
    expectNoStore(anonymousBackoffice);

    const customerBackoffice = await request(server)
      .get('/api/v1/backoffice/after-sales')
      .set(bearer(customer))
      .expect(403);
    expectNoStore(customerBackoffice);

    for (const token of [employee, admin]) {
      const queue = await request(server)
        .get('/api/v1/backoffice/after-sales')
        .set(bearer(token))
        .expect(200);
      expectNoStore(queue);
    }

    const protectedRoutes = [
      (headers: Record<string, string>) =>
        request(server).get(`/api/v1/backoffice/after-sales/${MISSING_ID}`).set(headers),
      (headers: Record<string, string>) =>
        request(server)
          .get(`/api/v1/backoffice/after-sales/${MISSING_ID}/attachments/${MISSING_ID}/url`)
          .set(headers),
      (headers: Record<string, string>) =>
        request(server)
          .post(`/api/v1/backoffice/after-sales/${MISSING_ID}/assign`)
          .set(headers)
          .send({ employeeId: null }),
      (headers: Record<string, string>) =>
        request(server)
          .post(`/api/v1/backoffice/after-sales/${MISSING_ID}/receive`)
          .set(headers)
          .send({ receivedLocationId: MISSING_ID }),
      (headers: Record<string, string>) =>
        request(server)
          .post(`/api/v1/backoffice/after-sales/${MISSING_ID}/start-inspection`)
          .set(headers),
      (headers: Record<string, string>) =>
        request(server)
          .post(`/api/v1/backoffice/after-sales/${MISSING_ID}/record-inspection-summary`)
          .set(headers)
          .send({ inspectionSummary: 'Kiểm tra đầy đủ chức năng của phụ kiện.' }),
      (headers: Record<string, string>) =>
        request(server)
          .post(`/api/v1/backoffice/after-sales/${MISSING_ID}/approve`)
          .set(headers)
          .send({ note: 'Đủ điều kiện xử lý hậu mãi.' }),
      (headers: Record<string, string>) =>
        request(server)
          .post(`/api/v1/backoffice/after-sales/${MISSING_ID}/reject`)
          .set(headers)
          .send({ reason: 'Không đủ điều kiện xử lý hậu mãi.' }),
      (headers: Record<string, string>) =>
        request(server)
          .post(`/api/v1/backoffice/after-sales/${MISSING_ID}/resolve-repaired`)
          .set(headers)
          .send({ resolutionNote: 'Đã sửa chữa và bàn giao lại.' }),
      (headers: Record<string, string>) =>
        request(server)
          .post(`/api/v1/backoffice/after-sales/${MISSING_ID}/resolve-replaced`)
          .set(headers)
          .send({
            resolutionNote: 'Đã đổi thiết bị thay thế.',
            replacementInventoryUnitId: MISSING_ID,
          }),
      (headers: Record<string, string>) =>
        request(server)
          .post(`/api/v1/backoffice/after-sales/${MISSING_ID}/resolve-refunded`)
          .set(headers)
          .send({ resolutionNote: 'Đã hoàn tiền theo hồ sơ.', refundId: MISSING_ID }),
      (headers: Record<string, string>) =>
        request(server)
          .post(`/api/v1/backoffice/after-sales/${MISSING_ID}/resolve-returned-unchanged`)
          .set(headers)
          .send({ resolutionNote: 'Đã trả lại nguyên trạng cho khách.' }),
    ];

    for (const route of protectedRoutes) {
      const anonymous = await route({}).expect(401);
      expectNoStore(anonymous);
      const forbidden = await route(bearer(customer)).expect(403);
      expectNoStore(forbidden);
      const staff = await route(bearer(employee)).expect(404);
      expectNoStore(staff);
      expect(errorCode(staff)).toBe('RESOURCE_NOT_FOUND');
    }

    const employeeOther = await request(server)
      .post(`/api/v1/backoffice/after-sales/${MISSING_ID}/resolve-other`)
      .set(bearer(employee))
      .send({ resolutionNote: 'Kết quả xử lý đặc biệt.' })
      .expect(403);
    expectNoStore(employeeOther);
    const adminOther = await request(server)
      .post(`/api/v1/backoffice/after-sales/${MISSING_ID}/resolve-other`)
      .set(bearer(admin))
      .send({ resolutionNote: 'Kết quả xử lý đặc biệt.' })
      .expect(404);
    expectNoStore(adminOther);
  });

  it('returns role-aware warranty actions and catalog-backed policy archive readiness', async () => {
    const customer = await login(server, 'CUSTOMER');
    const employee = await login(server, 'EMPLOYEE');
    const admin = await login(server, 'ADMIN');
    const fixture = await completeAccessoryPickup(server, prisma, bearer(customer), employee);
    const warranty = await prisma.warranty.findUniqueOrThrow({
      where: { orderItemId: fixture.orderItemId },
      select: { id: true },
    });
    const policy = await prisma.warrantyPolicy.findUniqueOrThrow({
      where: { code: 'ACCESSORY-30D' },
      select: { id: true },
    });

    const employeeWarranty = await request(server)
      .get(`/api/v1/backoffice/warranties/${warranty.id}`)
      .set(bearer(employee))
      .expect(200);
    const adminWarranty = await request(server)
      .get(`/api/v1/backoffice/warranties/${warranty.id}`)
      .set(bearer(admin))
      .expect(200);
    expect(arrayProperty(successRecord(employeeWarranty), 'availableActions')).toEqual([]);
    expect(arrayProperty(successRecord(adminWarranty), 'availableActions')).toEqual(['VOID']);

    const employeePolicy = await request(server)
      .get(`/api/v1/backoffice/warranty-policies/${policy.id}`)
      .set(bearer(employee))
      .expect(200);
    const adminPolicy = await request(server)
      .get(`/api/v1/backoffice/warranty-policies/${policy.id}`)
      .set(bearer(admin))
      .expect(200);
    expect(arrayProperty(successRecord(employeePolicy), 'availableActions')).toEqual([]);
    expect(successRecord(employeePolicy)['archiveBlockedReason']).toBe('ACTIVE_CATALOG_REFERENCES');
    expect(arrayProperty(successRecord(adminPolicy), 'availableActions')).toEqual([
      'EDIT',
      'DEACTIVATE',
    ]);
    expect(successRecord(adminPolicy)['archiveBlockedReason']).toBe('ACTIVE_CATALOG_REFERENCES');

    const voided = await request(server)
      .post(`/api/v1/backoffice/warranties/${warranty.id}/void`)
      .set({ ...JSON_MUTATION_HEADERS, ...bearer(admin) })
      .send({ reason: 'Hoàn tất kiểm tra và xác nhận bảo hành không còn áp dụng.' })
      .expect(200);
    expect(arrayProperty(successRecord(voided), 'availableActions')).toEqual([]);

    const reloaded = await request(server)
      .get(`/api/v1/backoffice/warranties/${warranty.id}`)
      .set(bearer(admin))
      .expect(200);
    expect(successRecord(reloaded)['status']).toBe('VOIDED');
    expect(arrayProperty(successRecord(reloaded), 'availableActions')).toEqual([]);
  });

  it('runs create, private attachment, receive, inspection, approval and repaired resolution', async () => {
    const customer = await login(server, 'CUSTOMER');
    const employee = await login(server, 'EMPLOYEE');
    const fixture = await completeAccessoryPickup(server, prisma, bearer(customer), employee);
    const storage = app.get(InMemoryStorageProvider);

    const created = await request(server)
      .post('/api/v1/after-sales')
      .set(bearer(customer))
      .send({
        orderItemId: fixture.orderItemId,
        type: 'WARRANTY',
        issueDescription: 'Cáp sạc chập chờn và mất kết nối trong quá trình sử dụng.',
      })
      .expect(201);
    expectNoStore(created);
    const createdCase = successRecord(created);
    const requestNumber = stringProperty(createdCase, 'requestNumber');
    const caseId = (
      await prisma.afterSalesRequest.findUniqueOrThrow({
        where: { requestNumber },
        select: { id: true },
      })
    ).id;
    expect(createdCase).toMatchObject({
      type: 'WARRANTY',
      status: 'REQUESTED',
      requestedResolution: null,
    });
    expect(objectProperty(createdCase, 'warranty')['status']).toBe('ACTIVE');

    const uploaded = await request(server)
      .post(`/api/v1/after-sales/${requestNumber}/attachments`)
      .set(bearer(customer))
      .attach('file', ATTACHMENT, { filename: 'after-sales.png', contentType: 'image/png' })
      .expect(200);
    expectNoStore(uploaded);
    const attachment = record(arrayProperty(successRecord(uploaded), 'attachments')[0]);
    const attachmentId = stringProperty(attachment, 'id');
    expect(storage.objectCount()).toBe(1);
    assertNoPrivateAttachmentFields(uploaded.body);

    const detail = await request(server)
      .get(`/api/v1/after-sales/${requestNumber}`)
      .set(bearer(customer))
      .expect(200);
    expectNoStore(detail);
    expect(successRecord(detail)).toMatchObject({ status: 'REQUESTED' });
    assertNoPrivateAttachmentFields(detail.body);

    await registerCustomer(server, 'other-slice11@example.com', 'Khách không sở hữu');
    const other = await loginWithCredentials(server, 'other-slice11@example.com', 'Customer123');
    const hidden = await request(server)
      .get(`/api/v1/after-sales/${requestNumber}`)
      .set(bearer(other))
      .expect(404);
    expectNoStore(hidden);
    expect(errorCode(hidden)).toBe('RESOURCE_NOT_FOUND');

    const attachmentUrl = await request(server)
      .get(`/api/v1/after-sales/${requestNumber}/attachments/${attachmentId}/url`)
      .set(bearer(customer))
      .expect(200);
    expectNoStore(attachmentUrl);
    expect(stringProperty(successRecord(attachmentUrl), 'url')).toContain(
      `private-test/after-sales/`,
    );
    expectSignedUrlTtl(successRecord(attachmentUrl));

    const backofficeList = await request(server)
      .get(`/api/v1/backoffice/after-sales?q=${encodeURIComponent(requestNumber)}`)
      .set(bearer(employee))
      .expect(200);
    expectNoStore(backofficeList);
    expect(
      arrayProperty(backofficeList.body as unknown as Record<string, unknown>, 'data'),
    ).toHaveLength(1);

    const receive = await request(server)
      .post(`/api/v1/backoffice/after-sales/${caseId}/receive`)
      .set(bearer(employee))
      .send({
        receivedLocationId: fixture.storeId,
        note: 'Đã nhận cáp và hộp sản phẩm đầy đủ từ khách.',
      })
      .expect(200);
    expectNoStore(receive);
    expect(successRecord(receive)).toMatchObject({
      status: 'RECEIVED',
      receiveNote: 'Đã nhận cáp và hộp sản phẩm đầy đủ từ khách.',
    });
    assertNoPrivateAttachmentFields(receive.body);

    await request(server)
      .post(`/api/v1/backoffice/after-sales/${caseId}/start-inspection`)
      .set(bearer(employee))
      .expect(200);
    await request(server)
      .post(`/api/v1/backoffice/after-sales/${caseId}/record-inspection-summary`)
      .set(bearer(employee))
      .send({ inspectionSummary: 'Đã thử tải và truyền dữ liệu; xác nhận lỗi kết nối ngắt quãng.' })
      .expect(200);

    const approvalPayload = { note: 'Xác nhận lỗi thuộc phạm vi bảo hành của sản phẩm.' };
    await request(server)
      .post(`/api/v1/backoffice/after-sales/${caseId}/approve`)
      .set(bearer(employee))
      .send(approvalPayload)
      .expect(200);
    const approvalReplay = await request(server)
      .post(`/api/v1/backoffice/after-sales/${caseId}/approve`)
      .set(bearer(employee))
      .send(approvalPayload)
      .expect(200);
    expect(successRecord(approvalReplay)).toMatchObject({ status: 'APPROVED' });

    const resolutionPayload = {
      resolutionNote: 'Đã sửa đầu nối, kiểm tra ổn định và bàn giao lại cho khách.',
    };
    const resolved = await request(server)
      .post(`/api/v1/backoffice/after-sales/${caseId}/resolve-repaired`)
      .set(bearer(employee))
      .send(resolutionPayload)
      .expect(200);
    expect(successRecord(resolved)).toMatchObject({
      status: 'RESOLVED',
      resolutionType: 'REPAIRED',
    });
    await request(server)
      .post(`/api/v1/backoffice/after-sales/${caseId}/resolve-repaired`)
      .set(bearer(employee))
      .send(resolutionPayload)
      .expect(200);

    const stockReturnPayload = {
      variantId: fixture.variantId,
      locationId: fixture.storeId,
      quantity: 1,
      referenceType: 'AFTER_SALES_REQUEST',
      referenceId: caseId,
      reason: 'Nhập lại phụ kiện sau khi hoàn tất kiểm tra hậu mãi.',
    } as const;
    await request(server)
      .post('/api/v1/backoffice/stock/return')
      .set(bearer(employee))
      .send(stockReturnPayload)
      .expect(200);
    await request(server)
      .post('/api/v1/backoffice/stock/return')
      .set(bearer(employee))
      .send(stockReturnPayload)
      .expect(200);

    const persisted = await prisma.afterSalesRequest.findUniqueOrThrow({ where: { id: caseId } });
    expect(persisted).toMatchObject({
      status: 'RESOLVED',
      resolutionType: 'REPAIRED',
      requestedResolution: null,
      receiveNote: 'Đã nhận cáp và hộp sản phẩm đầy đủ từ khách.',
    });
    expect(
      await prisma.auditLog.count({
        where: { resourceId: caseId, action: 'after_sales.approved' },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { resourceId: caseId, action: 'after_sales.resolved' },
      }),
    ).toBe(1);
    expect(
      await prisma.stockMovement.count({
        where: {
          type: 'RETURN',
          referenceType: 'AFTER_SALES_REQUEST',
          referenceId: caseId,
          variantId: fixture.variantId,
        },
      }),
    ).toBe(1);
  });

  it('requires CSRF for converted guest-cart ownership and hides invalid credentials as 404', async () => {
    const employee = await login(server, 'EMPLOYEE');
    const agent = request.agent(server);
    const fixture = await completeAccessoryPickup(
      server,
      prisma,
      JSON_MUTATION_HEADERS,
      employee,
      (path) => agent.post(path),
    );
    const payload = {
      orderItemId: fixture.orderItemId,
      type: 'RETURN',
      issueDescription: 'Phụ kiện không phù hợp nhu cầu và còn nguyên trạng sử dụng.',
    };

    const missingCsrf = await agent.post('/api/v1/after-sales').send(payload).expect(403);
    expectNoStore(missingCsrf);
    expect(errorCode(missingCsrf)).toBe('CSRF_VALIDATION_FAILED');

    const created = await agent
      .post('/api/v1/after-sales')
      .set(JSON_MUTATION_HEADERS)
      .send(payload)
      .expect(201);
    expectNoStore(created);
    const requestNumber = stringProperty(successRecord(created), 'requestNumber');

    const guestDetail = await agent.get(`/api/v1/after-sales/${requestNumber}`).expect(200);
    expectNoStore(guestDetail);
    assertNoPrivateAttachmentFields(guestDetail.body);

    const forged = await agent
      .get(`/api/v1/after-sales/${requestNumber}`)
      .set('X-Guest-Order-Token', 'B'.repeat(43))
      .expect(404);
    expectNoStore(forged);
    expect(errorCode(forged)).toBe('RESOURCE_NOT_FOUND');
  });

  it('serializes concurrent case creation and fifth/sixth attachment uploads without leaks', async () => {
    const customer = await login(server, 'CUSTOMER');
    const employee = await login(server, 'EMPLOYEE');
    const admin = await login(server, 'ADMIN');
    const fixture = await completeAccessoryPickup(server, prisma, bearer(customer), employee);
    const createBarrier = new Barrier(2);
    const createResponses = await Promise.all(
      [0, 1].map(async (index) => {
        await createBarrier.arrive();
        return request(server)
          .post('/api/v1/after-sales')
          .set(bearer(customer))
          .send({
            orderItemId: fixture.orderItemId,
            type: 'RETURN',
            issueDescription: `Yêu cầu trả phụ kiện đồng thời số ${String(index + 1)} để kiểm thử.`,
          });
      }),
    );
    expect(createResponses.filter(({ status }) => status === 201)).toHaveLength(1);
    const createLoser = createResponses.find(({ status }) => status !== 201);
    if (createLoser === undefined) throw new Error('Expected one concurrent create loser');
    expect(createLoser.status).toBe(409);
    expect(errorCode(createLoser)).toBe('AFTER_SALES_REQUEST_ALREADY_OPEN');
    for (const response of createResponses) expectNoStore(response);
    expect(
      await prisma.afterSalesRequest.count({ where: { orderItemId: fixture.orderItemId } }),
    ).toBe(1);

    const winner = createResponses.find(({ status }) => status === 201);
    if (winner === undefined) throw new Error('Expected one successful after-sales request');
    const requestNumber = stringProperty(successRecord(winner), 'requestNumber');
    for (let index = 0; index < 4; index += 1) {
      await request(server)
        .post(`/api/v1/after-sales/${requestNumber}/attachments`)
        .set(bearer(customer))
        .attach('file', ATTACHMENT, {
          filename: `attachment-${String(index + 1)}.png`,
          contentType: 'image/png',
        })
        .expect(200);
    }

    const storage = app.get(InMemoryStorageProvider);
    const uploadBarrier = new Barrier(2);
    storage.setBeforeUpload(() => uploadBarrier.arrive());
    const uploadResponses = await Promise.all(
      [5, 6].map((index) =>
        request(server)
          .post(`/api/v1/after-sales/${requestNumber}/attachments`)
          .set(bearer(customer))
          .attach('file', ATTACHMENT, {
            filename: `attachment-${String(index)}.png`,
            contentType: 'image/png',
          }),
      ),
    );
    expect(uploadResponses.filter(({ status }) => status === 200)).toHaveLength(1);
    expect(uploadResponses.filter(({ status }) => status === 400)).toHaveLength(1);
    for (const response of uploadResponses) expectNoStore(response);

    const persisted = await prisma.afterSalesRequest.findFirstOrThrow({
      where: { requestNumber },
    });
    const attachments = persisted.attachments;
    expect(Array.isArray(attachments) ? attachments : []).toHaveLength(5);
    expect(storage.objectCount()).toBe(5);
    expect(
      await prisma.auditLog.count({
        where: { resourceId: persisted.id, action: 'after_sales.attachment_added' },
      }),
    ).toBe(5);

    await request(server)
      .post(`/api/v1/backoffice/after-sales/${persisted.id}/receive`)
      .set(bearer(employee))
      .send({
        receivedLocationId: fixture.storeId,
        note: 'Đã nhận đủ phụ kiện để kiểm thử quyết định đồng thời.',
      })
      .expect(200);
    await request(server)
      .post(`/api/v1/backoffice/after-sales/${persisted.id}/start-inspection`)
      .set(bearer(employee))
      .expect(200);
    await request(server)
      .post(`/api/v1/backoffice/after-sales/${persisted.id}/record-inspection-summary`)
      .set(bearer(employee))
      .send({
        inspectionSummary: 'Đã kiểm tra phụ kiện và ghi đủ kết quả cho quyết định đồng thời.',
      })
      .expect(200);

    const decisionBarrier = new Barrier(2);
    const [approve, reject] = await Promise.all([
      (async () => {
        await decisionBarrier.arrive();
        return request(server)
          .post(`/api/v1/backoffice/after-sales/${persisted.id}/approve`)
          .set(bearer(employee))
          .send({ note: 'Chấp thuận xử lý theo kết quả kiểm định.' });
      })(),
      (async () => {
        await decisionBarrier.arrive();
        return request(server)
          .post(`/api/v1/backoffice/after-sales/${persisted.id}/reject`)
          .set(bearer(admin))
          .send({ reason: 'Từ chối xử lý theo kết quả kiểm định.' });
      })(),
    ]);
    expect([approve.status, reject.status].sort()).toEqual([200, 409]);
    expectNoStore(approve);
    expectNoStore(reject);
    const decided = await prisma.afterSalesRequest.findUniqueOrThrow({
      where: { id: persisted.id },
    });
    expect(['APPROVED', 'REJECTED']).toContain(decided.status);
    expect(
      await prisma.auditLog.count({
        where: {
          resourceId: persisted.id,
          action: { in: ['after_sales.approved', 'after_sales.rejected'] },
        },
      }),
    ).toBe(1);
  });
});

interface CompletedAccessoryPickup {
  orderItemId: string;
  storeId: string;
  variantId: string;
}

async function completeAccessoryPickup(
  server: Server,
  prisma: PrismaClient,
  cartHeaders: Record<string, string>,
  employeeToken: string,
  post: (path: string) => Test = (path) => request(server).post(path),
): Promise<CompletedAccessoryPickup> {
  const stock = await prisma.stockLevel.findFirstOrThrow({
    where: {
      location: { type: 'STORE', status: 'ACTIVE' },
      variant: {
        inventoryMode: 'QUANTITY',
        status: 'ACTIVE',
        salePrice: { not: null },
        product: { type: 'ACCESSORY', status: 'ACTIVE' },
      },
      quantityOnHand: { gt: 0 },
    },
    orderBy: { id: 'asc' },
    select: { variantId: true, locationId: true },
  });
  await post('/api/v1/cart/items')
    .set(cartHeaders)
    .send({ itemType: 'ACCESSORY', variantId: stock.variantId, quantity: 1 })
    .expect(201);
  const previewResponse = await post('/api/v1/checkouts/preview')
    .set(cartHeaders)
    .send({ fulfillmentType: 'PICKUP' })
    .expect(200);
  const preview = successRecord(previewResponse);
  const pricing = objectProperty(preview, 'pricing');
  const created = await post('/api/v1/checkouts')
    .set(cartHeaders)
    .send({
      fulfillmentType: 'PICKUP',
      contact: {
        fullName: 'Khách After-sales Slice 11',
        email: 'slice11-after-sales@example.com',
        phone: '0900000000',
      },
      expectedCartUpdatedAt: stringProperty(preview, 'cartUpdatedAt'),
      expectedGrandTotal: stringProperty(pricing, 'grandTotal'),
      expectedDepositRequired: stringProperty(pricing, 'depositRequired'),
    })
    .expect(201);
  const orderNumber = stringProperty(
    objectProperty(successRecord(created), 'order'),
    'orderNumber',
  );
  const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber } });

  await request(server)
    .post(`/api/v1/backoffice/orders/${order.id}/confirm`)
    .set(bearer(employeeToken))
    .expect(200);
  await request(server)
    .post(`/api/v1/backoffice/orders/${order.id}/start-preparing`)
    .set(bearer(employeeToken))
    .expect(200);
  await request(server)
    .post(`/api/v1/backoffice/orders/${order.id}/mark-pickup-ready`)
    .set(bearer(employeeToken))
    .expect(200);
  await request(server)
    .post(`/api/v1/backoffice/orders/${order.id}/complete-pickup`)
    .set(bearer(employeeToken))
    .send({ confirmCashCollected: true })
    .expect(200);

  const item = await prisma.orderItem.findFirstOrThrow({
    where: { orderId: order.id },
    include: { warranty: true },
  });
  if (item.warranty === null || item.warranty.status !== 'ACTIVE') {
    throw new Error('Completed Slice 11 fixture must issue one active warranty');
  }
  return {
    orderItemId: item.id,
    storeId: stock.locationId,
    variantId: stock.variantId,
  };
}

async function registerCustomer(server: Server, email: string, fullName: string): Promise<void> {
  await request(server)
    .post('/api/v1/auth/register')
    .send({ email, password: 'Customer123', fullName })
    .expect(201);
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

function expectSignedUrlTtl(value: Record<string, unknown>): void {
  const ttlMilliseconds = new Date(stringProperty(value, 'expiresAt')).getTime() - Date.now();
  expect(ttlMilliseconds).toBeGreaterThan(295_000);
  expect(ttlMilliseconds).toBeLessThanOrEqual(300_000);
}

function assertNoPrivateAttachmentFields(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toMatch(
    /private-test|objectPath|uploadedById|uploadedByType|receivedById|assignedToId/,
  );
}

function successRecord(response: Response): Record<string, unknown> {
  return objectProperty(response.body as unknown, 'data');
}

function errorCode(response: Response): string {
  return stringProperty(objectProperty(response.body as unknown, 'error'), 'code');
}

function objectProperty(value: unknown, key: string): Record<string, unknown> {
  const property = record(value)[key];
  if (!isRecord(property)) throw new Error(`Expected ${key} to be an object`);
  return property;
}

function arrayProperty(value: Record<string, unknown>, key: string): unknown[] {
  const property = value[key];
  if (!Array.isArray(property)) throw new Error(`Expected ${key} to be an array`);
  return property;
}

function stringProperty(value: Record<string, unknown>, key: string): string {
  const property = value[key];
  if (typeof property !== 'string') throw new Error(`Expected ${key} to be a string`);
  return property;
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Expected an object');
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
