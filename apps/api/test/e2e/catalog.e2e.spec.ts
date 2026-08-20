import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
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
    const response = await request(server).get('/api/v1/products').expect(200);
    const data = successArray(response);
    const iphone13 = data.find((item) => property(item, 'slug') === 'iphone-13');

    expect(data).toHaveLength(6);
    expect(response.body.meta.pagination).toEqual({
      page: 1,
      pageSize: 20,
      totalItems: 6,
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

    const emptyPage = await request(server)
      .get('/api/v1/products')
      .query({ page: '2', pageSize: '100' })
      .expect(200);
    expect(successArray(emptyPage)).toEqual([]);
    expect(emptyPage.body.meta.pagination.totalItems).toBe(6);
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

    await prisma.inventoryUnit.update({
      where: { inventoryCode: 'IP13-MID-001' },
      data: { lifecycleStatus: 'INSPECTING' },
    });
    await request(server).get('/api/v1/products/iphone-13/units/IP13-MID-001').expect(404);
    await request(server).get('/api/v1/products/iphone-demo-draft').expect(404);
  });
});

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
