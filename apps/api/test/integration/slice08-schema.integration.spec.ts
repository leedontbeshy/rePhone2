import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import { findSlice08PreflightViolations } from '../../prisma/scripts/preflight-slice08.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

const PLACED_AT = new Date('2026-08-23T02:00:00.000Z');
const HOLD_UNTIL = new Date('2026-09-01T02:00:00.000Z');

describe('Slice 08 pickup fulfillment database invariants', () => {
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

  it('installs the pickup, finalization, and warranty constraints plus queue indexes', async () => {
    const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'inventory_reservations_order_item_order_fkey',
        'order_items_id_order_id_key',
        'orders_pickup_completed_finance_check',
        'orders_pickup_lifecycle_check',
        'orders_pickup_deadline_timestamps_check',
        'payments_cash_fulfillment_check',
        'stock_movements_sale_reference_check',
        'warranties_code_shape_check',
        'warranties_interval_check'
      )
      ORDER BY conname
    `;
    const indexes = await prisma.$queryRaw<Array<{ indexdef: string; indexname: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'orders_pickup_expiry_queue_idx',
          'inventory_reservations_one_active_per_order_item',
          'payments_one_cash_full_payment_per_order',
          'stock_movements_one_sale_per_reservation'
        )
      ORDER BY indexname
    `;
    const triggers = await prisma.$queryRaw<Array<{ tgname: string }>>`
      SELECT tgname
      FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgname = 'stock_movements_sale_reservation_alignment'
    `;

    expect(constraints.map(({ conname }) => conname)).toEqual([
      'inventory_reservations_order_item_order_fkey',
      'order_items_id_order_id_key',
      'orders_pickup_completed_finance_check',
      'orders_pickup_deadline_timestamps_check',
      'orders_pickup_lifecycle_check',
      'payments_cash_fulfillment_check',
      'stock_movements_sale_reference_check',
      'warranties_code_shape_check',
      'warranties_interval_check',
    ]);
    expect(indexes.map(({ indexname }) => indexname)).toEqual([
      'inventory_reservations_one_active_per_order_item',
      'orders_pickup_expiry_queue_idx',
      'payments_one_cash_full_payment_per_order',
      'stock_movements_one_sale_per_reservation',
    ]);
    expect(
      indexes.find(({ indexname }) => indexname === 'orders_pickup_expiry_queue_idx')?.indexdef,
    ).toContain('(pickup_hold_until, id) WHERE');
    expect(
      indexes.find(({ indexname }) => indexname === 'orders_pickup_expiry_queue_idx')?.indexdef,
    ).toContain("fulfillment_type = 'PICKUP'");
    expect(triggers).toEqual([{ tgname: 'stock_movements_sale_reservation_alignment' }]);
  });

  it('enforces the pickup lifecycle and chronological deadline timestamps', async () => {
    const fixture = await createOrderFixture(prisma);
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
          status: 'CONFIRMED',
          confirmedAt: new Date(HOLD_UNTIL.getTime() + 1_000),
        },
      }),
    ).rejects.toThrow();

    const confirmedAt = new Date('2026-08-23T03:00:00.000Z');
    const pickupReadyAt = new Date('2026-08-23T04:00:00.000Z');
    const completedAt = new Date('2026-08-23T05:00:00.000Z');
    await prisma.order.update({
      where: { id: fixture.orderId },
      data: { status: 'CONFIRMED', confirmedAt },
    });
    await prisma.order.update({
      where: { id: fixture.orderId },
      data: { status: 'PROCESSING', fulfillmentStatus: 'PREPARING' },
    });
    await expect(
      prisma.order.update({
        where: { id: fixture.orderId },
        data: { fulfillmentStatus: 'READY' },
      }),
    ).rejects.toThrow();
    await prisma.order.update({
      where: { id: fixture.orderId },
      data: { fulfillmentStatus: 'READY', pickupReadyAt },
    });
    await expect(
      prisma.order.update({
        where: { id: fixture.orderId },
        data: {
          status: 'COMPLETED',
          fulfillmentStatus: 'COMPLETED',
          pickedUpAt: completedAt,
          completedAt: new Date(completedAt.getTime() + 1_000),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.order.update({
        where: { id: fixture.orderId },
        data: {
          status: 'COMPLETED',
          fulfillmentStatus: 'COMPLETED',
          pickedUpAt: completedAt,
          completedAt,
        },
      }),
    ).rejects.toThrow();
    await prisma.order.update({
      where: { id: fixture.orderId },
      data: {
        status: 'COMPLETED',
        fulfillmentStatus: 'COMPLETED',
        paymentStatus: 'PAID',
        paidAmount: '1000000',
        balanceDue: '0',
        pickedUpAt: completedAt,
        completedAt,
      },
    });
  });

  it('does not apply pickup lifecycle pairs to shipping orders', async () => {
    const fixture = await createOrderFixture(prisma, 'SHIPPING');

    const order = await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } });
    expect(order).toMatchObject({
      fulfillmentType: 'SHIPPING',
      status: 'CONFIRMED',
      fulfillmentStatus: 'PREPARING',
    });
  });

  it('allows only one active reservation for an order item', async () => {
    const fixture = await createOrderFixture(prisma);
    const stockLevels = await prisma.stockLevel.findMany({
      where: { quantityOnHand: { gt: 0 } },
      orderBy: { id: 'asc' },
      take: 2,
      select: { id: true },
    });
    expect(stockLevels).toHaveLength(2);
    const first = await prisma.inventoryReservation.create({
      data: {
        orderId: fixture.orderId,
        orderItemId: fixture.orderItemId,
        stockLevelId: stockLevels[0]?.id as string,
        quantity: 1,
        holdReason: 'PICKUP',
        expiresAt: HOLD_UNTIL,
      },
    });
    await expect(
      prisma.inventoryReservation.create({
        data: {
          orderId: fixture.orderId,
          orderItemId: fixture.orderItemId,
          stockLevelId: stockLevels[1]?.id as string,
          quantity: 1,
          holdReason: 'PICKUP',
          expiresAt: HOLD_UNTIL,
        },
      }),
    ).rejects.toThrow();

    await prisma.inventoryReservation.update({
      where: { id: first.id },
      data: { status: 'RELEASED', releasedAt: new Date('2026-08-23T03:00:00.000Z') },
    });
    await prisma.inventoryReservation.create({
      data: {
        orderId: fixture.orderId,
        orderItemId: fixture.orderItemId,
        stockLevelId: stockLevels[1]?.id as string,
        quantity: 1,
        holdReason: 'PICKUP',
        expiresAt: HOLD_UNTIL,
      },
    });
    expect(
      await prisma.inventoryReservation.count({
        where: { orderItemId: fixture.orderItemId, status: 'ACTIVE' },
      }),
    ).toBe(1);
  });

  it('rejects a reservation whose order and order item owners differ', async () => {
    const first = await createOrderFixture(prisma);
    const second = await createOrderFixture(prisma);

    await expect(
      prisma.inventoryReservation.create({
        data: {
          orderId: first.orderId,
          orderItemId: second.orderItemId,
          stockLevelId: second.stockLevelId,
          quantity: 1,
          holdReason: 'PICKUP',
          expiresAt: HOLD_UNTIL,
        },
      }),
    ).rejects.toThrow();
  });

  it('requires the finalization-only cash shape and one cash payment per order', async () => {
    const fixture = await createOrderFixture(prisma);
    const reviewer = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'employee@rephone.local' },
      select: { id: true },
    });
    const reviewedAt = new Date('2026-08-23T05:00:00.000Z');
    await expect(
      prisma.payment.create({
        data: {
          orderId: fixture.orderId,
          purpose: 'BALANCE',
          method: 'CASH',
          expectedAmount: '1000000',
          receivedAmount: '1000000',
          status: 'VERIFIED',
          reviewedById: reviewer.id,
          reviewedAt,
        },
      }),
    ).rejects.toThrow();

    await prisma.payment.create({
      data: {
        orderId: fixture.orderId,
        purpose: 'FULL_PAYMENT',
        method: 'CASH',
        expectedAmount: '1000000',
        receivedAmount: '1000000',
        status: 'VERIFIED',
        reviewedById: reviewer.id,
        reviewedAt,
      },
    });
    await expect(
      prisma.payment.create({
        data: {
          orderId: fixture.orderId,
          purpose: 'FULL_PAYMENT',
          method: 'CASH',
          expectedAmount: '1000000',
          receivedAmount: '1000000',
          status: 'VERIFIED',
          reviewedById: reviewer.id,
          reviewedAt,
        },
      }),
    ).rejects.toThrow();
  });

  it('requires one reservation reference for every sale movement', async () => {
    const fixture = await createOrderFixture(prisma);
    const reservation = await prisma.inventoryReservation.create({
      data: {
        orderId: fixture.orderId,
        orderItemId: fixture.orderItemId,
        stockLevelId: fixture.stockLevelId,
        quantity: 1,
        holdReason: 'PICKUP',
        expiresAt: HOLD_UNTIL,
      },
    });
    await expect(
      prisma.stockMovement.create({
        data: {
          variantId: fixture.variantId,
          fromLocationId: fixture.locationId,
          type: 'SALE',
          quantity: 1,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.stockMovement.create({
        data: {
          variantId: fixture.variantId,
          fromLocationId: fixture.locationId,
          type: 'SALE',
          quantity: 2,
          referenceType: 'INVENTORY_RESERVATION',
          referenceId: reservation.id,
        },
      }),
    ).rejects.toThrow();

    await prisma.stockMovement.create({
      data: {
        variantId: fixture.variantId,
        fromLocationId: fixture.locationId,
        type: 'SALE',
        quantity: 1,
        referenceType: 'INVENTORY_RESERVATION',
        referenceId: reservation.id,
      },
    });
    await expect(
      prisma.stockMovement.create({
        data: {
          variantId: fixture.variantId,
          fromLocationId: fixture.locationId,
          type: 'SALE',
          quantity: 1,
          referenceType: 'INVENTORY_RESERVATION',
          referenceId: reservation.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('requires a positive, exact warranty interval', async () => {
    const fixture = await createOrderFixture(prisma);
    const startAt = new Date('2026-08-23T05:00:00.000Z');
    await expect(
      prisma.warranty.create({
        data: {
          warrantyCode: warrantyCode(),
          orderItemId: fixture.orderItemId,
          daysSnapshot: 0,
          termsSnapshot: 'Bảo hành kiểm thử',
          startAt,
          endAt: startAt,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.warranty.create({
        data: {
          warrantyCode: `WTY-20260823-${randomUUID().replaceAll('-', '').slice(0, 8)}`,
          orderItemId: fixture.orderItemId,
          daysSnapshot: 30,
          termsSnapshot: 'Bảo hành kiểm thử',
          startAt,
          endAt: addDays(startAt, 30),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.warranty.create({
        data: {
          warrantyCode: warrantyCode(),
          orderItemId: fixture.orderItemId,
          daysSnapshot: 30,
          termsSnapshot: 'Bảo hành kiểm thử',
          startAt,
          endAt: addDays(startAt, 29),
        },
      }),
    ).rejects.toThrow();

    const warranty = await prisma.warranty.create({
      data: {
        warrantyCode: warrantyCode(),
        orderItemId: fixture.orderItemId,
        daysSnapshot: 30,
        termsSnapshot: 'Bảo hành kiểm thử',
        startAt,
        endAt: addDays(startAt, 30),
      },
    });
    expect(warranty.endAt).toEqual(addDays(startAt, 30));
  });

  it('reports zero exact preflight violations for a valid Slice 08 database', async () => {
    const fixture = await createOrderFixture(prisma);
    await prisma.$transaction(async (transaction) => {
      await transaction.stockLevel.update({
        where: { id: fixture.stockLevelId },
        data: { quantityReserved: { increment: 1 } },
      });
      await transaction.inventoryReservation.create({
        data: {
          orderId: fixture.orderId,
          orderItemId: fixture.orderItemId,
          stockLevelId: fixture.stockLevelId,
          quantity: 1,
          holdReason: 'PICKUP',
          expiresAt: HOLD_UNTIL,
        },
      });
    });

    expect(await findSlice08PreflightViolations(prisma)).toEqual([
      { checkName: 'orders_pickup_lifecycle_check', count: 0 },
      { checkName: 'orders_pickup_deadline_timestamps_check', count: 0 },
      { checkName: 'inventory_reservations_one_active_per_order_item', count: 0 },
      { checkName: 'inventory_reservations_order_item_alignment', count: 0 },
      { checkName: 'pickup_location_shape', count: 0 },
      { checkName: 'pickup_active_reservation_mirror', count: 0 },
      { checkName: 'payments_cash_fulfillment_check', count: 0 },
      { checkName: 'payments_one_cash_full_payment_per_order', count: 0 },
      { checkName: 'stock_movements_sale_reference_check', count: 0 },
      { checkName: 'stock_movements_one_sale_per_reservation', count: 0 },
      { checkName: 'stock_movements_sale_reservation_alignment', count: 0 },
      { checkName: 'warranties_interval_check', count: 0 },
      { checkName: 'warranties_code_shape_check', count: 0 },
      { checkName: 'completed_pickup_finance_projection', count: 0 },
      { checkName: 'completed_pickup_inventory_consumption', count: 0 },
      { checkName: 'completed_pickup_voucher_consumption', count: 0 },
      { checkName: 'completed_pickup_warranty_issuance', count: 0 },
    ]);
  });

  it('reports incomplete terminal effects and incorrect active hold mirrors', async () => {
    const completed = await createOrderFixture(prisma);
    const completedAt = new Date('2026-08-23T05:00:00.000Z');
    await prisma.order.update({
      where: { id: completed.orderId },
      data: {
        status: 'COMPLETED',
        fulfillmentStatus: 'COMPLETED',
        paymentStatus: 'PAID',
        paidAmount: '1000000',
        balanceDue: '0',
        confirmedAt: new Date('2026-08-23T03:00:00.000Z'),
        pickupReadyAt: new Date('2026-08-23T04:00:00.000Z'),
        pickedUpAt: completedAt,
        completedAt,
      },
    });

    const active = await createOrderFixture(prisma);
    await prisma.inventoryReservation.create({
      data: {
        orderId: active.orderId,
        orderItemId: active.orderItemId,
        stockLevelId: active.stockLevelId,
        quantity: 1,
        holdReason: 'PICKUP',
        expiresAt: new Date(HOLD_UNTIL.getTime() + 1_000),
      },
    });

    const counts = new Map(
      (await findSlice08PreflightViolations(prisma)).map(({ checkName, count }) => [
        checkName,
        count,
      ]),
    );
    expect(counts.get('pickup_active_reservation_mirror')).toBe(1);
    expect(counts.get('completed_pickup_finance_projection')).toBe(1);
    expect(counts.get('completed_pickup_inventory_consumption')).toBe(1);
    expect(counts.get('completed_pickup_warranty_issuance')).toBe(1);
  });

  it('does not reset a ready pickup or its active reservation on reseed', async () => {
    const fixture = await createOrderFixture(prisma);
    const confirmedAt = new Date('2026-08-23T03:00:00.000Z');
    const pickupReadyAt = new Date('2026-08-23T04:00:00.000Z');
    await prisma.$transaction(async (transaction) => {
      await transaction.order.update({
        where: { id: fixture.orderId },
        data: {
          status: 'PROCESSING',
          fulfillmentStatus: 'READY',
          confirmedAt,
          pickupReadyAt,
        },
      });
      await transaction.stockLevel.update({
        where: { id: fixture.stockLevelId },
        data: { quantityReserved: { increment: 1 } },
      });
      await transaction.inventoryReservation.create({
        data: {
          orderId: fixture.orderId,
          orderItemId: fixture.orderItemId,
          stockLevelId: fixture.stockLevelId,
          quantity: 1,
          holdReason: 'PICKUP',
          expiresAt: HOLD_UNTIL,
        },
      });
    });

    const before = await readPickupState(prisma, fixture.orderId, fixture.stockLevelId);
    await seedDatabase(prisma);
    await seedDatabase(prisma);
    const after = await readPickupState(prisma, fixture.orderId, fixture.stockLevelId);

    expect(after).toEqual(before);
  });
});

type Fixture = {
  orderId: string;
  orderItemId: string;
  stockLevelId: string;
  variantId: string;
  locationId: string;
};

async function createOrderFixture(
  prisma: PrismaClient,
  fulfillmentType: 'PICKUP' | 'SHIPPING' = 'PICKUP',
): Promise<Fixture> {
  const stock = await prisma.stockLevel.findFirstOrThrow({
    where: {
      variant: { inventoryMode: 'QUANTITY' },
      ...(fulfillmentType === 'PICKUP' ? { location: { type: 'STORE' as const } } : {}),
      quantityOnHand: { gt: 0 },
    },
    include: { variant: { include: { product: true } } },
  });
  const cart = await prisma.cart.create({
    data: { guestTokenHash: randomHex64(), status: 'CONVERTED', expiresAt: HOLD_UNTIL },
  });
  const shipping = fulfillmentType === 'SHIPPING';
  const order = await prisma.order.create({
    data: {
      orderNumber: `RPH-20260823-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
      sourceCartId: cart.id,
      guestAccessTokenHash: randomHex64(),
      customerName: 'Khách kiểm thử Slice 08',
      customerEmail: 'slice08-db@example.com',
      customerPhone: '0900000000',
      fulfillmentType,
      fulfillmentLocationId: stock.locationId,
      ...(shipping
        ? {
            fulfillmentStatus: 'PREPARING' as const,
            shippingAddressSnapshot: {
              receiverName: 'Khách kiểm thử Slice 08',
              phone: '0900000000',
              addressLine: '123 Đường Kiểm Thử',
              ward: 'Phường Test',
              district: 'Quận Test',
              province: 'TP. Hồ Chí Minh',
            },
            status: 'CONFIRMED' as const,
            confirmedAt: new Date('2026-08-23T03:00:00.000Z'),
          }
        : {
            fulfillmentStatus: 'PENDING' as const,
            pickupLocationId: stock.locationId,
            pickupHoldUntil: HOLD_UNTIL,
            status: 'PLACED' as const,
          }),
      subtotal: '1000000',
      shippingFeeOriginal: shipping ? '30000' : '0',
      shippingFee: shipping ? '30000' : '0',
      grandTotal: shipping ? '1030000' : '1000000',
      depositRequired: shipping ? '500000' : '0',
      balanceDue: shipping ? '1030000' : '1000000',
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

async function readPickupState(prisma: PrismaClient, orderId: string, stockLevelId: string) {
  const [order, reservation, stock] = await Promise.all([
    prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        status: true,
        fulfillmentStatus: true,
        pickupHoldUntil: true,
        confirmedAt: true,
        pickupReadyAt: true,
      },
    }),
    prisma.inventoryReservation.findFirstOrThrow({
      where: { orderId },
      select: { id: true, status: true, holdReason: true, expiresAt: true },
    }),
    prisma.stockLevel.findUniqueOrThrow({
      where: { id: stockLevelId },
      select: { id: true, quantityOnHand: true, quantityReserved: true },
    }),
  ]);
  return { order, reservation, stock };
}

function randomHex64(): string {
  return randomUUID().replaceAll('-', '').repeat(2);
}

function warrantyCode(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const suffix = randomUUID()
    .replaceAll('-', '')
    .slice(0, 8)
    .split('')
    .map((character) => alphabet[Number.parseInt(character, 16)] ?? '2')
    .join('');
  return `RPH-W-20260823-${suffix}`;
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86_400_000);
}
