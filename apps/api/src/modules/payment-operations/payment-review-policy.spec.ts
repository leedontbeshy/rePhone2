import { describe, expect, it } from 'vitest';
import type { ApiError } from '../../common/errors/api-error.js';
import { deriveOrderPaymentStatus, validateVerificationAmounts } from './payment-review-policy.js';

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
});
