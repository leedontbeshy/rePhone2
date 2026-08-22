import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import type { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type {
  FulfillmentInventoryGateway,
  FulfillmentReservation,
} from '../inventory/fulfillment-inventory.gateway.js';
import type { OrderNotificationService } from '../notifications/order-notification.service.js';
import type {
  FulfillmentOrderGateway,
  FulfillmentOrderRecord,
} from '../order-transaction-ports/fulfillment-order.gateway.js';
import type {
  FulfillmentPaymentGateway,
  LockedOrderFinance,
} from '../payments/fulfillment-payment.gateway.js';
import type { FulfillmentVoucherGateway } from '../vouchers/fulfillment-voucher.gateway.js';
import { PickupExpiryService } from './pickup-expiry.service.js';

const NOW = new Date('2026-08-23T12:00:00.000Z');
const HOLD_UNTIL = new Date('2026-08-23T11:59:00.000Z');

describe('PickupExpiryService', () => {
  let errorEntries: unknown[];

  beforeEach(() => {
    errorEntries = [];
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation((value: unknown) => {
      errorEntries.push(value);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('expires a candidate once and treats a stale replay as an idempotent no-op', async () => {
    const fixture = expiryFixture([pickupOrder(1)]);

    await expect(fixture.service.expireDue(NOW)).resolves.toEqual({
      scanned: 1,
      expired: 1,
      failed: 0,
      skippedOverlap: false,
    });
    await expect(fixture.service.expireDue(NOW)).resolves.toEqual({
      scanned: 1,
      expired: 0,
      failed: 0,
      skippedOverlap: false,
    });

    expect(fixture.expirePickup).toHaveBeenCalledOnce();
    expect(fixture.releaseVoucher).toHaveBeenCalledOnce();
    expect(fixture.prepareSystemRefund).toHaveBeenCalledOnce();
    expect(fixture.auditWrite).toHaveBeenCalledOnce();
    expect(fixture.sendCancelled).toHaveBeenCalledOnce();
  });

  it('isolates a record failure and continues expiring later candidates', async () => {
    const failedOrder = pickupOrder(1);
    const successfulOrder = pickupOrder(2);
    const fixture = expiryFixture([failedOrder, successfulOrder], {
      failFinanceFor: new Set([failedOrder.id]),
    });

    await expect(fixture.service.expireDue(NOW)).resolves.toEqual({
      scanned: 2,
      expired: 1,
      failed: 1,
      skippedOverlap: false,
    });

    expect(fixture.transactionRun).toHaveBeenCalledTimes(2);
    expect(fixture.expirePickup).toHaveBeenCalledOnce();
    expect(fixture.auditWrite).toHaveBeenCalledOnce();
    expect(fixture.sendCancelled).toHaveBeenCalledOnce();
    expect(fixture.sendCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ id: successfulOrder.id }),
    );
    expect(errorEntries).toContainEqual(
      expect.objectContaining({
        event: 'job.record_failed',
        job: 'expirePickupHolds',
        orderId: failedOrder.id,
        errorCategory: 'Error',
      }),
    );
  });

  it('does not load or send a notification until the transaction has committed', async () => {
    let markTransactionWorkComplete!: () => void;
    const transactionWorkComplete = new Promise<void>((resolve) => {
      markTransactionWorkComplete = resolve;
    });
    let releaseCommit!: () => void;
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const fixture = expiryFixture([pickupOrder(1)], {
      commitGate,
      onTransactionWorkComplete: markTransactionWorkComplete,
    });

    const run = fixture.service.expireDue(NOW);
    await transactionWorkComplete;

    expect(fixture.auditWrite).toHaveBeenCalledOnce();
    expect(fixture.findById).not.toHaveBeenCalled();
    expect(fixture.sendCancelled).not.toHaveBeenCalled();

    releaseCommit();
    await expect(run).resolves.toMatchObject({ expired: 1, failed: 0 });
    expect(fixture.findById).toHaveBeenCalledOnce();
    expect(fixture.sendCancelled).toHaveBeenCalledOnce();
  });

  it('skips an overlapping tick while the current candidate scan is running', async () => {
    let markCandidatesRequested!: () => void;
    const candidatesRequested = new Promise<void>((resolve) => {
      markCandidatesRequested = resolve;
    });
    let releaseCandidates!: () => void;
    const candidateGate = new Promise<void>((resolve) => {
      releaseCandidates = resolve;
    });
    const fixture = expiryFixture([], {
      candidateGate,
      onCandidatesRequested: markCandidatesRequested,
    });

    const first = fixture.service.expireDue(NOW);
    await candidatesRequested;
    await expect(fixture.service.expireDue(NOW)).resolves.toEqual({
      scanned: 0,
      expired: 0,
      failed: 0,
      skippedOverlap: true,
    });

    releaseCandidates();
    await expect(first).resolves.toEqual({
      scanned: 0,
      expired: 0,
      failed: 0,
      skippedOverlap: false,
    });
    expect(fixture.findCandidates).toHaveBeenCalledOnce();
  });
});

interface ExpiryFixtureOptions {
  failFinanceFor?: ReadonlySet<string>;
  candidateGate?: Promise<void>;
  onCandidatesRequested?: () => void;
  commitGate?: Promise<void>;
  onTransactionWorkComplete?: () => void;
}

function expiryFixture(orders: FulfillmentOrderRecord[], options: ExpiryFixtureOptions = {}) {
  const records = new Map(orders.map((order) => [order.id, order]));
  const candidates = orders.map(({ id, orderNumber }) => ({ id, orderNumber }));
  const findCandidates = vi.fn(async () => {
    options.onCandidatesRequested?.();
    await options.candidateGate;
    return candidates;
  });
  const lockOrder = vi.fn((id: string) => Promise.resolve(records.get(id) ?? null));
  const findById = vi.fn((id: string) => Promise.resolve(records.get(id) ?? null));
  const orderUpdateMany = vi.fn(({ where }: { where: { id: string } }) => {
    const order = records.get(where.id);
    if (order === undefined || order.status === 'COMPLETED' || order.status === 'CANCELLED') {
      return Promise.resolve({ count: 0 });
    }
    records.set(where.id, {
      ...order,
      status: 'CANCELLED',
      fulfillmentStatus: 'CANCELLED',
      cancelReason: 'Quá hạn nhận hàng tại cửa hàng.',
      cancelledAt: NOW,
    });
    return Promise.resolve({ count: 1 });
  });
  const transaction = { order: { updateMany: orderUpdateMany } };
  const transactionRun = vi.fn(
    async <T>(_operation: string, work: (client: unknown) => Promise<T>): Promise<T> => {
      const result = await work(transaction);
      options.onTransactionWorkComplete?.();
      await options.commitGate;
      return result;
    },
  );
  const finance: LockedOrderFinance = { payments: [], refunds: [] };
  const lockFinance = vi.fn((orderId: string) => {
    if (options.failFinanceFor?.has(orderId) === true) {
      return Promise.reject(new Error('finance unavailable'));
    }
    return Promise.resolve(finance);
  });
  const lockActiveReservations = vi.fn((orderId: string) =>
    Promise.resolve([pickupReservation(orderId)]),
  );
  const expirePickup = vi.fn().mockResolvedValue(undefined);
  const releaseVoucher = vi.fn().mockResolvedValue(undefined);
  const prepareSystemRefund = vi.fn().mockResolvedValue(null);
  const auditWrite = vi.fn().mockResolvedValue(undefined);
  const sendCancelled = vi.fn().mockResolvedValue(undefined);
  const service = new PickupExpiryService(
    {
      findExpiredPickupCandidates: findCandidates,
      lock: lockOrder,
      findById,
    } as unknown as FulfillmentOrderGateway,
    {
      lockActiveReservations,
      assertPickupHold: vi.fn(),
      expirePickup,
    } as unknown as FulfillmentInventoryGateway,
    {
      lockFinance,
      prepareSystemRefund,
    } as unknown as FulfillmentPaymentGateway,
    { release: releaseVoucher } as unknown as FulfillmentVoucherGateway,
    { run: transactionRun } as unknown as SerializableTransactionRunner,
    { write: auditWrite },
    { sendCancelled } as unknown as OrderNotificationService,
    { scheduler: { batchSize: 100 } } as AppConfig,
    { now: () => NOW },
  );

  return {
    service,
    findCandidates,
    findById,
    transactionRun,
    expirePickup,
    releaseVoucher,
    prepareSystemRefund,
    auditWrite,
    sendCancelled,
  };
}

function pickupOrder(index: number): FulfillmentOrderRecord {
  const suffix = index.toString().padStart(12, '0');
  const id = `0198e4f0-7d16-4c1a-a2bd-${suffix}`;
  return {
    id,
    orderNumber: `RPH-20260823-${index.toString().padStart(4, '0')}`,
    status: 'PROCESSING',
    fulfillmentStatus: 'READY',
    paymentStatus: 'UNPAID',
    fulfillmentType: 'PICKUP',
    customerName: 'Nguyen Van Test',
    customerEmail: 'customer@example.com',
    customerPhone: '0900000000',
    shippingAddressSnapshot: null,
    fulfillmentLocation: {
      id: `0198e4f0-7d16-4c1a-b2bd-${suffix}`,
      code: 'HCM-01',
      name: 'rePhone HCM',
      type: 'STORE',
      status: 'ACTIVE',
    },
    items: [
      {
        id: `0198e4f0-7d16-4c1a-c2bd-${suffix}`,
        productTypeSnapshot: 'ACCESSORY',
        productNameSnapshot: 'Ốp lưng',
        variantNameSnapshot: 'Đen',
        skuSnapshot: `CASE-${index.toString()}`,
        inventoryCodeSnapshot: null,
        quantity: 1,
        unitPrice: 1_000n,
        lineTotal: 1_000n,
        warrantyDaysSnapshot: 0,
        warranty: null,
      },
    ],
    subtotal: 1_000n,
    voucherDiscountAmount: 0n,
    shippingFee: 0n,
    grandTotal: 1_000n,
    depositRequired: 0n,
    paidAmount: 0n,
    refundedAmount: 0n,
    balanceDue: 1_000n,
    reservations: [],
    payments: [],
    refunds: [],
    shipments: [],
    voucherCodeSnapshot: null,
    customerNote: null,
    internalNote: null,
    placedAt: new Date('2026-08-22T10:00:00.000Z'),
    confirmedAt: new Date('2026-08-22T10:05:00.000Z'),
    pickupHoldUntil: HOLD_UNTIL,
    pickupReadyAt: new Date('2026-08-22T11:00:00.000Z'),
    pickedUpAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelReason: null,
  } as unknown as FulfillmentOrderRecord;
}

function pickupReservation(orderId: string): FulfillmentReservation {
  return {
    id: orderId.replace('a2bd', 'd2bd'),
    orderId,
    orderItemId: orderId.replace('a2bd', 'c2bd'),
    inventoryUnitId: null,
    stockLevelId: orderId.replace('a2bd', 'e2bd'),
    quantity: 1,
    holdReason: 'PICKUP',
    expiresAt: HOLD_UNTIL,
    orderItem: {
      inventoryUnitId: null,
      variantId: orderId.replace('a2bd', 'f2bd'),
      quantity: 1,
    },
  };
}
