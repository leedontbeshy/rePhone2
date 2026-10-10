import { describe, expect, it } from 'vitest';
import type { DealerAllocationAmount, DealerRefundAmount } from './dealer-finance.policy.js';
import { projectDealerOrderFunding, projectDealerReceipt } from './dealer-finance.policy.js';
import { DealerInvariantError } from './dealer-invariant-error.js';

const allocation = (overrides: Partial<DealerAllocationAmount> = {}): DealerAllocationAmount => ({
  id: 'allocation-1',
  amount: 9_530_000n,
  reversedAmount: 0n,
  refunds: [],
  ...overrides,
});
const refund = (overrides: Partial<DealerRefundAmount> = {}): DealerRefundAmount => ({
  id: 'refund-1',
  amount: 470_000n,
  status: 'REQUESTED',
  ...overrides,
});

describe('dealer receipt and funding invariants', () => {
  it('INV-ALLOC-01: accepts several transfers allocated to one order', () => {
    const result = projectDealerOrderFunding(9_530_000n, [
      allocation({ id: 'first', amount: 5_000_000n }),
      allocation({ id: 'balance', amount: 4_530_000n }),
    ]);
    expect(result.fullyFunded).toBe(true);
    expect(result.fundingShortfall).toBe(0n);
  });

  it('INV-REF-02: returning an overpayment does not reduce order funding', () => {
    const allocations = [allocation()];
    const receipt = projectDealerReceipt({
      receivedAmount: 10_000_000n,
      reversedAmount: 0n,
      allocations,
      unallocatedRefunds: [refund({ status: 'COMPLETED' })],
    });
    expect(receipt).toMatchObject({ unallocatedAvailable: 0n, cashRemaining: 9_530_000n });
    expect(projectDealerOrderFunding(9_530_000n, allocations).fullyFunded).toBe(true);
  });

  it.each(['REQUESTED', 'PROCESSING', 'COMPLETED'] as const)(
    'INV-REF-01: %s reserves its funding even before money leaves',
    (status) => {
      const result = projectDealerOrderFunding(9_530_000n, [
        allocation({ refunds: [refund({ status })] }),
      ]);
      expect(result.fullyFunded).toBe(false);
      expect(result.fundingShortfall).toBe(470_000n);
      expect(result.completedRefundAmount).toBe(status === 'COMPLETED' ? 470_000n : 0n);
    },
  );

  it.each(['REJECTED', 'CANCELLED'] as const)('INV-REF-01: %s releases quota', (status) => {
    expect(
      projectDealerOrderFunding(9_530_000n, [allocation({ refunds: [refund({ status })] })])
        .fullyFunded,
    ).toBe(true);
  });

  it('INV-REF-02: does not double-count allocation-backed refunds against a receipt', () => {
    const receipt = projectDealerReceipt({
      receivedAmount: 10_000_000n,
      reversedAmount: 0n,
      allocations: [allocation({ refunds: [refund({ id: 'order-refund', amount: 9_530_000n })] })],
      unallocatedRefunds: [refund({ id: 'excess-refund' })],
    });
    expect(receipt.refundObligationAmount).toBe(10_000_000n);
    expect(receipt.cashRemaining).toBe(10_000_000n);
    expect(receipt.unallocatedAvailable).toBe(0n);
  });

  it('INV-ALLOC-01: blocks allocation of funds reserved for an overpayment refund', () => {
    expect(() =>
      projectDealerReceipt({
        receivedAmount: 10_000_000n,
        reversedAmount: 0n,
        allocations: [allocation({ amount: 9_530_001n })],
        unallocatedRefunds: [refund()],
      }),
    ).toThrow(new DealerInvariantError('INV-ALLOC-01'));
  });

  it('INV-REF-01: an allocation with a refund obligation cannot be reversed underneath it', () => {
    expect(() =>
      projectDealerOrderFunding(9_530_000n, [
        allocation({
          reversedAmount: 9_530_000n,
          refunds: [refund()],
        }),
      ]),
    ).toThrow(new DealerInvariantError('INV-REF-01'));
  });

  it('INV-ALLOC-01: a corrected receipt cannot retain allocations beyond the corrected amount', () => {
    expect(() =>
      projectDealerReceipt({
        receivedAmount: 10_000_000n,
        reversedAmount: 1_000_000n,
        allocations: [allocation()],
        unallocatedRefunds: [],
      }),
    ).toThrow(new DealerInvariantError('INV-ALLOC-01'));
  });

  it('INV-ALLOC-01: preserves cash after receipt and allocation are reversed together', () => {
    expect(
      projectDealerReceipt({
        receivedAmount: 10_000_000n,
        reversedAmount: 10_000_000n,
        allocations: [allocation({ reversedAmount: 9_530_000n })],
        unallocatedRefunds: [],
      }),
    ).toMatchObject({ cashRemaining: 0n, allocatedAmount: 0n, unallocatedAvailable: 0n });
  });

  it('INV-REF-02: rejects a refund counted under both sources', () => {
    expect(() =>
      projectDealerReceipt({
        receivedAmount: 10_000_000n,
        reversedAmount: 0n,
        allocations: [allocation({ refunds: [refund()] })],
        unallocatedRefunds: [refund()],
      }),
    ).toThrow(new DealerInvariantError('INV-REF-02'));
  });

  it('INV-ALLOC-01: rejects duplicated allocation rows instead of treating a join as more money', () => {
    expect(() => projectDealerOrderFunding(20_000_000n, [allocation(), allocation()])).toThrow(
      new DealerInvariantError('INV-ALLOC-01'),
    );
  });

  it('INV-MONEY-01: rejects negative money rather than increasing apparent available funds', () => {
    expect(() =>
      projectDealerReceipt({
        receivedAmount: 10n,
        reversedAmount: 0n,
        allocations: [],
        unallocatedRefunds: [refund({ amount: -1n })],
      }),
    ).toThrow(new DealerInvariantError('INV-MONEY-01'));
  });

  it('INV-MONEY-01: keeps exact VND values near the database Decimal limit', () => {
    const total = 999_999_999_999_999n;
    expect(
      projectDealerOrderFunding(total, [allocation({ amount: total - 1n })]).fundingShortfall,
    ).toBe(1n);
  });
});
