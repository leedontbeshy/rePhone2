/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { ApiError } from '../../common/errors/api-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthContext } from '../auth/auth-context.js';
import type { FulfillmentOrderRecord } from '../order-transaction-ports/fulfillment-order.gateway.js';
import { ShippingFeeOverrideService } from './shipping-fee-override.service.js';

const NOW = new Date('2026-08-23T10:30:00.000Z');
const ORDER_ID = uuid(1);
const USER_ID = uuid(2);
const LOCATION_ID = uuid(3);
const ITEM_ID = uuid(4);
const PAYMENT_ID = uuid(5);
const auth = { userId: USER_ID } as AuthContext;
const request = {
  id: 'request-shipping-override',
  ip: '127.0.0.1',
  socket: { remoteAddress: '127.0.0.1' },
  get: vi.fn(() => undefined),
} as unknown as Request;

describe('ShippingFeeOverrideService', () => {
  it('updates an awaiting deposit and publishes pricing only after commit', async () => {
    const original = shippingOrder();
    const projected = shippingOrder({
      shippingFee: 150n,
      grandTotal: 1_050n,
      balanceDue: 1_050n,
      shippingFeeOverrideReason: 'Điều chỉnh theo khu vực',
      shippingFeeOverriddenById: USER_ID,
      shippingFeeOverriddenAt: NOW,
      shippingFeeOverriddenBy: {
        id: USER_ID,
        fullName: 'Admin',
        employeeCode: 'ADM-001',
      },
    });
    const fixture = createFixture({
      orders: { lock: vi.fn(async () => original), findById: vi.fn(async () => projected) },
    });

    await expect(
      fixture.service.override(
        ORDER_ID,
        { shippingFee: '150', reason: '  Điều chỉnh theo khu vực  ' },
        auth,
        request,
      ),
    ).resolves.toMatchObject({ pricing: { shippingFee: '150', grandTotal: '1050' } });

    expect(fixture.payments.updateAwaitingDeposit).toHaveBeenCalledWith(
      ORDER_ID,
      PAYMENT_ID,
      100n,
      false,
      fixture.transaction,
    );
    expect(fixture.transaction.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shippingFee: '150',
          grandTotal: '1050',
          depositRequired: '100',
          balanceDue: '1050',
        }),
      }),
    );
    expect(fixture.audit.write).toHaveBeenCalledOnce();
    expect(fixture.notifications.sendShippingFeeUpdated).toHaveBeenCalledOnce();
  });

  it('cancels a zero deposit and moves active reservations to fulfillment', async () => {
    const zero = shippingOrder({
      subtotal: 0n,
      shippingFee: 100n,
      shippingFeeOriginal: 100n,
      grandTotal: 100n,
      depositRequired: 100n,
      balanceDue: 100n,
      reservations: [reservation('DEPOSIT', new Date('2026-08-23T11:00:00.000Z'))],
    });
    const projected = shippingOrder({
      subtotal: 0n,
      shippingFee: 0n,
      shippingFeeOriginal: 100n,
      grandTotal: 0n,
      depositRequired: 0n,
      balanceDue: 0n,
      status: 'CONFIRMED',
      confirmedAt: NOW,
      paymentStatus: 'PAID',
      payments: [deposit({ status: 'CANCELLED', expectedAmount: 0n, expiresAt: null })],
      reservations: [reservation('FULFILLMENT', null)],
    });
    const fixture = createFixture({
      orders: { lock: vi.fn(async () => zero), findById: vi.fn(async () => projected) },
      inventory: {
        lockActiveReservations: vi.fn(async () => [
          reservation('DEPOSIT', new Date('2026-08-23T11:00:00.000Z')),
        ]),
      },
    });

    await expect(
      fixture.service.override(
        ORDER_ID,
        { shippingFee: '0', reason: 'Miễn phí vận chuyển' },
        auth,
        request,
      ),
    ).resolves.toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
    expect(fixture.inventory.transitionReservationHold).toHaveBeenCalledWith(
      expect.any(Array),
      'DEPOSIT',
      'FULFILLMENT',
      null,
      fixture.transaction,
    );
    expect(fixture.payments.updateAwaitingDeposit).toHaveBeenCalledWith(
      ORDER_ID,
      PAYMENT_ID,
      0n,
      true,
      fixture.transaction,
    );
  });

  it('returns an exact replay without finance, writes, audit or notification', async () => {
    const replay = shippingOrder({
      shippingFee: 150n,
      shippingFeeOverrideReason: 'Điều chỉnh theo khu vực',
      shippingFeeOverriddenById: USER_ID,
      shippingFeeOverriddenAt: NOW,
      shippingFeeOverriddenBy: {
        id: USER_ID,
        fullName: 'Admin',
        employeeCode: 'ADM-001',
      },
    });
    const fixture = createFixture({
      orders: { lock: vi.fn(async () => replay), findById: vi.fn(async () => replay) },
    });

    await fixture.service.override(
      ORDER_ID,
      { shippingFee: '150', reason: 'Điều chỉnh theo khu vực' },
      auth,
      request,
    );

    expect(fixture.payments.lockFinance).not.toHaveBeenCalled();
    expect(fixture.transaction.order.updateMany).not.toHaveBeenCalled();
    expect(fixture.audit.write).not.toHaveBeenCalled();
    expect(fixture.notifications.sendShippingFeeUpdated).not.toHaveBeenCalled();
  });

  it.each([
    ['missing order', null, 'RESOURCE_NOT_FOUND'],
    ['pickup order', shippingOrder({ fulfillmentType: 'PICKUP' }), 'INVALID_STATE_TRANSITION'],
    ['processed order', shippingOrder({ status: 'PROCESSING' }), 'INVALID_STATE_TRANSITION'],
    [
      'shipment already exists',
      shippingOrder({ shipments: [{ id: uuid(9) }] as never }),
      'INVALID_STATE_TRANSITION',
    ],
  ] as const)('rejects %s before mutation', async (_label, lockedOrder, code) => {
    const fixture = createFixture({ orders: { lock: vi.fn(async () => lockedOrder) } });

    await expect(
      fixture.service.override(
        ORDER_ID,
        { shippingFee: '150', reason: 'Điều chỉnh theo khu vực' },
        auth,
        request,
      ),
    ).rejects.toMatchObject({ code });
    expect(fixture.payments.updateAwaitingDeposit).not.toHaveBeenCalled();
  });

  it('rejects paid finance and malformed deposit lifecycle before updating', async () => {
    const paid = createFixture({
      payments: {
        project: vi.fn(() => ({
          paidAmount: 1n,
          refundedAmount: 0n,
          balanceDue: 999n,
          paymentStatus: 'PARTIALLY_PAID',
        })),
      },
    });
    await expect(
      paid.service.override(
        ORDER_ID,
        { shippingFee: '150', reason: 'Điều chỉnh theo khu vực' },
        auth,
        request,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });

    const submitted = createFixture({
      orders: {
        lock: vi.fn(async () =>
          shippingOrder({ payments: [deposit({ submittedAt: NOW, status: 'UNDER_REVIEW' })] }),
        ),
      },
    });
    await expect(
      submitted.service.override(
        ORDER_ID,
        { shippingFee: '150', reason: 'Điều chỉnh theo khu vực' },
        auth,
        request,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  });

  it('rejects invalid zero-deposit source reservations and impossible finance shape', async () => {
    const zeroSource = shippingOrder({ subtotal: 0n, grandTotal: 100n, depositRequired: 100n });
    const invalidReservation = createFixture({
      orders: { lock: vi.fn(async () => zeroSource) },
      inventory: {
        lockActiveReservations: vi.fn(async () => [reservation('REVIEW', null)]),
      },
    });
    await expect(
      invalidReservation.service.override(
        ORDER_ID,
        { shippingFee: '0', reason: 'Miễn phí vận chuyển' },
        auth,
        request,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });

    const impossible = createFixture({
      orders: { lock: vi.fn(async () => shippingOrder({ depositRequired: 0n })) },
    });
    await expect(
      impossible.service.override(
        ORDER_ID,
        { shippingFee: '150', reason: 'Điều chỉnh theo khu vực' },
        auth,
        request,
      ),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('maps a lost conditional update to CONCURRENT_MODIFICATION', async () => {
    const fixture = createFixture({ updateCount: 0 });
    await expect(
      fixture.service.override(
        ORDER_ID,
        { shippingFee: '150', reason: 'Điều chỉnh theo khu vực' },
        auth,
        request,
      ),
    ).rejects.toMatchObject({ code: 'CONCURRENT_MODIFICATION' } satisfies Partial<ApiError>);
    expect(fixture.audit.write).not.toHaveBeenCalled();
  });

  it('fails safely if the committed order cannot be projected', async () => {
    const fixture = createFixture({ orders: { findById: vi.fn(async () => null) } });
    await expect(
      fixture.service.override(
        ORDER_ID,
        { shippingFee: '150', reason: 'Điều chỉnh theo khu vực' },
        auth,
        request,
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    expect(fixture.notifications.sendShippingFeeUpdated).not.toHaveBeenCalled();
  });
});

interface FixtureOverrides {
  orders?: object;
  payments?: object;
  inventory?: object;
  updateCount?: number;
}

function createFixture(overrides: FixtureOverrides = {}) {
  const transaction = {
    order: { updateMany: vi.fn(async () => ({ count: overrides.updateCount ?? 1 })) },
  } as unknown as Prisma.TransactionClient;
  const orders = {
    lock: vi.fn(async () => shippingOrder()),
    findById: vi.fn(async () => shippingOrder()),
    ...overrides.orders,
  };
  const payments = {
    lockFinance: vi.fn(async () => ({ payments: [], refunds: [] })),
    project: vi.fn(() => ({
      paidAmount: 0n,
      refundedAmount: 0n,
      balanceDue: 1_000n,
      paymentStatus: 'UNPAID',
    })),
    updateAwaitingDeposit: vi.fn(async () => undefined),
    ...overrides.payments,
  };
  const inventory = {
    lockActiveReservations: vi.fn(async () => []),
    assertReservationTargets: vi.fn(),
    transitionReservationHold: vi.fn(async () => undefined),
    ...overrides.inventory,
  };
  const audit = { write: vi.fn(async () => undefined) };
  const notifications = { sendShippingFeeUpdated: vi.fn(async () => undefined) };
  const transactions = {
    run: vi.fn(async (_operation: string, work: (client: unknown) => Promise<unknown>) =>
      work(transaction),
    ),
  };
  return {
    transaction,
    orders,
    payments,
    inventory,
    audit,
    notifications,
    service: new ShippingFeeOverrideService(
      orders as never,
      payments as never,
      inventory as never,
      transactions as never,
      audit as never,
      notifications as never,
      { now: () => NOW },
    ),
  };
}

function shippingOrder(overrides: Record<string, unknown> = {}): FulfillmentOrderRecord {
  const createdAt = new Date('2026-08-23T08:00:00.000Z');
  return {
    id: ORDER_ID,
    orderNumber: 'RPH-20260823-SHIP0001',
    customerId: null,
    customerName: 'Nguyen Van Test',
    customerEmail: 'customer@example.com',
    customerPhone: '0900000000',
    fulfillmentType: 'SHIPPING',
    fulfillmentStatus: 'PENDING',
    fulfillmentLocationId: LOCATION_ID,
    shippingAddressSnapshot: { city: 'Ho Chi Minh' },
    pickupLocationId: null,
    pickupHoldUntil: null,
    pickupReadyAt: null,
    pickedUpAt: null,
    status: 'PLACED',
    paymentStatus: 'UNPAID',
    subtotal: 900n,
    itemDiscountAmount: 0n,
    voucherDiscountAmount: 0n,
    shippingFeeOriginal: 100n,
    shippingFee: 100n,
    shippingFeeOverrideReason: null,
    shippingFeeOverriddenById: null,
    shippingFeeOverriddenAt: null,
    grandTotal: 1_000n,
    depositRequired: 100n,
    paidAmount: 0n,
    refundedAmount: 0n,
    balanceDue: 1_000n,
    voucherCodeSnapshot: null,
    customerNote: null,
    internalNote: null,
    cancelReason: null,
    placedAt: createdAt,
    confirmedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt,
    updatedAt: createdAt,
    fulfillmentLocation: {
      id: LOCATION_ID,
      code: 'HCM-WH-01',
      name: 'Kho HCM',
      type: 'WAREHOUSE',
      status: 'ACTIVE',
    },
    pickupLocation: null,
    shippingFeeOverriddenBy: null,
    items: [
      {
        id: ITEM_ID,
        orderId: ORDER_ID,
        productId: uuid(6),
        variantId: uuid(7),
        inventoryUnitId: null,
        productTypeSnapshot: 'ACCESSORY',
        productNameSnapshot: 'Ốp lưng',
        variantNameSnapshot: 'Đen',
        skuSnapshot: 'CASE-001',
        inventoryCodeSnapshot: null,
        configurationSnapshot: null,
        quantity: 1,
        unitPrice: 900n,
        lineSubtotal: 900n,
        discountAmount: 0n,
        lineTotal: 900n,
        warrantyDaysSnapshot: 0,
        warrantyTermsSnapshot: null,
        createdAt,
        warranty: null,
      },
    ],
    payments: [deposit()],
    refunds: [],
    reservations: [],
    shipments: [],
    voucherUsage: null,
    ...overrides,
  } as unknown as FulfillmentOrderRecord;
}

function deposit(overrides: Record<string, unknown> = {}) {
  const createdAt = new Date('2026-08-23T08:00:00.000Z');
  return {
    id: PAYMENT_ID,
    orderId: ORDER_ID,
    purpose: 'DEPOSIT',
    method: 'BANK_TRANSFER',
    status: 'AWAITING_PROOF',
    expectedAmount: 100n,
    receivedAmount: null,
    transferContent: 'RPH20260823SHIP0001',
    bankNameSnapshot: 'Demo Bank',
    bankAccountNumberSnapshot: '123456789',
    bankAccountNameSnapshot: 'REPHONE',
    qrBucketSnapshot: null,
    qrObjectPathSnapshot: null,
    evidenceBucket: null,
    evidenceObjectPath: null,
    evidenceMimeType: null,
    evidenceFileSize: null,
    evidenceSha256: null,
    customerDeclaredAt: null,
    submittedAt: null,
    expiresAt: new Date('2026-08-23T11:00:00.000Z'),
    reviewedById: null,
    reviewedAt: null,
    rejectionReason: null,
    reviewSlaMinutesSnapshot: 60,
    createdAt,
    updatedAt: createdAt,
    reviewedBy: null,
    ...overrides,
  };
}

function reservation(holdReason: 'DEPOSIT' | 'REVIEW' | 'FULFILLMENT', expiresAt: Date | null) {
  const createdAt = new Date('2026-08-23T08:00:00.000Z');
  return {
    id: uuid(8),
    orderId: ORDER_ID,
    orderItemId: ITEM_ID,
    inventoryUnitId: null,
    stockLevelId: uuid(9),
    quantity: 1,
    status: 'ACTIVE' as const,
    holdReason,
    expiresAt,
    releasedAt: null,
    consumedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function uuid(suffix: number): string {
  return `0199b902-0000-7000-8000-${suffix.toString().padStart(12, '0')}`;
}
