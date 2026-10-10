import type { RefundStatus } from '../../generated/prisma/client.js';
import { requireDealerInvariant } from './dealer-invariant-error.js';

export interface DealerRefundAmount {
  id: string;
  amount: bigint;
  status: RefundStatus;
}

export interface DealerAllocationAmount {
  id: string;
  amount: bigint;
  reversedAmount: bigint;
  refunds: readonly DealerRefundAmount[];
}

const QUOTA_HOLDING_STATUSES: ReadonlySet<RefundStatus> = new Set([
  'REQUESTED',
  'PROCESSING',
  'COMPLETED',
]);

function sumRefunds(refunds: readonly DealerRefundAmount[]) {
  let committed = 0n;
  let completed = 0n;
  const ids = new Set<string>();
  for (const refund of refunds) {
    requireDealerInvariant(!ids.has(refund.id), 'INV-REF-02');
    ids.add(refund.id);
    requireDealerInvariant(refund.amount > 0n, 'INV-MONEY-01');
    if (QUOTA_HOLDING_STATUSES.has(refund.status)) committed += refund.amount;
    if (refund.status === 'COMPLETED') completed += refund.amount;
  }
  return { committed, completed };
}

function projectAllocations(allocations: readonly DealerAllocationAmount[]) {
  let allocated = 0n;
  let committedRefunds = 0n;
  let completedRefunds = 0n;
  const allocationIds = new Set<string>();
  const refundIds = new Set<string>();
  for (const allocation of allocations) {
    requireDealerInvariant(!allocationIds.has(allocation.id), 'INV-ALLOC-01');
    allocationIds.add(allocation.id);
    requireDealerInvariant(allocation.amount > 0n, 'INV-MONEY-01');
    requireDealerInvariant(
      allocation.reversedAmount >= 0n && allocation.reversedAmount <= allocation.amount,
      'INV-ALLOC-01',
    );
    const activeAmount = allocation.amount - allocation.reversedAmount;
    const refunds = sumRefunds(allocation.refunds);
    requireDealerInvariant(refunds.committed <= activeAmount, 'INV-REF-01');
    for (const refund of allocation.refunds) {
      requireDealerInvariant(!refundIds.has(refund.id), 'INV-REF-02');
      refundIds.add(refund.id);
    }
    allocated += activeAmount;
    committedRefunds += refunds.committed;
    completedRefunds += refunds.completed;
  }
  return { allocated, committedRefunds, completedRefunds, refundIds };
}

/** Inputs must be loaded from a locked, tenant-checked receipt aggregate. Never from a request DTO. */
export function projectDealerReceipt(input: {
  receivedAmount: bigint;
  reversedAmount: bigint;
  allocations: readonly DealerAllocationAmount[];
  unallocatedRefunds: readonly DealerRefundAmount[];
}) {
  requireDealerInvariant(input.receivedAmount > 0n, 'INV-MONEY-01');
  requireDealerInvariant(
    input.reversedAmount >= 0n && input.reversedAmount <= input.receivedAmount,
    'INV-ALLOC-01',
  );
  const received = input.receivedAmount - input.reversedAmount;
  const allocated = projectAllocations(input.allocations);
  const directRefunds = sumRefunds(input.unallocatedRefunds);
  for (const refund of input.unallocatedRefunds) {
    requireDealerInvariant(!allocated.refundIds.has(refund.id), 'INV-REF-02');
  }
  // Allocation-backed refunds are already inside allocated; counting them here again is incorrect.
  requireDealerInvariant(allocated.allocated + directRefunds.committed <= received, 'INV-ALLOC-01');
  const completedRefunds = allocated.completedRefunds + directRefunds.completed;
  return {
    receivedAmount: received,
    allocatedAmount: allocated.allocated,
    unallocatedAvailable: received - allocated.allocated - directRefunds.committed,
    refundObligationAmount: allocated.committedRefunds + directRefunds.committed,
    completedRefundAmount: completedRefunds,
    cashRemaining: received - completedRefunds,
  };
}

/** Bank overpayments belong to receipt.unallocatedRefunds and never enter order funding. */
export function projectDealerOrderFunding(
  grandTotal: bigint,
  allocations: readonly DealerAllocationAmount[],
) {
  requireDealerInvariant(grandTotal > 0n, 'INV-MONEY-01');
  const totals = projectAllocations(allocations);
  requireDealerInvariant(totals.allocated <= grandTotal, 'INV-ALLOC-01');
  const fundedAmount = totals.allocated - totals.committedRefunds;
  return {
    allocatedAmount: totals.allocated,
    refundObligationAmount: totals.committedRefunds,
    completedRefundAmount: totals.completedRefunds,
    fundedAmount,
    fundingShortfall: grandTotal - fundedAmount,
    fullyFunded: fundedAmount === grandTotal,
  };
}
