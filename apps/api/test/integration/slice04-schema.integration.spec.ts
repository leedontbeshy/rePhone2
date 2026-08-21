import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

describe('Slice 04 database invariants', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    setTestEnvironment();
    prisma = createTestPrisma();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('enforces exactly one owner for product media', async () => {
    const product = await prisma.product.findFirstOrThrow();
    const variant = await prisma.productVariant.findFirstOrThrow({
      where: { productId: product.id },
    });
    await expect(
      prisma.productMedia.create({
        data: {
          productId: product.id,
          variantId: variant.id,
          bucket: 'public-test',
          objectPath: 'invalid/two-owners.png',
          visibility: 'PUBLIC',
          mimeType: 'image/png',
          fileSize: 10,
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces one current inspection per unit', async () => {
    const existing = await prisma.inventoryInspection.findFirstOrThrow({
      where: { isCurrent: true },
    });
    await expect(
      prisma.inventoryInspection.create({
        data: {
          inventoryUnitId: existing.inventoryUnitId,
          inspectorId: existing.inspectorId,
          inspectionType: 'PRE_SALE',
          status: 'COMPLETED',
          checks: { schemaVersion: 1, items: {} },
          overallResult: 'PASSED',
          isCurrent: true,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects impossible stock counters without writing a movement', async () => {
    const level = await prisma.stockLevel.findFirstOrThrow();
    const before = await prisma.stockMovement.count();
    await expect(
      prisma.stockLevel.update({
        where: { id: level.id },
        data: { quantityOnHand: 0, quantityReserved: 1 },
      }),
    ).rejects.toThrow();
    expect(await prisma.stockMovement.count()).toBe(before);
  });
});
