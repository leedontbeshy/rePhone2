import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { StorageProvider } from '../../common/providers/storage-provider.js';
import type { AppConfig } from '../../config/app-config.js';
import type { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { CheckoutInventoryGateway } from '../inventory/checkout-inventory.gateway.js';
import type { PaymentLifecycleNotificationService } from '../notifications/payment-lifecycle-notification.service.js';
import type { OrderOwnershipPolicy } from '../order-transaction-ports/order-ownership.policy.js';
import type {
  PaymentOperationsRecord,
  PaymentOperationsRepository,
} from './payment-operations.repository.js';
import {
  isProofSubmissionReplay,
  PaymentProofSubmissionService,
} from './payment-proof-submission.service.js';

describe('PaymentProofSubmissionService replay', () => {
  it('returns the current projection before validating or uploading a sequential replay', async () => {
    const payment = paymentFixture();
    const payments = { findById: vi.fn().mockResolvedValue(payment) };
    const evidenceValidator = { validate: vi.fn() };
    const storage = { upload: vi.fn(), delete: vi.fn() };
    const transactions = { run: vi.fn() };
    const ownership = { assertAccess: vi.fn() };
    const inventory = { transitionOrderReservationReason: vi.fn() };
    const audit = { write: vi.fn() };
    const clock = { now: vi.fn().mockReturnValue(new Date('2026-08-22T10:01:00.000Z')) };
    const notifications = { sendProofSubmitted: vi.fn() };
    const service = new PaymentProofSubmissionService(
      payments as unknown as PaymentOperationsRepository,
      evidenceValidator,
      storage as unknown as StorageProvider,
      {} as AppConfig,
      transactions as unknown as SerializableTransactionRunner,
      ownership as unknown as OrderOwnershipPolicy,
      inventory as unknown as CheckoutInventoryGateway,
      audit,
      clock,
      notifications as unknown as PaymentLifecycleNotificationService,
    );

    await expect(service.submit({} as Request, payment.id, undefined)).resolves.toMatchObject({
      id: payment.id,
      status: 'UNDER_REVIEW',
    });
    expect(ownership.assertAccess).toHaveBeenCalledOnce();
    expect(evidenceValidator.validate).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(transactions.run).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
    expect(notifications.sendProofSubmitted).not.toHaveBeenCalled();
  });

  it('only recognizes a fully committed under-review payment as replayable', () => {
    const payment = paymentFixture();
    expect(isProofSubmissionReplay(payment)).toBe(true);
    expect(isProofSubmissionReplay({ ...payment, evidenceObjectPath: null })).toBe(false);
    expect(isProofSubmissionReplay({ ...payment, submittedAt: null })).toBe(false);
    expect(isProofSubmissionReplay({ ...payment, status: 'VERIFIED' })).toBe(false);
  });

  it('budgets the multi-write proof transaction without changing global defaults', async () => {
    const payment = {
      ...paymentFixture(),
      status: 'AWAITING_PROOF',
      evidenceBucket: null,
      evidenceObjectPath: null,
      customerDeclaredAt: null,
      submittedAt: null,
    } as PaymentOperationsRecord;
    const payments = { findById: vi.fn().mockResolvedValue(payment) };
    const evidenceValidator = {
      validate: vi.fn().mockResolvedValue({
        bytes: Buffer.from('proof'),
        extension: 'png',
        mimeType: 'image/png',
        fileSize: 5,
      }),
    };
    const storage = {
      upload: vi.fn().mockResolvedValue({
        bucket: 'private-test',
        objectPath: `payments/${payment.id}/proof.png`,
        mimeType: 'image/png',
        fileSize: 5,
      }),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const transactionFailure = new Error('transaction unavailable');
    const transactions = { run: vi.fn().mockRejectedValue(transactionFailure) };
    const ownership = { assertAccess: vi.fn() };
    const inventory = { transitionOrderReservationReason: vi.fn() };
    const audit = { write: vi.fn() };
    const clock = { now: vi.fn().mockReturnValue(new Date('2026-08-22T10:01:00.000Z')) };
    const notifications = { sendProofSubmitted: vi.fn() };
    const service = new PaymentProofSubmissionService(
      payments as unknown as PaymentOperationsRepository,
      evidenceValidator,
      storage as unknown as StorageProvider,
      { storage: { privateBucket: 'private-test' } } as AppConfig,
      transactions as unknown as SerializableTransactionRunner,
      ownership as unknown as OrderOwnershipPolicy,
      inventory as unknown as CheckoutInventoryGateway,
      audit,
      clock,
      notifications as unknown as PaymentLifecycleNotificationService,
    );

    await expect(service.submit({} as Request, payment.id, undefined)).rejects.toBe(
      transactionFailure,
    );
    expect(transactions.run).toHaveBeenCalledWith(
      'payments.submit-proof',
      expect.any(Function),
      undefined,
      { maxWaitMs: 5_000, timeoutMs: 15_000 },
    );
    expect(storage.delete).toHaveBeenCalledOnce();
  });
});

function paymentFixture(): PaymentOperationsRecord {
  return {
    id: '2ee2a39f-82b5-4f64-8b69-98eaf1470c47',
    purpose: 'DEPOSIT',
    method: 'BANK_TRANSFER',
    status: 'UNDER_REVIEW',
    expectedAmount: { toString: () => '1000000' },
    receivedAmount: null,
    transferContent: 'RPH20260822ABC23456',
    bankNameSnapshot: null,
    bankAccountNumberSnapshot: null,
    bankAccountHolderSnapshot: null,
    bankQrBucketSnapshot: null,
    bankQrObjectPathSnapshot: null,
    reviewWindowMinutesSnapshot: 30,
    evidenceBucket: 'private-test',
    evidenceObjectPath: 'payments/2ee2a39f-82b5-4f64-8b69-98eaf1470c47/proof.png',
    expiresAt: new Date('2026-08-22T10:30:00.000Z'),
    customerDeclaredAt: new Date('2026-08-22T10:00:00.000Z'),
    submittedAt: new Date('2026-08-22T10:00:00.000Z'),
    reviewedAt: null,
    rejectionReason: null,
    note: null,
    createdAt: new Date('2026-08-22T09:55:00.000Z'),
    reviewedBy: null,
    order: {
      id: '733bfbb2-eef9-4f06-9097-76d211060ed2',
      orderNumber: 'RPH-20260822-ABC23456',
      status: 'PLACED',
      fulfillmentStatus: 'PENDING',
      paymentStatus: 'UNPAID',
      customerId: 'c4a816d8-95d1-4a31-8cdd-36709c9c2fb3',
      guestAccessTokenHash: null,
      customerName: 'Khách Test',
      customerEmail: 'payment@example.com',
      customerPhone: '0900000000',
      shippingAddressSnapshot: null,
      grandTotal: { toString: () => '10000000' },
      depositRequired: { toString: () => '1000000' },
      paidAmount: { toString: () => '0' },
      refundedAmount: { toString: () => '0' },
      balanceDue: { toString: () => '10000000' },
      placedAt: new Date('2026-08-22T09:55:00.000Z'),
      confirmedAt: null,
      cancelledAt: null,
      items: [],
      sourceCart: {
        guestTokenHash: null,
        expiresAt: null,
        status: 'CONVERTED',
      },
    },
  } as unknown as PaymentOperationsRecord;
}
