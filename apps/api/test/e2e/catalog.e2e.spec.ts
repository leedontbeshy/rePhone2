import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import { IPHONE_CHECKLIST_V1 } from '../../src/modules/catalog/catalog-projection.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

describe('public catalog HTTP contract', () => {
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

  it('lists one card per public product with stable pagination and paired prices', async () => {
    const response = await request(server)
      .get('/api/v1/products')
      .query({ pageSize: '100' })
      .expect(200);
    const data = successArray(response);
    const iphone13 = data.find((item) => property(item, 'slug') === 'iphone-13');

    expect(data).toHaveLength(50);
    expect(property(property(response.body as unknown, 'meta'), 'pagination')).toEqual({
      page: 1,
      pageSize: 100,
      totalItems: 50,
      totalPages: 1,
    });
    expect(iphone13).toMatchObject({
      productType: 'IPHONE',
      inStock: true,
      price: { fromPrice: '9990000', compareAtPrice: '10990000' },
      storageOptions: [128],
      colorOptions: ['Blue', 'Midnight'],
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /acquisitionCost|additionalCost|serialHmac|serialEncrypted|locationId|objectPath|inspectorId/,
    );
    expectNoForbiddenPublicKeys(response.body as unknown);
  });

  it('combines search, typed filters, sorting and out-of-range pagination', async () => {
    const search = await request(server)
      .get('/api/v1/products')
      .query({ q: 'IPHONE   14', storageCapacityGb: '256' })
      .expect(200);
    expect(successArray(search).map((item) => property(item, 'slug'))).toEqual(['iphone-14-pro']);

    const accessories = await request(server)
      .get('/api/v1/products')
      .query({ productType: 'ACCESSORY', inStock: 'true', sortBy: 'fromPrice', sortOrder: 'asc' })
      .expect(200);
    expect(
      successArray(accessories).map((item) => property(property(item, 'price'), 'fromPrice')),
    ).toEqual(['390000', '490000', '590000']);

    const escapedWildcard = await request(server)
      .get('/api/v1/products')
      .query({ q: '%' })
      .expect(200);
    expect(successArray(escapedWildcard)).toEqual([]);

    for (const q of ['_', '\\', "%_' OR TRUE --"]) {
      const escaped = await request(server).get('/api/v1/products').query({ q }).expect(200);
      expect(successArray(escaped)).toEqual([]);
    }

    const emptyPage = await request(server)
      .get('/api/v1/products')
      .query({ page: '2', pageSize: '100' })
      .expect(200);
    expect(successArray(emptyPage)).toEqual([]);
    expect(
      property(property(property(emptyPage.body as unknown, 'meta'), 'pagination'), 'totalItems'),
    ).toBe(50);
  });

  it('rejects invalid catalog query input without coercing it', async () => {
    for (const query of [
      { pageSize: '101' },
      { inStock: '1' },
      { minPrice: '9000000', maxPrice: '1000000' },
      { sortBy: 'raw_sql' },
      { unknown: 'field' },
    ]) {
      const response = await request(server).get('/api/v1/products').query(query).expect(400);
      expect(errorCode(response)).toBe('VALIDATION_FAILED');
    }
  });

  it('returns public product and exact used-iPhone projections and hides non-public units', async () => {
    const product = await request(server).get('/api/v1/products/iphone-13').expect(200);
    const productData = successObject(product);
    expectNoForbiddenPublicKeys(product.body as unknown);
    const variants = property(productData, 'variants');
    expect(Array.isArray(variants)).toBe(true);
    expect(
      (variants as unknown[]).flatMap(
        (variant) => property(variant, 'availableUnits') as unknown[],
      ),
    ).toHaveLength(2);

    const exact = await request(server)
      .get('/api/v1/products/iphone-13/units/IP13-MID-001')
      .expect(200);
    const exactData = successObject(exact);
    expect(property(property(exactData, 'unit'), 'maskedIdentifiers')).toEqual([
      { type: 'SERIAL', maskedValue: '•••• D001' },
    ]);
    expect(property(property(exactData, 'unit'), 'functionalChecks')).toHaveLength(18);
    expect(JSON.stringify(exact.body)).not.toMatch(
      /serialEncrypted|serialHmac|locationId|inspectorId|acquisitionCost|objectPath/,
    );
    expectNoForbiddenPublicKeys(exact.body as unknown);

    await prisma.inventoryUnit.update({
      where: { inventoryCode: 'IP13-MID-001' },
      data: { lifecycleStatus: 'INSPECTING' },
    });
    await request(server).get('/api/v1/products/iphone-13/units/IP13-MID-001').expect(404);
    await request(server).get('/api/v1/products/iphone-demo-draft').expect(404);
  });

  it('applies the complete filter contract and keeps null prices last in both directions', async () => {
    await expectSlugs({ releaseYear: '2021' }, [
      'iphone-13-pro-max',
      'iphone-13-pro',
      'iphone-13-mini',
      'iphone-13',
    ]);
    await expectSlugs({ colorName: 'blue' }, ['iphone-13']);
    await expectSlugs({ minPrice: '10000000', maxPrice: '11000000' }, ['iphone-13']);
    await expectSlugs(
      {
        productType: 'IPHONE',
        releaseYear: '2021',
        storageCapacityGb: '128',
        colorName: 'Blue',
        minPrice: '9000000',
        maxPrice: '10000000',
        inStock: 'true',
      },
      ['iphone-13'],
    );

    await prisma.product.create({
      data: {
        slug: 'active-oos-demo',
        type: 'IPHONE',
        name: 'iPhone chưa mở bán',
        status: 'ACTIVE',
      },
    });

    for (const sortOrder of ['asc', 'desc']) {
      const response = await request(server)
        .get('/api/v1/products')
        .query({ sortBy: 'fromPrice', sortOrder, pageSize: '100' })
        .expect(200);
      const slugs = successArray(response).map((item) => property(item, 'slug'));
      const items = successArray(response);
      const firstItemWithoutPrice = items.findIndex(
        (item) => property(property(item, 'price'), 'fromPrice') === undefined,
      );
      expect(firstItemWithoutPrice).toBeGreaterThan(0);
      expect(
        items
          .slice(firstItemWithoutPrice)
          .every((item) => property(property(item, 'price'), 'fromPrice') === undefined),
      ).toBe(true);
      expect(slugs).toContain('active-oos-demo');
    }

    await expectSlugs({ q: 'chưa mở bán', inStock: 'false' }, ['active-oos-demo']);
    const detail = await request(server).get('/api/v1/products/active-oos-demo').expect(200);
    expect(property(successObject(detail), 'variants')).toEqual([]);
  });

  it('fails closed when a current inspection checklist is structurally invalid', async () => {
    const inspection = await prisma.inventoryInspection.findFirstOrThrow({
      where: { inventoryUnit: { inventoryCode: 'IP13-BLU-001' }, isCurrent: true },
    });
    const invalidItems = Object.fromEntries(
      IPHONE_CHECKLIST_V1.map(([key]) => [key, { status: 'PASS', note: null }]),
    );
    invalidItems['DISPLAY'] = { status: '', note: null };
    await prisma.inventoryInspection.update({
      where: { id: inspection.id },
      data: { checks: { schemaVersion: 1, items: invalidItems } },
    });

    const list = await request(server)
      .get('/api/v1/products')
      .query({ q: 'iphone 13' })
      .expect(200);
    const iphone13 = successArray(list).find((item) => property(item, 'slug') === 'iphone-13');
    expect(iphone13).toMatchObject({
      price: { fromPrice: '10990000', compareAtPrice: '11990000' },
    });
    await request(server).get('/api/v1/products/iphone-13/units/IP13-BLU-001').expect(404);
  });

  it('hides units for every negative visibility gate, including an active reservation', async () => {
    await createActiveUnitReservation(prisma, 'IP13-MID-001');
    await request(server).get('/api/v1/products/iphone-13/units/IP13-MID-001').expect(404);

    await prisma.inventoryUnit.update({
      where: { inventoryCode: 'IP13-BLU-001' },
      data: { salePrice: null, compareAtPrice: null },
    });
    await request(server).get('/api/v1/products/iphone-13/units/IP13-BLU-001').expect(404);

    const noPhoto = await prisma.inventoryUnit.findUniqueOrThrow({
      where: { inventoryCode: 'IP14P-128-001' },
      select: { id: true },
    });
    await prisma.productMedia.deleteMany({ where: { inventoryUnitId: noPhoto.id } });
    await request(server).get('/api/v1/products/iphone-14-pro/units/IP14P-128-001').expect(404);

    await prisma.inventoryInspection.updateMany({
      where: { inventoryUnit: { inventoryCode: 'IP14P-256-001' }, isCurrent: true },
      data: { overallResult: 'FAILED' },
    });
    await request(server).get('/api/v1/products/iphone-14-pro/units/IP14P-256-001').expect(404);

    await request(server).get('/api/v1/products/iphone-13/units/IP15PM-256-001').expect(404);
    await prisma.inventoryLocation.update({
      where: { code: 'HCM-STORE-01' },
      data: { status: 'INACTIVE' },
    });
    await request(server)
      .get('/api/v1/products/iphone-15-pro-max/units/IP15PM-256-001')
      .expect(404);
  });

  it('projects accessory availability and safely falls back around invalid media', async () => {
    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: 'cap-usb-c-to-lightning' },
      select: {
        id: true,
        media: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true } },
        variants: { select: { id: true, sku: true } },
      },
    });
    const variant = product.variants.find(({ sku }) => sku === 'ACC-CABLE-USBC-LTG-1M');
    if (variant === undefined) {
      throw new TypeError('Expected seeded cable variant');
    }
    const storeStock = await prisma.stockLevel.findFirstOrThrow({
      where: { variantId: variant.id, location: { type: 'STORE' } },
    });
    await prisma.stockLevel.update({
      where: { id: storeStock.id },
      data: { quantityReserved: storeStock.quantityOnHand },
    });
    await prisma.productMedia.deleteMany({ where: { variantId: variant.id } });
    await prisma.productMedia.updateMany({
      where: { productId: product.id },
      data: { sortOrder: 1 },
    });
    await prisma.productMedia.create({
      data: {
        productId: product.id,
        bucket: 'public-test',
        objectPath: '../unsafe.png',
        visibility: 'PUBLIC',
        mimeType: 'image/png',
        width: 100,
        height: 100,
        fileSize: 100,
        sortOrder: 0,
      },
    });

    const response = await request(server)
      .get('/api/v1/products/cap-usb-c-to-lightning')
      .expect(200);
    const variants = records(property(successObject(response), 'variants'));
    expect(variants).toHaveLength(1);
    expect(property(variants[0], 'fulfillmentAvailability')).toEqual({
      inStock: true,
      pickup: false,
      shipping: true,
    });
    const media = records(property(variants[0], 'media'));
    expect(property(media[0], 'url')).toMatch(/products\/cap-usb-c-to-lightning\.png$/);
    expectNoForbiddenPublicKeys(response.body as unknown);
  });

  async function expectSlugs(query: Record<string, string>, expected: string[]): Promise<void> {
    const response = await request(server).get('/api/v1/products').query(query).expect(200);
    expect(successArray(response).map((item) => property(item, 'slug'))).toEqual(expected);
  }
});

async function createActiveUnitReservation(
  prisma: PrismaClient,
  inventoryCode: string,
): Promise<void> {
  const unit = await prisma.inventoryUnit.findUniqueOrThrow({
    where: { inventoryCode },
    select: {
      id: true,
      inventoryCode: true,
      salePrice: true,
      locationId: true,
      warrantyDaysOverride: true,
      variant: {
        select: {
          id: true,
          sku: true,
          displayName: true,
          product: { select: { id: true, name: true, type: true } },
        },
      },
    },
  });
  if (unit.salePrice === null) {
    throw new TypeError('Expected priced seeded unit');
  }
  const cart = await prisma.cart.create({
    data: {
      guestTokenHash: 'a'.repeat(64),
      expiresAt: new Date('2026-08-22T00:00:00.000Z'),
    },
  });
  const amount = unit.salePrice.toString();
  const order = await prisma.order.create({
    data: {
      orderNumber: 'ORD-CATALOG-RESERVATION',
      sourceCartId: cart.id,
      guestAccessTokenHash: 'b'.repeat(64),
      customerName: 'Catalog Test',
      customerEmail: 'catalog-test@example.com',
      customerPhone: '0900000000',
      fulfillmentType: 'PICKUP',
      fulfillmentLocationId: unit.locationId,
      pickupLocationId: unit.locationId,
      pickupHoldUntil: new Date('2026-08-22T00:00:00.000Z'),
      placedAt: new Date('2026-08-21T00:00:00.000Z'),
      subtotal: amount,
      grandTotal: amount,
      balanceDue: amount,
    },
  });
  const item = await prisma.orderItem.create({
    data: {
      orderId: order.id,
      productId: unit.variant.product.id,
      variantId: unit.variant.id,
      inventoryUnitId: unit.id,
      productTypeSnapshot: unit.variant.product.type,
      productNameSnapshot: unit.variant.product.name,
      variantNameSnapshot: unit.variant.displayName,
      skuSnapshot: unit.variant.sku,
      inventoryCodeSnapshot: unit.inventoryCode,
      quantity: 1,
      unitPrice: amount,
      lineSubtotal: amount,
      lineTotal: amount,
      warrantyDaysSnapshot: unit.warrantyDaysOverride ?? 90,
      warrantyTermsSnapshot: 'Bảo hành fixture catalog.',
    },
  });
  await prisma.inventoryReservation.create({
    data: {
      orderId: order.id,
      orderItemId: item.id,
      inventoryUnitId: unit.id,
      quantity: 1,
      status: 'ACTIVE',
      holdReason: 'PICKUP',
      expiresAt: new Date('2026-08-22T00:00:00.000Z'),
    },
  });
}

function successArray(response: Response): Array<Record<string, unknown>> {
  const body = response.body as { data?: unknown };
  if (!Array.isArray(body.data)) {
    throw new TypeError('Expected collection success envelope');
  }
  return body.data as Array<Record<string, unknown>>;
}

function successObject(response: Response): Record<string, unknown> {
  const body = response.body as { data?: unknown };
  if (body.data === null || typeof body.data !== 'object' || Array.isArray(body.data)) {
    throw new TypeError('Expected resource success envelope');
  }
  return body.data as Record<string, unknown>;
}

function records(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new TypeError('Expected array of records');
  }
  return value as Array<Record<string, unknown>>;
}

function property(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Expected object with property ${key}`);
  }
  return (value as Record<string, unknown>)[key];
}

function errorCode(response: Response): unknown {
  const body = response.body as { error?: { code?: unknown } };
  return body.error?.code;
}

function expectNoForbiddenPublicKeys(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(expectNoForbiddenPublicKeys);
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    expect(key).not.toMatch(
      /cost|encrypted|hmac|objectPath|bucket|locationId|inspectorId|internalNote/i,
    );
    expectNoForbiddenPublicKeys(item);
  }
}
