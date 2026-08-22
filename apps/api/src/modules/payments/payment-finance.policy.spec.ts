import { describe, expect, it } from 'vitest';
import { deriveOrderPaymentStatus, projectOrderFinance } from './payment-finance.policy.js';

describe('payment finance policy', () => {
  it('projects amounts above Number.MAX_SAFE_INTEGER with exact bigint arithmetic', () => {
    expect(
      projectOrderFinance(
        18_014_398_509_482_010n,
        [9_007_199_254_741_001n, 9_007_199_254_741_002n],
        [],
      ),
    ).toEqual({
      paidAmount: 18_014_398_509_482_003n,
      refundedAmount: 0n,
      balanceDue: 7n,
      paymentStatus: 'PARTIALLY_PAID',
    });
  });

  it('clamps overpayment balance to zero without losing the paid total', () => {
    expect(projectOrderFinance(1_000n, [700n, 500n], [])).toEqual({
      paidAmount: 1_200n,
      refundedAmount: 0n,
      balanceDue: 0n,
      paymentStatus: 'PAID',
    });
  });

  it.each([
    [0n, 0n, 1_000n, 'UNPAID'],
    [500n, 0n, 1_000n, 'PARTIALLY_PAID'],
    [1_000n, 0n, 1_000n, 'PAID'],
    [1_000n, 100n, 1_000n, 'PARTIALLY_REFUNDED'],
    [1_000n, 1_000n, 1_000n, 'REFUNDED'],
  ] as const)(
    'derives status from paid=%s refunded=%s total=%s',
    (paid, refunded, total, status) => {
      expect(deriveOrderPaymentStatus(paid, refunded, total)).toBe(status);
    },
  );
});
