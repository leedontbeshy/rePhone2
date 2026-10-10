import { ApiError } from '../../common/errors/api-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  projectDealerOrderFunding,
  projectDealerReceipt,
  type DealerAllocationAmount,
} from '../dealer-core/dealer-finance.policy.js';
import { deriveOrderPaymentStatus } from '../payments/payment-finance.policy.js';

export const allocationLedgerInclude = {
  reversals: true,
  refundSources: { include: { refund: true } },
} satisfies Prisma.DealerPaymentAllocationInclude;
type Allocation = Prisma.DealerPaymentAllocationGetPayload<{
  include: typeof allocationLedgerInclude;
}>;
export function projectAllocation(row: Allocation): DealerAllocationAmount {
  return {
    id: row.id,
    amount: BigInt(row.amount.toString()),
    reversedAmount: row.reversals.reduce(
      (sum, reversal) => sum + BigInt(reversal.amount.toString()),
      0n,
    ),
    refunds: row.refundSources.map((source) => ({
      id: source.id,
      amount: BigInt(source.amount.toString()),
      status: source.refund.status,
    })),
  };
}

/** Caller holds the Order row. Every mutation of its allocations/refunds uses that same lock. */
export async function readDealerFunding(
  tx: Prisma.TransactionClient,
  orderId: string,
  grandTotal: bigint,
) {
  const rows = await tx.dealerPaymentAllocation.findMany({
    where: { orderId },
    include: {
      ...allocationLedgerInclude,
      bankTransaction: { select: { reconciliationHold: true } },
    },
    orderBy: { id: 'asc' },
  });
  const projection = projectDealerOrderFunding(grandTotal, rows.map(projectAllocation));
  const detail = await tx.dealerOrderDetail.findUnique({
    where: { orderId },
    select: { reconciliationHold: true },
  });
  const reconciliationHold =
    detail?.reconciliationHold === true ||
    rows.some((row) => row.bankTransaction.reconciliationHold);
  return {
    ...projection,
    reconciliationHold,
    fullyFunded: projection.fullyFunded && !reconciliationHold,
    rows,
    summary: {
      paidAmount: projection.allocatedAmount,
      refundedAmount: projection.completedRefundAmount,
      balanceDue: grandTotal - projection.allocatedAmount,
      paymentStatus: deriveOrderPaymentStatus(
        projection.allocatedAmount,
        projection.completedRefundAmount,
        grandTotal,
      ),
    },
  };
}

export async function lockDealerReceipt(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM dealer_bank_transactions WHERE id=${id}::uuid FOR UPDATE`;
  const receipt = await tx.dealerBankTransaction.findUnique({
    where: { id },
    include: {
      corrections: true,
      allocations: { include: allocationLedgerInclude, orderBy: { id: 'asc' } },
      refundSources: { include: { refund: true } },
    },
  });
  if (receipt === null) throw new ApiError('RESOURCE_NOT_FOUND');
  const effective =
    BigInt(receipt.receivedAmount.toString()) +
    receipt.corrections.reduce((sum, row) => sum + BigInt(row.amount.toString()), 0n);
  // Corrections are signed entries. Project a positive effective receipt, never mutate the bank fact.
  const projection = projectDealerReceipt({
    receivedAmount: effective > 0n ? effective : 1n,
    reversedAmount: effective === 0n ? 1n : 0n,
    allocations: receipt.allocations.map(projectAllocation),
    unallocatedRefunds: receipt.refundSources.map((source) => ({
      id: source.id,
      amount: BigInt(source.amount.toString()),
      status: source.refund.status,
    })),
  });
  return { receipt, projection, effective };
}

export async function refreshDealerFunding(
  tx: Prisma.TransactionClient,
  orderId: string,
  grandTotal: bigint,
) {
  const funding = await readDealerFunding(tx, orderId, grandTotal);
  await tx.order.update({
    where: { id: orderId },
    data: {
      paidAmount: funding.summary.paidAmount.toString(),
      refundedAmount: funding.summary.refundedAmount.toString(),
      balanceDue: funding.summary.balanceDue.toString(),
      paymentStatus: funding.summary.paymentStatus,
    },
  });
  return funding;
}
