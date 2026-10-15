import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import { IPHONE_CHECKLIST_V1 } from '../../src/common/domain/iphone-inspection-checklist.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { AuthRateLimiter } from '../../src/modules/auth/auth-rate-limiter.service.js';
import { BackofficeRateLimiter } from '../../src/modules/auth/backoffice-rate-limiter.service.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

const DEMO_PNG = readFileSync(
  new URL('../../prisma/demo-assets/catalog/iphone-13.png', import.meta.url),
);

describe('Slice 04 backoffice catalog and inventory HTTP contract', () => {
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
    await resetTestDatabase(prisma);
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('persists featured selection and looks up an exact inventory code with masked identifiers', async () => {
    const employee = await login(server, 'EMPLOYEE');
    const unit = await prisma.inventoryUnit.findUniqueOrThrow({
      where: { inventoryCode: 'IP13-MID-001' },
    });
    const update = await request(server)
      .patch(`/api/v1/backoffice/inventory-units/${unit.id}`)
      .set(bearer(employee))
      .send({ isFeatured: true })
      .expect(200);
    expect(successData(update)['isFeatured']).toBe(true);
    expect(
      (await prisma.inventoryUnit.findUniqueOrThrow({ where: { id: unit.id } })).isFeatured,
    ).toBe(true);
    const found = await request(server)
      .post('/api/v1/backoffice/inventory-units/lookup-identifier')
      .set(bearer(employee))
      .send({ type: 'INVENTORY_CODE', value: ' ip13-mid-001 ' })
      .expect(200);
    expect(successData(found)).toMatchObject({
      id: unit.id,
      inventoryCode: unit.inventoryCode,
      isFeatured: true,
    });
    expect(JSON.stringify(found.body)).not.toMatch(/Encrypted|Hmac|acquisitionCost|additionalCost/);
    await request(server)
      .post('/api/v1/backoffice/inventory-units/lookup-identifier')
      .set(bearer(employee))
      .send({ type: 'INVENTORY_CODE', value: 'IP13' })
      .expect(404);
    await request(server)
      .patch(`/api/v1/backoffice/inventory-units/${unit.id}`)
      .set(bearer(employee))
      .send({ isFeatured: false })
      .expect(200);
    expect(
      (await prisma.inventoryUnit.findUniqueOrThrow({ where: { id: unit.id } })).isFeatured,
    ).toBe(false);
  });

  it('blocks anonymous/customer access and keeps cost out of employee projections', async () => {
    await request(server).get('/api/v1/backoffice/products').expect(401);
    const customer = await login(server, 'CUSTOMER');
    await request(server)
      .get('/api/v1/backoffice/inventory-units')
      .set(bearer(customer))
      .expect(403);

    const employee = await login(server, 'EMPLOYEE');
    const list = await request(server)
      .get('/api/v1/backoffice/inventory-units')
      .set(bearer(employee))
      .expect(200);
    expect(JSON.stringify(list.body)).not.toMatch(
      /acquisitionCost|additionalCost|totalCost|Encrypted|Hmac|identifierKeyVersion/,
    );
    const firstUnit = successArray(list)[0];
    if (firstUnit === undefined) throw new Error('Expected seeded inventory unit');
    const unitId = stringProperty(firstUnit, 'id');
    await request(server)
      .get(`/api/v1/backoffice/inventory-units/${unitId}/cost`)
      .set(bearer(employee))
      .expect(403);
    const admin = await login(server, 'ADMIN');
    await request(server)
      .get(`/api/v1/backoffice/inventory-units/${unitId}/cost`)
      .set(bearer(admin))
      .expect(200);
  });

  it('runs the employee wizard through PostgreSQL and exposes the AVAILABLE unit publicly', async () => {
    const employee = await login(server, 'EMPLOYEE');
    const target = await iphoneTarget(prisma);
    const intake = await intakeUnit(server, employee, target, 'SLICE04FLOW01');
    const unit = successData(intake);
    const unitId = stringProperty(unit, 'id');
    const inventoryCode = stringProperty(unit, 'inventoryCode');
    expect(unit).toMatchObject({ lifecycleStatus: 'RECEIVED', mediaCount: 0 });
    expect(JSON.stringify(unit)).not.toMatch(/SLICE04FLOW01|acquisitionCost|Encrypted|Hmac/);

    const lookup = await request(server)
      .post('/api/v1/backoffice/inventory-units/lookup-identifier')
      .set(bearer(employee))
      .send({ type: 'SERIAL', value: 'slice04flow01' })
      .expect(200);
    expect(stringProperty(successData(lookup), 'id')).toBe(unitId);

    const reveal = await request(server)
      .post(`/api/v1/backoffice/inventory-units/${unitId}/reveal-identifiers`)
      .set(bearer(employee))
      .send({ reason: 'Xác minh tem máy tại quầy' })
      .expect(200);
    expect(reveal.headers['cache-control']).toBe('no-store');
    expect(successData(reveal)).toMatchObject({ serial: 'SLICE04FLOW01' });

    await request(server)
      .post(`/api/v1/backoffice/inventory-units/${unitId}/media`)
      .set(bearer(employee))
      .field('altText', 'Ảnh máy kiểm thử')
      .field('sortOrder', '0')
      .attach('file', DEMO_PNG, { filename: 'unit.png', contentType: 'image/png' })
      .expect(201);

    const createdInspection = await request(server)
      .post(`/api/v1/backoffice/inventory-units/${unitId}/inspections`)
      .set(bearer(employee))
      .send({ inspectionType: 'INTAKE' })
      .expect(201);
    const inspectionId = stringProperty(successData(createdInspection), 'id');
    await request(server)
      .patch(`/api/v1/backoffice/inspections/${inspectionId}`)
      .set(bearer(employee))
      .send(passedInspectionInput())
      .expect(200);
    const completed = await request(server)
      .post(`/api/v1/backoffice/inspections/${inspectionId}/complete`)
      .set(bearer(employee))
      .expect(200);
    expect(successData(completed)).toMatchObject({ status: 'COMPLETED', overallResult: 'PASSED' });

    const available = await request(server)
      .post(`/api/v1/backoffice/inventory-units/${unitId}/make-available`)
      .set(bearer(employee))
      .expect(200);
    expect(successData(available)).toMatchObject({ lifecycleStatus: 'AVAILABLE' });
    await request(server)
      .get(`/api/v1/products/${target.productSlug}/units/${inventoryCode}`)
      .expect(200);

    const admin = await login(server, 'ADMIN');
    await request(server)
      .patch(`/api/v1/backoffice/inventory-units/${unitId}/cost`)
      .set(bearer(admin))
      .send({
        acquisitionCost: '7500000',
        additionalCost: '250000',
        reason: 'Nhập giá vốn từ hóa đơn',
      })
      .expect(200)
      .expect(({ body }: Response) => {
        expect(successRecord(body)).toMatchObject({ totalCost: '7750000' });
      });

    const audits = await prisma.auditLog.findMany({ where: { resourceId: unitId } });
    expect(audits.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        'inventory.unit.intake.created',
        'inventory.identifier.lookup',
        'inventory.identifier.reveal',
        'inventory.unit.made_available',
        'inventory.cost.updated',
      ]),
    );
    expect(JSON.stringify(audits)).not.toMatch(/SLICE04FLOW01|Hmac|Encrypted|ciphertext/);
  });

  it('covers catalog commands and all three media owners including metadata/delete', async () => {
    const employee = await login(server, 'EMPLOYEE');
    const created = await request(server)
      .post('/api/v1/backoffice/products')
      .set(bearer(employee))
      .send({
        type: 'IPHONE',
        brand: 'Apple',
        name: 'iPhone Slice 04',
        slug: 'iphone-slice-04',
        releaseYear: 2026,
      })
      .expect(201);
    const productId = stringProperty(successData(created), 'id');
    await request(server)
      .patch(`/api/v1/backoffice/products/${productId}`)
      .set(bearer(employee))
      .send({ chipset: 'A Slice' })
      .expect(200);
    const variant = await request(server)
      .post(`/api/v1/backoffice/products/${productId}/variants`)
      .set(bearer(employee))
      .send({
        sku: 'IPH-SLICE04-128-BLK',
        displayName: '128 GB Black',
        storageCapacityGb: 128,
        colorName: 'Black',
      })
      .expect(201);
    const variantId = stringProperty(successData(variant), 'id');
    await request(server)
      .patch(`/api/v1/backoffice/variants/${variantId}`)
      .set(bearer(employee))
      .send({ colorHex: '#111111' })
      .expect(200);
    await request(server)
      .post(`/api/v1/backoffice/variants/${variantId}/activate`)
      .set(bearer(employee))
      .expect(200);
    await request(server)
      .post(`/api/v1/backoffice/products/${productId}/publish`)
      .set(bearer(employee))
      .expect(200);

    const productMedia = await uploadMedia(server, employee, `products/${productId}/media`);
    const variantMedia = await uploadMedia(server, employee, `variants/${variantId}/media`);
    const mediaId = stringProperty(successData(productMedia), 'id');
    const variantMediaId = stringProperty(successData(variantMedia), 'id');
    const reloaded = await request(server)
      .get(`/api/v1/backoffice/products/${productId}`)
      .set(bearer(employee))
      .expect(200);
    expect(successData(reloaded)).toMatchObject({
      variants: [
        expect.objectContaining({
          id: variantId,
          media: [expect.objectContaining({ id: variantMediaId, sortOrder: 0 })],
        }),
      ],
    });
    await request(server)
      .patch(`/api/v1/backoffice/product-media/${mediaId}`)
      .set(bearer(employee))
      .send({ altText: 'Ảnh catalog đã sửa', sortOrder: 2 })
      .expect(200);
    await request(server)
      .delete(`/api/v1/backoffice/product-media/${variantMediaId}`)
      .set(bearer(employee))
      .expect(204);

    const replacementVariant = await request(server)
      .post(`/api/v1/backoffice/products/${productId}/variants`)
      .set(bearer(employee))
      .send({
        sku: 'IPH-SLICE04-256-BLK',
        displayName: '256 GB Black',
        storageCapacityGb: 256,
        colorName: 'Black',
      })
      .expect(201);
    const replacementVariantId = stringProperty(successData(replacementVariant), 'id');
    await request(server)
      .post(`/api/v1/backoffice/variants/${replacementVariantId}/activate`)
      .set(bearer(employee))
      .expect(200);

    await request(server)
      .post(`/api/v1/backoffice/variants/${variantId}/archive`)
      .set(bearer(employee))
      .send({ reason: 'Kết thúc kiểm thử variant' })
      .expect(200);
    await request(server)
      .post(`/api/v1/backoffice/products/${productId}/archive`)
      .set(bearer(employee))
      .send({ reason: 'Kết thúc kiểm thử product' })
      .expect(200);
  });

  it('runs unit lifecycle commands and requires audited identifier corrections', async () => {
    const employee = await login(server, 'EMPLOYEE');
    const target = await iphoneTarget(prisma);
    const locations = await prisma.inventoryLocation.findMany({ orderBy: { code: 'asc' } });
    const received = successData(await intakeUnit(server, employee, target, 'SLICE04MOVE01'));
    const receivedId = stringProperty(received, 'id');
    const otherLocation = locations.find(({ id }) => id !== target.locationId);
    if (otherLocation === undefined) throw new Error('Expected second demo location');
    await request(server)
      .post(`/api/v1/backoffice/inventory-units/${receivedId}/transfer`)
      .set(bearer(employee))
      .send({ toLocationId: otherLocation.id, reason: 'Chuyển sang kho kiểm định' })
      .expect(200);

    const lifecycle = successData(await intakeUnit(server, employee, target, 'SLICE04LIFE01'));
    const lifecycleId = stringProperty(lifecycle, 'id');
    await request(server)
      .post(`/api/v1/backoffice/inventory-units/${lifecycleId}/quarantine`)
      .set(bearer(employee))
      .send({ reason: 'Phát hiện ngoại hình cần xem lại' })
      .expect(200);
    await request(server)
      .post(`/api/v1/backoffice/inventory-units/${lifecycleId}/send-to-repair`)
      .set(bearer(employee))
      .send({ reason: 'Chuyển kỹ thuật xử lý ngoại hình' })
      .expect(200);
    await request(server)
      .post(`/api/v1/backoffice/inventory-units/${lifecycleId}/write-off`)
      .set(bearer(employee))
      .send({ reason: 'Không đạt tiêu chuẩn bán hàng' })
      .expect(200);

    const available = await prisma.inventoryUnit.findFirstOrThrow({
      where: { lifecycleStatus: 'AVAILABLE' },
    });
    await request(server)
      .patch(`/api/v1/backoffice/inventory-units/${available.id}`)
      .set(bearer(employee))
      .send({ serial: 'SLICE04EDIT01' })
      .expect(400);
    await request(server)
      .patch(`/api/v1/backoffice/inventory-units/${available.id}`)
      .set(bearer(employee))
      .send({ serial: 'SLICE04EDIT01', reason: 'Sửa serial theo tem máy gốc' })
      .expect(200);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { resourceId: available.id, action: 'inventory.unit.identifiers.updated' },
    });
    expect(audit.metadata).toMatchObject({ reason: 'Sửa serial theo tem máy gốc' });
  });

  it('lists new draft accessories before their first receipt with guarded, paginated summaries', async () => {
    await request(server).get('/api/v1/backoffice/stock-variants').expect(401);
    const customer = await login(server, 'CUSTOMER');
    await request(server)
      .get('/api/v1/backoffice/stock-variants')
      .set(bearer(customer))
      .expect(403);

    const employee = await login(server, 'EMPLOYEE');
    // Isolate the choices in this reset test database from the seeded catalog.
    await prisma.productVariant.updateMany({
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    const created = await request(server)
      .post('/api/v1/backoffice/products')
      .set(bearer(employee))
      .send({ type: 'ACCESSORY', name: 'Phụ kiện nhập lần đầu', slug: 'first-accessory-receipt' })
      .expect(201);
    const productId = stringProperty(successData(created), 'id');
    const createdVariant = await request(server)
      .post(`/api/v1/backoffice/products/${productId}/variants`)
      .set(bearer(employee))
      .send({ sku: 'FIRST-RECEIPT-B', displayName: 'Bản B', salePrice: '150000' })
      .expect(201);
    const variantId = stringProperty(successData(createdVariant), 'id');
    const activeVariant = await prisma.productVariant.create({
      data: {
        productId,
        inventoryMode: 'QUANTITY',
        sku: 'FIRST-RECEIPT-A',
        displayName: 'Bản A',
        status: 'ACTIVE',
        salePrice: '150000',
      },
    });
    await prisma.productVariant.createMany({
      data: [
        {
          productId,
          inventoryMode: 'QUANTITY',
          sku: 'ARCHIVED-STATUS',
          displayName: 'Ẩn',
          status: 'ARCHIVED',
          salePrice: '150000',
        },
        {
          productId,
          inventoryMode: 'QUANTITY',
          sku: 'ARCHIVED-TIME',
          displayName: 'Ẩn theo thời gian',
          archivedAt: new Date(),
          salePrice: '150000',
        },
        {
          productId,
          inventoryMode: 'SERIALIZED',
          sku: 'SERIALIZED-EXCLUDED',
          displayName: 'Theo số sê ri',
        },
      ],
    });
    for (const [slug, type, status, archivedAt] of [
      ['archived-product-status', 'ACCESSORY', 'ARCHIVED', null],
      ['archived-product-time', 'ACCESSORY', 'ACTIVE', new Date()],
      ['iphone-stock-choice', 'IPHONE', 'ACTIVE', null],
    ] as const) {
      await prisma.product.create({
        data: {
          name: slug,
          slug,
          type,
          status,
          archivedAt,
          variants: {
            create: {
              sku: slug,
              displayName: 'Không được chọn',
              inventoryMode: 'QUANTITY',
              salePrice: '150000',
            },
          },
        },
      });
    }
    expect(await prisma.stockLevel.count({ where: { variantId } })).toBe(0);

    const firstPage = await request(server)
      .get('/api/v1/backoffice/stock-variants')
      .set(bearer(employee))
      .query({ page: 1, pageSize: 1 })
      .expect(200);
    expect(successArray(firstPage)).toMatchObject([{ id: activeVariant.id, status: 'ACTIVE' }]);
    expect(firstPage.body as unknown).toMatchObject({
      meta: { pagination: { page: 1, pageSize: 1, totalItems: 2, totalPages: 2 } },
    });
    const secondPage = await request(server)
      .get('/api/v1/backoffice/stock-variants')
      .set(bearer(employee))
      .query({ page: 2, pageSize: 1 })
      .expect(200);
    expect(successArray(secondPage)).toEqual([
      {
        id: variantId,
        sku: 'FIRST-RECEIPT-B',
        displayName: 'Bản B',
        status: 'DRAFT',
        product: {
          id: productId,
          name: 'Phụ kiện nhập lần đầu',
          slug: 'first-accessory-receipt',
          status: 'DRAFT',
        },
      },
    ]);
    expect(JSON.stringify(secondPage.body)).not.toMatch(
      /salePrice|accessoryAttributes|stockLevels/,
    );
    for (const query of [{ page: 0 }, { pageSize: 101 }]) {
      await request(server)
        .get('/api/v1/backoffice/stock-variants')
        .set(bearer(employee))
        .query(query)
        .expect(400);
    }

    const location = await prisma.inventoryLocation.findFirstOrThrow({
      where: { status: 'ACTIVE' },
    });
    await stockCommand(server, employee, 'receive', {
      variantId,
      locationId: location.id,
      quantity: 5,
    });
    expect(await stockOnHand(prisma, variantId, location.id)).toBe(5);
    const levelList = await request(server)
      .get('/api/v1/backoffice/stock-levels')
      .set(bearer(employee))
      .query({ variantId })
      .expect(200);
    expect(successArray(levelList)).toMatchObject([
      { quantityOnHand: 5, variant: { id: variantId } },
    ]);
  });

  it('keeps accessory counters and movements atomic across every stock command', async () => {
    const employee = await login(server, 'EMPLOYEE');
    const variant = await prisma.productVariant.findFirstOrThrow({
      where: { product: { type: 'ACCESSORY' }, status: 'ACTIVE' },
    });
    const [store, warehouse] = await prisma.inventoryLocation.findMany({
      orderBy: { code: 'asc' },
    });
    if (store === undefined || warehouse === undefined) throw new Error('Expected demo locations');
    const beforeStore = await stockOnHand(prisma, variant.id, store.id);
    const beforeWarehouse = await stockOnHand(prisma, variant.id, warehouse.id);

    await stockCommand(server, employee, 'receive', {
      variantId: variant.id,
      locationId: store.id,
      quantity: 5,
      reason: 'Nhận lô phụ kiện demo',
    });
    await stockCommand(server, employee, 'transfer', {
      variantId: variant.id,
      fromLocationId: store.id,
      toLocationId: warehouse.id,
      quantity: 2,
      reason: 'Điều chuyển phụ kiện demo',
    });
    await stockCommand(server, employee, 'adjust', {
      variantId: variant.id,
      locationId: warehouse.id,
      quantity: 1,
      direction: 'OUT',
      reason: 'Điều chỉnh kiểm kê demo',
    });
    await request(server)
      .post('/api/v1/backoffice/stock/return')
      .set(bearer(employee))
      .send({
        variantId: variant.id,
        locationId: store.id,
        quantity: 1,
        referenceType: 'Order',
        referenceId: '0198e6c6-5798-7cde-a964-000000000099',
        reason: 'Reference generic cũ phải bị từ chối',
      })
      .expect(400);

    expect(await stockOnHand(prisma, variant.id, store.id)).toBe(beforeStore + 3);
    expect(await stockOnHand(prisma, variant.id, warehouse.id)).toBe(beforeWarehouse + 1);
    const movements = await request(server)
      .get('/api/v1/backoffice/stock-movements')
      .set(bearer(employee))
      .query({ variantId: variant.id, pageSize: 100 })
      .expect(200);
    expect(successArray(movements).map((item) => item['type'])).toEqual(
      expect.arrayContaining(['RECEIPT', 'TRANSFER', 'ADJUSTMENT_OUT']),
    );
  });

  it('rejects unauthorized, spoofed and oversized media without metadata writes', async () => {
    const unit = await prisma.inventoryUnit.findFirstOrThrow();
    const before = await prisma.productMedia.count({ where: { inventoryUnitId: unit.id } });
    await request(server).post(`/api/v1/backoffice/inventory-units/${unit.id}/media`).expect(401);
    const customer = await login(server, 'CUSTOMER');
    await request(server)
      .post(`/api/v1/backoffice/inventory-units/${unit.id}/media`)
      .set(bearer(customer))
      .expect(403);
    const employee = await login(server, 'EMPLOYEE');
    await request(server)
      .post(`/api/v1/backoffice/inventory-units/${unit.id}/media`)
      .set(bearer(employee))
      .attach('file', DEMO_PNG, { filename: 'spoof.jpg', contentType: 'image/jpeg' })
      .expect(415);
    await request(server)
      .post(`/api/v1/backoffice/inventory-units/${unit.id}/media`)
      .set(bearer(employee))
      .attach('file', Buffer.alloc(8 * 1024 * 1024 + 1), {
        filename: 'large.png',
        contentType: 'image/png',
      })
      .expect(413);
    expect(await prisma.productMedia.count({ where: { inventoryUnitId: unit.id } })).toBe(before);
  });

  it('preserves uniqueness/current/counters under requests released by a start latch', async () => {
    const employee = await login(server, 'EMPLOYEE');
    const target = await iphoneTarget(prisma);
    const duplicateStart = startLatch();
    const duplicateRequests = ['SLICE04DUPA1', 'SLICE04DUPB1'].map(async (serial) => {
      await duplicateStart.wait;
      return request(server)
        .post('/api/v1/backoffice/inventory-units')
        .set(bearer(employee))
        .send(intakeBody(target, serial, '490154203237518'));
    });
    duplicateStart.release();
    const duplicateResponses = await Promise.all(duplicateRequests);
    expect(duplicateResponses.map(({ status }) => status).sort()).toEqual([201, 409]);

    const inspected = successData(await intakeUnit(server, employee, target, 'SLICE04RACE01'));
    const inspectedId = stringProperty(inspected, 'id');
    const draft = await request(server)
      .post(`/api/v1/backoffice/inventory-units/${inspectedId}/inspections`)
      .set(bearer(employee))
      .send({ inspectionType: 'INTAKE' })
      .expect(201);
    const inspectionId = stringProperty(successData(draft), 'id');
    await request(server)
      .patch(`/api/v1/backoffice/inspections/${inspectionId}`)
      .set(bearer(employee))
      .send(passedInspectionInput())
      .expect(200);
    const completeStart = startLatch();
    const completeRequests = Array.from({ length: 2 }, async () => {
      await completeStart.wait;
      return request(server)
        .post(`/api/v1/backoffice/inspections/${inspectionId}/complete`)
        .set(bearer(employee));
    });
    completeStart.release();
    const completeResponses = await Promise.all(completeRequests);
    expect(completeResponses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(
      await prisma.inventoryInspection.count({
        where: { inventoryUnitId: inspectedId, isCurrent: true },
      }),
    ).toBe(1);

    const level = await prisma.stockLevel.findFirstOrThrow({
      where: { variant: { product: { type: 'ACCESSORY' } } },
    });
    await prisma.stockLevel.update({
      where: { id: level.id },
      data: { quantityOnHand: 10, quantityReserved: 0 },
    });
    const adjustStart = startLatch();
    const adjustRequests = Array.from({ length: 2 }, async () => {
      await adjustStart.wait;
      return request(server).post('/api/v1/backoffice/stock/adjust').set(bearer(employee)).send({
        variantId: level.variantId,
        locationId: level.locationId,
        quantity: 10,
        direction: 'OUT',
        reason: 'Concurrency stock gate',
      });
    });
    adjustStart.release();
    const adjustResponses = await Promise.all(adjustRequests);
    expect(adjustResponses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(await stockOnHand(prisma, level.variantId, level.locationId)).toBe(0);
  });

  it('keeps backoffice list p95 below 500ms for 20 concurrent users', async () => {
    const employee = await login(server, 'EMPLOYEE');
    await request(server)
      .get('/api/v1/backoffice/inventory-units')
      .set(bearer(employee))
      .expect(200);
    const start = startLatch();
    const calls = Array.from({ length: 20 }, async () => {
      await start.wait;
      const startedAt = performance.now();
      const response = await request(server)
        .get('/api/v1/backoffice/inventory-units')
        .set(bearer(employee));
      return { duration: performance.now() - startedAt, status: response.status };
    });
    start.release();
    const results = await Promise.all(calls);
    expect(results.every(({ status }) => status === 200)).toBe(true);
    const durations = results.map(({ duration }) => duration).sort((left, right) => left - right);
    expect(durations[Math.ceil(durations.length * 0.95) - 1]).toBeLessThan(500);
  });
});

interface IphoneTarget {
  variantId: string;
  locationId: string;
  productSlug: string;
}

async function iphoneTarget(prisma: PrismaClient): Promise<IphoneTarget> {
  const variant = await prisma.productVariant.findFirstOrThrow({
    where: { product: { type: 'IPHONE', status: 'ACTIVE' }, status: 'ACTIVE' },
    include: { product: true },
  });
  const location = await prisma.inventoryLocation.findFirstOrThrow({ where: { status: 'ACTIVE' } });
  return { variantId: variant.id, locationId: location.id, productSlug: variant.product.slug };
}

function intakeUnit(server: Server, token: string, target: IphoneTarget, serial: string) {
  return request(server)
    .post('/api/v1/backoffice/inventory-units')
    .set(bearer(token))
    .send(intakeBody(target, serial))
    .expect(201);
}

function intakeBody(target: IphoneTarget, serial: string, imei1?: string) {
  return {
    variantId: target.variantId,
    locationId: target.locationId,
    serial,
    ...(imei1 === undefined ? {} : { imei1 }),
    modelNumber: 'A2633',
    regionCode: 'VN/A',
    simLockStatus: 'UNLOCKED',
    simConfiguration: 'PHYSICAL_AND_ESIM',
    salePrice: '9990000',
  };
}

function passedInspectionInput() {
  return {
    batteryHealthPercent: 92,
    batteryReplacementStatus: 'ORIGINAL',
    conditionGrade: 'A',
    repairHistoryStatus: 'NONE_KNOWN',
    checks: {
      schemaVersion: 1,
      items: Object.fromEntries(
        IPHONE_CHECKLIST_V1.map(([key]) => [key, { status: 'PASS', note: null }]),
      ),
    },
  };
}

function uploadMedia(server: Server, token: string, path: string) {
  return request(server)
    .post(`/api/v1/backoffice/${path}`)
    .set(bearer(token))
    .field('altText', 'Ảnh kiểm thử')
    .attach('file', DEMO_PNG, { filename: 'asset.png', contentType: 'image/png' })
    .expect(201);
}

function stockCommand(server: Server, token: string, command: string, body: object) {
  return request(server)
    .post(`/api/v1/backoffice/stock/${command}`)
    .set(bearer(token))
    .send(body)
    .expect(200);
}

async function stockOnHand(prisma: PrismaClient, variantId: string, locationId: string) {
  return (
    await prisma.stockLevel.findUniqueOrThrow({
      where: { variantId_locationId: { variantId, locationId } },
    })
  ).quantityOnHand;
}

async function login(server: Server, role: 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER'): Promise<string> {
  const credentials = {
    ADMIN: ['admin@rephone.local', 'AdminDemo123'],
    EMPLOYEE: ['employee@rephone.local', 'EmployeeDemo123'],
    CUSTOMER: ['customer@rephone.local', 'CustomerDemo123'],
  } as const;
  const [email, password] = credentials[role];
  const response = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return stringProperty(successData(response), 'accessToken');
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function startLatch() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

function successRecord(body: unknown): Record<string, unknown> {
  if (!isRecord(body) || !isRecord(body['data'])) throw new Error('Expected success object');
  return body['data'];
}

function successData(response: Response): Record<string, unknown> {
  return successRecord(response.body as unknown);
}

function successArray(response: Response): Array<Record<string, unknown>> {
  const body: unknown = response.body;
  if (!isRecord(body) || !Array.isArray(body['data']) || !body['data'].every(isRecord)) {
    throw new Error('Expected success array');
  }
  return body['data'];
}

function stringProperty(value: Record<string, unknown>, key: string): string {
  const result = value[key];
  if (typeof result !== 'string') throw new Error(`Expected ${key} to be a string`);
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
