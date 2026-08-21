import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

describe('Slice 05 commerce database invariants', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    setTestEnvironment();
    prisma = createTestPrisma();
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('limits accessory quantities to 1 through 99 and serialized items to one', async () => {
    const customer = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'customer@rephone.local' },
      select: { id: true },
    });
    const accessory = await prisma.productVariant.findFirstOrThrow({
      where: { inventoryMode: 'QUANTITY' },
      select: { id: true, salePrice: true },
    });
    const serialized = await prisma.inventoryUnit.findFirstOrThrow({
      select: { id: true, variantId: true, salePrice: true },
    });
    const cart = await prisma.cart.create({
      data: { customerId: customer.id },
      select: { id: true },
    });

    try {
      await expect(
        prisma.cartItem.create({
          data: {
            cartId: cart.id,
            variantId: accessory.id,
            quantity: 100,
            priceAtAddition: accessory.salePrice ?? 0,
          },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.cartItem.create({
          data: {
            cartId: cart.id,
            variantId: serialized.variantId,
            inventoryUnitId: serialized.id,
            quantity: 2,
            priceAtAddition: serialized.salePrice ?? 0,
          },
        }),
      ).rejects.toThrow();
    } finally {
      await prisma.cart.delete({ where: { id: cart.id } });
    }
  });

  it('rejects fixed caps and non-positive percent caps', async () => {
    const now = new Date('2026-08-21T00:00:00.000Z');
    const later = new Date('2027-08-21T00:00:00.000Z');
    const normalizedCodes = [`FIXED-${randomUUID()}`, `PERCENT-${randomUUID()}`];

    await expect(
      prisma.voucher.create({
        data: {
          code: normalizedCodes[0]!,
          normalizedCode: normalizedCodes[0]!,
          name: 'Invalid fixed cap',
          discountType: 'FIXED',
          discountValue: 100_000,
          maxDiscountAmount: 50_000,
          startsAt: now,
          endsAt: later,
          visibility: 'PUBLIC',
          scopeType: 'ORDER',
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.voucher.create({
        data: {
          code: normalizedCodes[1]!,
          normalizedCode: normalizedCodes[1]!,
          name: 'Invalid percent cap',
          discountType: 'PERCENT',
          discountValue: 10,
          maxDiscountAmount: 0,
          startsAt: now,
          endsAt: later,
          visibility: 'PUBLIC',
          scopeType: 'ORDER',
        },
      }),
    ).rejects.toThrow();
  });
});
