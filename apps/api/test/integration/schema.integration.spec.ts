import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

interface CountResult {
  count: number;
}

describe('database baseline', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    setTestEnvironment();
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('deploys exactly 28 domain tables', async () => {
    const result = await prisma.$queryRaw<CountResult[]>`
      SELECT COUNT(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
    `;

    expect(result[0]?.count).toBe(28);
  });

  it('contains the required SQL constraints and partial unique indexes', async () => {
    const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'users_role_profile_check',
        'stock_levels_quantities_check',
        'inventory_reservations_target_check',
        'inventory_reservations_active_hold_check',
        'product_media_owner_check',
        'orders_money_check',
        'orders_shipping_deposit_check',
        'payments_checkout_deposit_check',
        'store_settings_singleton_check',
        'store_settings_bank_qr_pair_check'
      )
    `;
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'customer_addresses_one_default_active_per_user',
          'inventory_inspections_one_current_per_unit',
          'inventory_reservations_one_active_per_unit',
          'carts_one_active_per_customer',
          'after_sales_requests_one_open_per_order_item'
        )
    `;

    expect(constraints.map(({ conname }: { conname: string }) => conname).sort()).toHaveLength(10);
    expect(indexes.map(({ indexname }: { indexname: string }) => indexname).sort()).toHaveLength(5);
  });

  it('enforces representative singleton, owner XOR, and quantity checks', async () => {
    await expect(
      prisma.storeSettings.create({
        data: {
          key: 'NOT_STORE',
          storeName: 'Invalid',
          storePhone: '0900000000',
          storeAddress: 'Invalid',
          currency: 'VND',
          timezone: 'Asia/Ho_Chi_Minh',
          defaultShippingFee: '0',
          shippingDepositAmount: '1',
          pickupHoldMinutes: 1,
          depositProofWindowMinutes: 1,
          depositReviewWindowMinutes: 1,
          defaultWarrantyDays: 0,
          defaultWarrantyTerms: 'Invalid test row',
          bankName: 'Demo',
          bankAccountNumber: '0',
          bankAccountHolder: 'Demo',
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.productMedia.create({
        data: {
          bucket: 'rephone-public-test',
          objectPath: 'invalid/no-owner.jpg',
          visibility: 'PUBLIC',
          mimeType: 'image/jpeg',
          fileSize: 100,
        },
      }),
    ).rejects.toThrow();

    await expect(prisma.cart.create({ data: { status: 'ACTIVE' } })).rejects.toThrow();
  });

  it('seeds master data idempotently', async () => {
    await seedDatabase(prisma);
    await seedDatabase(prisma);

    const [
      settings,
      locations,
      policies,
      users,
      addresses,
      products,
      variants,
      units,
      stock,
      media,
      vouchers,
    ] = await Promise.all([
      prisma.storeSettings.count({ where: { key: 'STORE' } }),
      prisma.inventoryLocation.count({
        where: { code: { in: ['HCM-STORE-01', 'HCM-WH-01'] } },
      }),
      prisma.warrantyPolicy.count({
        where: { code: { in: ['IPHONE-90D', 'ACCESSORY-30D'] } },
      }),
      prisma.user.count({
        where: {
          normalizedEmail: {
            in: ['admin@rephone.local', 'employee@rephone.local', 'customer@rephone.local'],
          },
        },
      }),
      prisma.customerAddress.count({
        where: { user: { normalizedEmail: 'customer@rephone.local' }, isDefault: true },
      }),
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.productVariant.count({ where: { status: 'ACTIVE' } }),
      prisma.inventoryUnit.count({ where: { lifecycleStatus: 'AVAILABLE' } }),
      prisma.stockLevel.count({ where: { quantityOnHand: { gt: 0 } } }),
      prisma.productMedia.count({
        where: { objectPath: { startsWith: 'demo/catalog/', endsWith: '.png' } },
      }),
      prisma.voucher.count({
        where: {
          normalizedCode: { in: ['WELCOME100', 'IPHONE5', 'DEMO-DRAFT', 'DEMO-PAUSED'] },
        },
      }),
    ]);

    expect({
      settings,
      locations,
      policies,
      users,
      addresses,
      products,
      variants,
      units,
      stock,
      media,
      vouchers,
    }).toEqual({
      settings: 1,
      locations: 2,
      policies: 2,
      users: 3,
      addresses: 1,
      products: 6,
      variants: 8,
      units: 5,
      stock: 6,
      media: 14,
      vouchers: 4,
    });
  });

  it('does not reset operational inventory state when seed runs again', async () => {
    await seedDatabase(prisma);
    const unit = await prisma.inventoryUnit.findUniqueOrThrow({
      where: { inventoryCode: 'IP13-MID-001' },
    });
    const stock = await prisma.stockLevel.findFirstOrThrow({
      where: { variant: { sku: 'ACC-CABLE-USBC-LTG-1M' }, location: { code: 'HCM-STORE-01' } },
    });
    await prisma.inventoryUnit.update({
      where: { id: unit.id },
      data: { lifecycleStatus: 'QUARANTINED' },
    });
    await prisma.stockLevel.update({
      where: { id: stock.id },
      data: { quantityReserved: 3 },
    });

    await seedDatabase(prisma);

    const [preservedUnit, preservedStock] = await Promise.all([
      prisma.inventoryUnit.findUniqueOrThrow({ where: { id: unit.id } }),
      prisma.stockLevel.findUniqueOrThrow({ where: { id: stock.id } }),
    ]);
    expect(preservedUnit.lifecycleStatus).toBe('QUARANTINED');
    expect(preservedStock.quantityOnHand).toBe(stock.quantityOnHand);
    expect(preservedStock.quantityReserved).toBe(3);
  });
});
