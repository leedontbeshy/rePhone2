import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { VoucherRepository } from '../../src/modules/vouchers/voucher.repository.js';
import { createTestPrisma } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

describe('Voucher usage backoffice projection', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    setTestEnvironment();
    prisma = createTestPrisma();
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('loads order and customer summaries with the paginated usage query', async () => {
    const suffix = randomUUID();
    const customer = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'customer@rephone.local' },
      select: { id: true, fullName: true, email: true },
    });
    const location = await prisma.inventoryLocation.findFirstOrThrow({ select: { id: true } });
    const cart = await prisma.cart.create({
      data: { customerId: customer.id, status: 'CONVERTED' },
      select: { id: true },
    });
    const orderNumber = `RPH-INT-${suffix.slice(0, 12)}`;
    const order = await prisma.order.create({
      data: {
        orderNumber,
        sourceCartId: cart.id,
        customerId: customer.id,
        customerName: customer.fullName,
        customerEmail: customer.email,
        customerPhone: '0900000000',
        fulfillmentType: 'PICKUP',
        fulfillmentLocationId: location.id,
        pickupLocationId: location.id,
        subtotal: 0,
        grandTotal: 0,
        balanceDue: 0,
      },
      select: { id: true },
    });
    const voucher = await prisma.voucher.create({
      data: {
        code: `INT-${suffix}`,
        normalizedCode: `INT-${suffix}`,
        name: 'Integration projection voucher',
        discountType: 'FIXED',
        discountValue: 10_000,
        minimumOrderAmount: 0,
        startsAt: new Date('2026-01-01T00:00:00.000Z'),
        endsAt: new Date('2030-01-01T00:00:00.000Z'),
        visibility: 'ACCOUNT_ONLY',
        scopeType: 'ORDER',
      },
      select: { id: true },
    });

    try {
      const usage = await prisma.voucherUsage.create({
        data: {
          voucherId: voucher.id,
          orderId: order.id,
          customerId: customer.id,
        },
        select: { id: true },
      });

      const repository = new VoucherRepository(prisma as never);
      const result = await repository.listUsages(voucher.id, { page: 1, pageSize: 20 });

      expect(result.totalItems).toBe(1);
      expect(result.items).toEqual([
        expect.objectContaining({
          id: usage.id,
          orderId: order.id,
          order: { orderNumber },
          customerId: customer.id,
          customer: { fullName: customer.fullName, email: customer.email },
        }),
      ]);
    } finally {
      await prisma.voucherUsage.deleteMany({ where: { voucherId: voucher.id } });
      await prisma.order.delete({ where: { id: order.id } });
      await prisma.cart.delete({ where: { id: cart.id } });
      await prisma.voucher.delete({ where: { id: voucher.id } });
    }
  });
});
