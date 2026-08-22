import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import type { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { AuditWriter } from '../audit/audit-writer.service.js';
import type { CheckoutInventoryGateway } from '../inventory/checkout-inventory.gateway.js';
import type { PaymentLifecycleNotificationService } from '../notifications/payment-lifecycle-notification.service.js';
import type { CheckoutVoucherGateway } from '../vouchers/checkout-voucher.gateway.js';
import { DepositExpiryService } from './deposit-expiry.service.js';
import type { PaymentOperationsRepository } from './payment-operations.repository.js';

describe('DepositExpiryService', () => {
  it('skips an overlapping tick with a process-local mutex and no timer sleeps', async () => {
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
      { scheduler: { batchSize: 100 } } as AppConfig,
      { now: () => new Date('2026-08-22T12:00:00.000Z') },
    );

    const first = service.expireDue();
    await expect(service.expireDue()).resolves.toEqual({
      scanned: 0,
      expired: 0,
      failed: 0,
      skippedOverlap: true,
    });
    releaseCandidates?.([]);
    await expect(first).resolves.toEqual({
      scanned: 0,
      expired: 0,
      failed: 0,
      skippedOverlap: false,
    });
    expect(findExpiredDepositCandidates).toHaveBeenCalledOnce();
  });
});
