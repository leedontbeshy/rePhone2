import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import type { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { AuditWriter } from '../audit/audit-writer.service.js';
import type { CheckoutInventoryGateway } from '../inventory/checkout-inventory.gateway.js';
import type {
  NotificationDelivery,
  PaymentLifecycleNotificationService,
} from '../notifications/payment-lifecycle-notification.service.js';
import type { CheckoutVoucherGateway } from '../vouchers/checkout-voucher.gateway.js';
import { DepositExpiryService } from './deposit-expiry.service.js';
import type {
  PaymentOperationsRecord,
  PaymentOperationsRepository,
} from './payment-operations.repository.js';

const NOW = new Date('2026-08-22T12:00:00.000Z');

describe('DepositExpiryService', () => {
  let logEntries: unknown[];
  let warningEntries: unknown[];
  let errorEntries: unknown[];

  beforeEach(() => {
    logEntries = [];
    warningEntries = [];
    errorEntries = [];
    vi.spyOn(Logger.prototype, 'log').mockImplementation((value: unknown) => {
      logEntries.push(value);
    });
    vi.spyOn(Logger.prototype, 'warn').mockImplementation((value: unknown) => {
      warningEntries.push(value);
    });
    vi.spyOn(Logger.prototype, 'error').mockImplementation((value: unknown) => {
      errorEntries.push(value);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips an overlapping tick and emits structured job observability', async () => {
    let releaseCandidates: ((value: []) => void) | undefined;
    const candidates = new Promise<[]>((resolve) => {
      releaseCandidates = resolve;
    });
    const findExpiredDepositCandidates = vi.fn(() => candidates);
    const repository = {
      findExpiredDepositCandidates,
    } as unknown as PaymentOperationsRepository;
    const service = new DepositExpiryService(
      repository,
      {} as SerializableTransactionRunner,
      {} as CheckoutInventoryGateway,
      {} as CheckoutVoucherGateway,
      {} as AuditWriter,
      {} as PaymentLifecycleNotificationService,
      config(),
      { now: () => NOW },
    );

    const first = service.expireDue();
    await expect(service.expireDue()).resolves.toEqual({
      scanned: 0,
      expired: 0,
      failed: 0,
      skippedOverlap: true,
    });
    const skippedLog = findLog(warningEntries, 'job.skipped_overlap');
    expect(skippedLog).toMatchObject({
      event: 'job.skipped_overlap',
      job: 'expireDepositProofs',
    });
    expect(typeof skippedLog['runId']).toBe('string');
    expect(stringField(skippedLog, 'requestId')).toMatch(/^job:expireDepositProofs:/);
    releaseCandidates?.([]);
    await expect(first).resolves.toEqual({
      scanned: 0,
      expired: 0,
      failed: 0,
      skippedOverlap: false,
    });
    expect(findExpiredDepositCandidates).toHaveBeenCalledOnce();
    expect(findLog(logEntries, 'job.completed')).toMatchObject({
      event: 'job.completed',
      job: 'expireDepositProofs',
      scanned: 0,
      succeeded: 0,
      noop: 0,
      failed: 0,
    });
  });

  it('commits every row before bounded concurrent notification delivery', async () => {
    let releaseNotifications!: () => void;
    const notificationGate = new Promise<void>((resolve) => {
      releaseNotifications = resolve;
    });
    let signalFirstBatch!: () => void;
    const firstBatchStarted = new Promise<void>((resolve) => {
      signalFirstBatch = resolve;
    });
    let active = 0;
    let maximumActive = 0;
    let notificationCalls = 0;
    const sendExpired = vi.fn(async (): Promise<NotificationDelivery> => {
      notificationCalls += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      if (notificationCalls === 10) signalFirstBatch();
      await notificationGate;
      active -= 1;
      return 'SENT';
    });
    const fixture = expiryFixture(11, { sendExpired });

    const run = fixture.service.expireDue(NOW);
    await firstBatchStarted;
    expect(maximumActive).toBe(10);
    expect(sendExpired).toHaveBeenCalledTimes(10);
    expect(fixture.auditWrite).toHaveBeenCalledTimes(11);
    releaseNotifications();

    await expect(run).resolves.toEqual({
      scanned: 11,
      expired: 11,
      failed: 0,
      skippedOverlap: false,
    });
    expect(sendExpired).toHaveBeenCalledTimes(11);
    const requestIds = fixture.auditWrite.mock.calls.map((call) => {
      const actor = call[1] as { requestId: string };
      return actor.requestId;
    });
    expect([...new Set(requestIds)]).toHaveLength(1);
    expect(requestIds[0]).toMatch(
      /^job:expireDepositProofs:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const completedLog = findLog(logEntries, 'job.completed');
    expect(completedLog).toMatchObject({
      event: 'job.completed',
      job: 'expireDepositProofs',
      scanned: 11,
      succeeded: 11,
      noop: 0,
      failed: 0,
      notificationFailed: 0,
    });
    expect(typeof completedLog['durationMs']).toBe('number');
  });

  it('logs a failed run with structured job identity and releases the mutex', async () => {
    const repository = {
      findExpiredDepositCandidates: vi
        .fn()
        .mockRejectedValueOnce(new Error('database unavailable'))
        .mockResolvedValueOnce([]),
    } as unknown as PaymentOperationsRepository;
    const service = new DepositExpiryService(
      repository,
      {} as SerializableTransactionRunner,
      {} as CheckoutInventoryGateway,
      {} as CheckoutVoucherGateway,
      {} as AuditWriter,
      {} as PaymentLifecycleNotificationService,
      config(),
      { now: () => NOW },
    );

    await expect(service.expireDue()).rejects.toThrow('database unavailable');
    const failedLog = findLog(errorEntries, 'job.failed');
    expect(failedLog).toMatchObject({
      event: 'job.failed',
      job: 'expireDepositProofs',
      errorCategory: 'Error',
    });
    expect(typeof failedLog['runId']).toBe('string');
    expect(stringField(failedLog, 'requestId')).toMatch(/^job:expireDepositProofs:/);
    await expect(service.expireDue()).resolves.toMatchObject({ skippedOverlap: false });
  });
});

function expiryFixture(
  count: number,
  notifications: Pick<PaymentLifecycleNotificationService, 'sendExpired'>,
) {
  const records = new Map<string, PaymentOperationsRecord>();
  const candidates = Array.from({ length: count }, (_value, index) => {
    const suffix = (index + 1).toString().padStart(12, '0');
    const id = `0198e4f0-7d16-4c1a-a2bd-${suffix}`;
    const orderId = `0198e4f0-7d16-4c1a-b2bd-${suffix}`;
    records.set(id, paymentRecord(id, orderId));
    return { id, orderId };
  });
  const repository = {
    findExpiredDepositCandidates: vi.fn().mockResolvedValue(candidates),
    lockPaymentRoot: vi.fn((id: string) => Promise.resolve(records.get(id) ?? null)),
    lockActiveReservations: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn((id: string) => {
      const payment = records.get(id);
      return Promise.resolve(
        payment === undefined
          ? null
          : {
              ...payment,
              status: 'EXPIRED',
              order: { ...payment.order, status: 'CANCELLED', fulfillmentStatus: 'CANCELLED' },
            },
      );
    }),
  } as unknown as PaymentOperationsRepository;
  const transaction = {
    payment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    order: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const transactions = {
    run: vi.fn(async <T>(_operation: string, work: (client: unknown) => Promise<T>): Promise<T> =>
      work(transaction),
    ),
  } as unknown as SerializableTransactionRunner;
  const auditWrite = vi.fn().mockResolvedValue(undefined);
  const service = new DepositExpiryService(
    repository,
    transactions,
    {
      releaseOrderReservations: vi.fn().mockResolvedValue(undefined),
    } as unknown as CheckoutInventoryGateway,
    { release: vi.fn().mockResolvedValue(undefined) } as unknown as CheckoutVoucherGateway,
    { write: auditWrite },
    notifications as PaymentLifecycleNotificationService,
    config(),
    { now: () => NOW },
  );
  return { service, auditWrite };
}

function paymentRecord(id: string, orderId: string): PaymentOperationsRecord {
  return {
    id,
    purpose: 'DEPOSIT',
    method: 'BANK_TRANSFER',
    status: 'AWAITING_PROOF',
    expiresAt: new Date('2026-08-22T11:59:00.000Z'),
    expectedAmount: { toString: () => '500000' },
    order: {
      id: orderId,
      orderNumber: `RPH-20260822-${id.slice(-8).toUpperCase()}`,
      customerEmail: 'customer@example.com',
      status: 'PLACED',
      fulfillmentStatus: 'PENDING',
    },
  } as unknown as PaymentOperationsRecord;
}

function config(): AppConfig {
  return { scheduler: { batchSize: 100 } } as AppConfig;
}

function findLog(entries: unknown[], event: string): Record<string, unknown> {
  for (const value of entries) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    if (entry['event'] === event) return entry;
  }
  throw new Error(`Missing ${event} log`);
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== 'string') throw new Error(`Expected ${field} to be a string`);
  return value;
}
