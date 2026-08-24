import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import { findSlice09PreflightViolations } from '../../prisma/scripts/preflight-slice09.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

const PLACED_AT = new Date('2026-08-23T02:00:00.000Z');

describe('Slice 09 shipping fulfillment database invariants', () => {
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

  it('installs shipping, COD, return, and queue defenses', async () => {
    const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'orders_shipping_lifecycle_check',
        'orders_shipping_completed_finance_check',
        'orders_shipping_override_check',
        'payments_checkout_deposit_check',
        'payments_cod_fulfillment_check',
        'shipments_shape_check',
        'shipments_status_timestamp_check',
        'stock_movements_shipment_return_reference_check'
      )
      ORDER BY conname
    `;
    const indexes = await prisma.$queryRaw<Array<{ indexdef: string; indexname: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'orders_shipping_fulfillment_queue_idx',
          'payments_one_cod_balance_per_order',
          'stock_movements_one_return_per_shipment_variant'
        )
      ORDER BY indexname
    `;

    expect(constraints.map(({ conname }) => conname)).toEqual([
      'orders_shipping_completed_finance_check',
      'orders_shipping_lifecycle_check',
      'orders_shipping_override_check',
      'payments_checkout_deposit_check',
      'payments_cod_fulfillment_check',
      'shipments_shape_check',
      'shipments_status_timestamp_check',
      'stock_movements_shipment_return_reference_check',
    ]);
    expect(indexes.map(({ indexname }) => indexname)).toEqual([
      'orders_shipping_fulfillment_queue_idx',
      'payments_one_cod_balance_per_order',
      'stock_movements_one_return_per_shipment_variant',
    ]);
    expect(indexes[0]?.indexdef).toContain('(fulfillment_status, updated_at DESC, id) WHERE');
    expect(indexes[0]?.indexdef).toContain("fulfillment_type = 'SHIPPING'");
  });

  it('enforces shipping lifecycle and complete finance projection', async () => {
    const fixture = await createShippingFixture(prisma);
    await expect(
      prisma.order.update({
        where: { id: fixture.orderId },
        data: { fulfillmentStatus: 'READY' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.order.update({
        where: { id: fixture.orderId },
        data: {
          status: 'COMPLETED',
          fulfillmentStatus: 'COMPLETED',
          completedAt: new Date('2026-08-23T05:00:00.000Z'),
        },
      }),
    ).rejects.toThrow();
  });

  it('requires complete override metadata and allows only cancelled zero-value deposits', async () => {
    const fixture = await createShippingFixture(prisma, 'PLACED');
    const staff = await employee(prisma);
    await expect(
      prisma.order.update({
        where: { id: fixture.orderId },
        data: {
          shippingFee: '20000',
          grandTotal: '1020000',
          balanceDue: '1020000',
          shippingFeeOverrideReason: 'Điều chỉnh phí',
        },
      }),
    ).rejects.toThrow();

    await prisma.order.update({
      where: { id: fixture.orderId },
      data: {
        shippingFee: '20000',
        grandTotal: '1020000',
        balanceDue: '1020000',
        shippingFeeOverrideReason: 'Điều chỉnh phí giao hàng',
        shippingFeeOverriddenById: staff.id,
        shippingFeeOverriddenAt: new Date('2026-08-23T02:30:00.000Z'),
      },
    });

    const bankSnapshot = {
      transferContent: 'RPH-SLICE09',
      bankNameSnapshot: 'Ngân hàng kiểm thử',
      bankAccountNumberSnapshot: '0123456789',
      bankAccountHolderSnapshot: 'REPHONE TEST',
      reviewWindowMinutesSnapshot: 1440,
      expiresAt: new Date('2026-08-23T03:00:00.000Z'),
    };
    await expect(
      prisma.payment.create({
        data: {
          orderId: fixture.orderId,
          purpose: 'DEPOSIT',
          method: 'BANK_TRANSFER',
          expectedAmount: '0',
          status: 'AWAITING_PROOF',
          ...bankSnapshot,
        },
      }),
    ).rejects.toThrow();
    await prisma.payment.create({
      data: {
        orderId: fixture.orderId,
        purpose: 'DEPOSIT',
        method: 'BANK_TRANSFER',
        expectedAmount: '0',
        status: 'CANCELLED',
        ...bankSnapshot,
      },
    });
  });

  it('enforces shipment shape, chronology, and one attempt per order', async () => {
    const fixture = await createShippingFixture(prisma);
    const staff = await employee(prisma);
    await expect(
      prisma.shipment.create({
        data: {
          orderId: fixture.orderId,
          attemptNumber: 1,
          carrierName: ' ',
          trackingCode: 'TRACK-09',
          createdById: staff.id,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.shipment.create({
        data: {
          orderId: fixture.orderId,
          attemptNumber: 1,
          carrierName: 'VNPost',
          trackingCode: 'TRACK-09',
          trackingUrl: 'http://tracking.example.test/TRACK-09',
          createdById: staff.id,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.shipment.create({
        data: {
          orderId: fixture.orderId,
          attemptNumber: 1,
          carrierName: 'VNPost',
          trackingCode: 'TRACK-CREDENTIAL-09',
          trackingUrl: 'https://carrier-user:carrier-password@tracking.example.test/TRACK-09',
          createdById: staff.id,
        },
      }),
    ).rejects.toThrow();

    const shipment = await prisma.shipment.create({
      data: {
        orderId: fixture.orderId,
        attemptNumber: 1,
        carrierName: 'VNPost',
        trackingCode: 'TRACK-09',
        trackingUrl: 'https://tracking.example.test/TRACK-09',
        createdById: staff.id,
      },
    });
    await expect(
      prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(shipment.createdAt.getTime() + 1_000),
          failureReason: 'Không giao được',
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.shipment.create({
        data: {
          orderId: fixture.orderId,
          attemptNumber: 1,
          carrierName: 'Other',
          trackingCode: 'TRACK-10',
          createdById: staff.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('requires exact verified COD shape and one COD balance payment per order', async () => {
    const fixture = await createShippingFixture(prisma);
    const staff = await employee(prisma);
    const reviewedAt = new Date('2026-08-23T05:00:00.000Z');
    await expect(
      prisma.payment.create({
        data: {
          orderId: fixture.orderId,
          purpose: 'BALANCE',
          method: 'COD',
          expectedAmount: '530000',
          receivedAmount: '500000',
          status: 'VERIFIED',
          reviewedById: staff.id,
          reviewedAt,
        },
      }),
    ).rejects.toThrow();

    await prisma.payment.create({
      data: {
        orderId: fixture.orderId,
        purpose: 'BALANCE',
        method: 'COD',
        expectedAmount: '530000',
        receivedAmount: '530000',
        status: 'VERIFIED',
        reviewedById: staff.id,
        reviewedAt,
      },
    });
    await expect(
      prisma.payment.create({
        data: {
          orderId: fixture.orderId,
          purpose: 'BALANCE',
          method: 'COD',
          expectedAmount: '530000',
          receivedAmount: '530000',
          status: 'VERIFIED',
          reviewedById: staff.id,
          reviewedAt,
        },
      }),
    ).rejects.toThrow();
  });

  it('allows one inspected Shipment return per variant and rejects duplicate effects', async () => {
    const fixture = await createShippingFixture(prisma);
    const staff = await employee(prisma);
    const returnedLocation = await prisma.inventoryLocation.findFirstOrThrow({
      where: { status: 'ACTIVE', type: { in: ['STORE', 'WAREHOUSE'] } },
      select: { id: true },
    });
    const shipment = await prisma.shipment.create({
      data: {
        orderId: fixture.orderId,
        attemptNumber: 1,
        carrierName: 'VNPost',
        trackingCode: 'RETURN-09',
        createdById: staff.id,
      },
    });
    const shippedAt = new Date(shipment.createdAt.getTime() + 1_000);
    const failedAt = new Date(shippedAt.getTime() + 1_000);
    const returnedAt = new Date(failedAt.getTime() + 1_000);
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        status: 'RETURNED',
        shippedAt,
        failedAt,
        returnedAt,
        failureReason: 'Khách không nhận hàng',
        returnedToLocationId: returnedLocation.id,
        returnNote: 'Đã nhận và chờ kiểm tra',
      },
    });
    const movement = {
      variantId: fixture.variantId,
      toLocationId: returnedLocation.id,
      type: 'RETURN' as const,
      quantity: 1,
      referenceType: 'SHIPMENT',
      referenceId: shipment.id,
      reason: 'Đã kiểm tra phụ kiện hoàn',
      createdById: staff.id,
    };
    await prisma.stockMovement.create({ data: movement });
    await expect(prisma.stockMovement.create({ data: movement })).rejects.toThrow();
  });

  it('reports zero exact preflight violations for a valid preparing order', async () => {
    await createShippingFixture(prisma);

    const violations = await findSlice09PreflightViolations(prisma);
    expect(violations).toHaveLength(18);
    expect(violations.every(({ count }) => count === 0)).toBe(true);
    expect(violations.map(({ checkName }) => checkName)).toEqual([
      'orders_shipping_lifecycle_check',
      'orders_shipping_override_check',
      'payments_checkout_deposit_check',
      'payments_cod_fulfillment_check',
      'payments_one_cod_balance_per_order',
      'shipments_shape_check',
      'shipments_status_timestamp_check',
      'shipments_shipping_order_alignment',
      'shipping_order_shipment_mirror',
      'shipments_return_location_check',
      'shipping_handover_finance_confirmation',
      'completed_shipping_finance_projection',
      'shipping_handover_inventory_consumption',
      'completed_shipping_voucher_consumption',
      'completed_shipping_warranty_issuance',
      'stock_movements_shipment_return_reference_check',
      'stock_movements_one_return_per_shipment_variant',
      'stock_movements_shipment_return_alignment',
    ]);
  });

  it('does not reset operational shipping or Shipment state on reseed', async () => {
    const fixture = await createShippingFixture(prisma);
    const staff = await employee(prisma);
    const shipment = await prisma.shipment.create({
      data: {
        orderId: fixture.orderId,
        attemptNumber: 1,
        carrierName: 'VNPost',
        trackingCode: 'SEED-SAFE-09',
        createdById: staff.id,
      },
    });
    const before = await readShippingState(prisma, fixture.orderId, shipment.id);

    await seedDatabase(prisma);
    await seedDatabase(prisma);

    expect(await readShippingState(prisma, fixture.orderId, shipment.id)).toEqual(before);
  });
});

type ShippingFixture = {
  orderId: string;
  orderItemId: string;
  stockLevelId: string;
  variantId: string;
  locationId: string;
};

async function createShippingFixture(
  prisma: PrismaClient,
  state: 'PLACED' | 'PREPARING' = 'PREPARING',
): Promise<ShippingFixture> {
  const stock = await prisma.stockLevel.findFirstOrThrow({
    where: { variant: { inventoryMode: 'QUANTITY' }, quantityOnHand: { gt: 0 } },
    include: { variant: { include: { product: true } } },
  });
  const cart = await prisma.cart.create({
    data: {
      guestTokenHash: randomHex64(),
      status: 'CONVERTED',
      expiresAt: new Date('2026-09-01T02:00:00.000Z'),
    },
  });
  const preparing = state === 'PREPARING';
  const order = await prisma.order.create({
    data: {
      orderNumber: `RPH-20260823-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
      sourceCartId: cart.id,
      guestAccessTokenHash: randomHex64(),
      customerName: 'Khách kiểm thử Slice 09',
      customerEmail: 'slice09-db@example.com',
      customerPhone: '0900000000',
      fulfillmentType: 'SHIPPING',
      fulfillmentLocationId: stock.locationId,
      fulfillmentStatus: preparing ? 'PREPARING' : 'PENDING',
      status: preparing ? 'PROCESSING' : 'PLACED',
      confirmedAt: preparing ? new Date('2026-08-23T03:00:00.000Z') : null,
      shippingAddressSnapshot: {
        receiverName: 'Khách kiểm thử Slice 09',
        phone: '0900000000',
        addressLine: '123 Đường Kiểm Thử',
        ward: 'Phường Test',
        district: 'Quận Test',
        province: 'TP. Hồ Chí Minh',
      },
      subtotal: '1000000',
      shippingFeeOriginal: '30000',
      shippingFee: '30000',
      grandTotal: '1030000',
      depositRequired: '500000',
      balanceDue: '1030000',
      placedAt: PLACED_AT,
    },
  });
  const orderItem = await prisma.orderItem.create({
    data: {
      orderId: order.id,
      productId: stock.variant.productId,
      variantId: stock.variantId,
      productTypeSnapshot: stock.variant.product.type,
      productNameSnapshot: stock.variant.product.name,
      variantNameSnapshot: stock.variant.displayName,
      skuSnapshot: stock.variant.sku,
      quantity: 1,
      unitPrice: '1000000',
      lineSubtotal: '1000000',
      lineTotal: '1000000',
      warrantyDaysSnapshot: 30,
      warrantyTermsSnapshot: 'Bảo hành kiểm thử 30 ngày',
    },
  });
  return {
    orderId: order.id,
    orderItemId: orderItem.id,
    stockLevelId: stock.id,
    variantId: stock.variantId,
    locationId: stock.locationId,
  };
}

async function employee(prisma: PrismaClient): Promise<{ id: string }> {
  return prisma.user.findUniqueOrThrow({
    where: { normalizedEmail: 'employee@rephone.local' },
    select: { id: true },
  });
}

async function readShippingState(prisma: PrismaClient, orderId: string, shipmentId: string) {
  const [order, shipment] = await Promise.all([
    prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, fulfillmentStatus: true, updatedAt: true },
    }),
    prisma.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      select: {
        status: true,
        carrierName: true,
        trackingCode: true,
        trackingUrl: true,
        updatedAt: true,
      },
    }),
  ]);
  return { order, shipment };
}

function randomHex64(): string {
  return randomUUID().replaceAll('-', '').repeat(2);
}
