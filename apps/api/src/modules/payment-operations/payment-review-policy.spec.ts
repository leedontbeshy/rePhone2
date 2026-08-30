import { describe, expect, it } from 'vitest';
import type { ApiError } from '../../common/errors/api-error.js';
import {
  availablePaymentReviewActions,
  deriveOrderPaymentStatus,
  validateVerificationAmounts,
  type PaymentReviewActionRecord,
} from './payment-review-policy.js';

describe('payment review policy', () => {
  it('requires the order deposit and a note for an amount mismatch', () => {
    expect(() =>
      validateVerificationAmounts({
        receivedAmount: '499999',
        requiredAmount: '500000',
        expectedAmount: '500000',
      }),
    ).toThrow(expect.objectContaining({ code: 'DEPOSIT_AMOUNT_INSUFFICIENT' }) as ApiError);
    expect(() =>
      validateVerificationAmounts({
        receivedAmount: '600000',
        requiredAmount: '500000',
        expectedAmount: '500000',
      }),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }) as ApiError);
    expect(
      validateVerificationAmounts({
        receivedAmount: '600000',
        requiredAmount: '500000',
        expectedAmount: '500000',
        note: '  Khách chuyển dư  ',
      }),
    ).toEqual({ receivedAmount: 600000n, note: 'Khách chuyển dư' });
  });

  it('derives paid and refund projections using integer arithmetic', () => {
    expect(deriveOrderPaymentStatus(0n, 0n, 1_000_000n)).toBe('UNPAID');
    expect(deriveOrderPaymentStatus(500_000n, 0n, 1_000_000n)).toBe('PARTIALLY_PAID');
    expect(deriveOrderPaymentStatus(1_100_000n, 0n, 1_000_000n)).toBe('PAID');
    expect(deriveOrderPaymentStatus(1_000_000n, 100_000n, 1_000_000n)).toBe('PARTIALLY_REFUNDED');
    expect(deriveOrderPaymentStatus(1_000_000n, 1_000_000n, 1_000_000n)).toBe('REFUNDED');
  });

  it('projects review and evidence actions only when every server precondition is present', () => {
    const reviewable = paymentReviewRecord();

    expect(availablePaymentReviewActions(reviewable)).toEqual([
      'VERIFY',
      'REJECT',
      'VIEW_EVIDENCE',
    ]);
    expect(availablePaymentReviewActions(paymentReviewRecord({ status: 'VERIFIED' }))).toEqual([
      'VIEW_EVIDENCE',
    ]);
  });

  it.each([
    ['wrong purpose', { purpose: 'BALANCE' }],
    ['wrong method', { method: 'CASH' }],
    ['missing submission time', { submittedAt: null }],
    ['wrong order state', { order: { status: 'CONFIRMED', fulfillmentStatus: 'PENDING' } }],
    ['wrong fulfillment state', { order: { status: 'PLACED', fulfillmentStatus: 'READY' } }],
  ] as const)('fails closed for %s while preserving valid evidence access', (_label, overrides) => {
    expect(availablePaymentReviewActions(paymentReviewRecord(overrides))).toEqual([
      'VIEW_EVIDENCE',
    ]);
  });

  it.each([
    ['missing bucket', { evidenceBucket: null }],
    ['missing object path', { evidenceObjectPath: null }],
  ] as const)('exposes no action for incomplete evidence: %s', (_label, overrides) => {
    expect(availablePaymentReviewActions(paymentReviewRecord(overrides))).toEqual([]);
  });
});

function paymentReviewRecord(
  overrides: Partial<PaymentReviewActionRecord> = {},
): PaymentReviewActionRecord {
  return {
    status: 'UNDER_REVIEW',
    purpose: 'DEPOSIT',
    method: 'BANK_TRANSFER',
    evidenceBucket: 'rephone-private',
    evidenceObjectPath: 'payments/payment-1/evidence.png',
    submittedAt: new Date('2026-08-29T00:00:00.000Z'),
    order: { status: 'PLACED', fulfillmentStatus: 'PENDING' },
    ...overrides,
  };
}
