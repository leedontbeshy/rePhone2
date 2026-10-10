import type {
  FulfillmentStatus,
  OrderStatus,
  RefundStatus,
} from '../../generated/prisma/client.js';
import { projectDealerOrderFunding, type DealerAllocationAmount } from './dealer-finance.policy.js';
import { requireDealerInvariant } from './dealer-invariant-error.js';

export function assertDealerHandover(input: {
  orderStatus: OrderStatus;
  fulfillmentStatus: FulfillmentStatus;
  grandTotal: bigint;
  allocations: readonly DealerAllocationAmount[];
}): void {
  requireDealerInvariant(
    input.orderStatus === 'PROCESSING' && input.fulfillmentStatus === 'PREPARING',
    'INV-SHIP-01',
  );
  requireDealerInvariant(
    projectDealerOrderFunding(input.grandTotal, input.allocations).fullyFunded,
    'INV-SHIP-01',
  );
}

export function canForceCancelDealerOrder(input: {
  orderStatus: OrderStatus;
  fulfillmentStatus: FulfillmentStatus;
  hasActiveProofReview: boolean;
  adminOverride: boolean;
}): boolean {
  if (!['PLACED', 'CONFIRMED', 'PROCESSING'].includes(input.orderStatus)) return false;
  if (!['PENDING', 'PREPARING', 'RETURNED'].includes(input.fulfillmentStatus)) return false;
  return !input.hasActiveProofReview || input.adminOverride;
}

export function dealerReceiptDisposition(input: {
  orderStatus: OrderStatus;
  fullyFunded: boolean;
}): 'ALLOCATE' | 'RECONCILE_OR_REFUND' {
  return input.orderStatus === 'PLACED' && !input.fullyFunded ? 'ALLOCATE' : 'RECONCILE_OR_REFUND';
}

export function dealerExpiryDisposition(input: {
  orderStatus: OrderStatus;
  fullyFunded: boolean;
  holdDue: boolean;
}): 'CANCEL_AND_RECONCILE' | 'NO_ACTION' {
  return input.orderStatus === 'PLACED' && !input.fullyFunded && input.holdDue
    ? 'CANCEL_AND_RECONCILE'
    : 'NO_ACTION';
}

export function dealerRefundPayoutDecision(input: {
  refundStatus: RefundStatus;
  bankAccountVerified: boolean;
  bankAccountDisabled: boolean;
  payoutHold: boolean;
  transferState: 'NOT_SENT' | 'SENT' | 'UNKNOWN';
}): 'ALLOW' | 'HOLD' | 'RECONCILE' {
  if (input.transferState !== 'NOT_SENT') return 'RECONCILE';
  return input.refundStatus === 'PROCESSING' &&
    input.bankAccountVerified &&
    !input.bankAccountDisabled &&
    !input.payoutHold
    ? 'ALLOW'
    : 'HOLD';
}

/** A correction after goods or money leave needs a reconciliation case, not an automatic reversal. */
export function dealerReceiptCorrectionDecision(input: {
  handedToCarrier: boolean;
  completedRefundAmount: bigint;
  hasRefundObligation: boolean;
}): 'REVERSE_BEFORE_REALLOCATION' | 'RECONCILIATION_REQUIRED' {
  return input.handedToCarrier || input.completedRefundAmount > 0n || input.hasRefundObligation
    ? 'RECONCILIATION_REQUIRED'
    : 'REVERSE_BEFORE_REALLOCATION';
}
