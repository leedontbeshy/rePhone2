export interface OrderFinanceProjection {
  paidAmount: bigint;
  refundedAmount: bigint;
  balanceDue: bigint;
  paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
}

export function deriveOrderPaymentStatus(
  paid: bigint,
  refunded: bigint,
  grandTotal: bigint,
): OrderFinanceProjection['paymentStatus'] {
  if (refunded > 0n && refunded >= paid) return 'REFUNDED';
  if (refunded > 0n) return 'PARTIALLY_REFUNDED';
  if (paid >= grandTotal) return 'PAID';
  if (paid > 0n) return 'PARTIALLY_PAID';
  return 'UNPAID';
}

export function projectOrderFinance(
  grandTotal: bigint,
  verifiedAmounts: readonly bigint[],
  completedRefundAmounts: readonly bigint[],
): OrderFinanceProjection {
  const paidAmount = verifiedAmounts.reduce((sum, amount) => sum + amount, 0n);
  const refundedAmount = completedRefundAmounts.reduce((sum, amount) => sum + amount, 0n);
  const balanceDue = grandTotal > paidAmount ? grandTotal - paidAmount : 0n;
  return {
    paidAmount,
    refundedAmount,
    balanceDue,
    paymentStatus: deriveOrderPaymentStatus(paidAmount, refundedAmount, grandTotal),
  };
}
