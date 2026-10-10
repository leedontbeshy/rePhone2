import { describe, expect, it } from 'vitest';
import { allowsDealerCapability, allowsDealerWebhook } from './dealer-access.policy.js';
import type { DealerCapability } from './dealer-access.policy.js';
import {
  assertDealerHandover,
  canForceCancelDealerOrder,
  dealerExpiryDisposition,
  dealerReceiptCorrectionDecision,
  dealerReceiptDisposition,
  dealerRefundPayoutDecision,
} from './dealer-operations.policy.js';
import { projectDealerOrderFunding } from './dealer-finance.policy.js';
import { DealerInvariantError } from './dealer-invariant-error.js';

describe('dealer exceptional operations: policy acceptance, not database concurrency tests', () => {
  it('OPS-01: only an explicit admin override permits cancellation during proof review', () => {
    const state = {
      orderStatus: 'PLACED',
      fulfillmentStatus: 'PENDING',
      hasActiveProofReview: true,
    } as const;
    expect(canForceCancelDealerOrder({ ...state, adminOverride: false })).toBe(false);
    expect(canForceCancelDealerOrder({ ...state, adminOverride: true })).toBe(true);
    expect(dealerReceiptDisposition({ orderStatus: 'CANCELLED', fullyFunded: false })).toBe(
      'RECONCILE_OR_REFUND',
    );
    expect(
      canForceCancelDealerOrder({ ...state, adminOverride: true, fulfillmentStatus: 'IN_TRANSIT' }),
    ).toBe(false);
  });

  it.each<DealerCapability>([
    'CREATE_ORDER',
    'READ_EXISTING_ORDER',
    'PAY_EXISTING_ORDER',
    'AFTER_SALES',
    'ISSUE_API_KEY',
    'CATALOG_READ',
    'CANCEL_EXISTING_ORDER',
    'DELIVER_ORDER_WEBHOOK',
  ])('OPS-02: a security lock denies partner capability %s', (capability) => {
    expect(
      allowsDealerCapability(
        { businessStatus: 'ACTIVE', securityStatus: 'SECURITY_LOCKED' },
        capability,
      ),
    ).toBe(false);
  });

  it('OPS-03: freezing a refund destination does not free its financial obligation', () => {
    expect(
      dealerRefundPayoutDecision({
        refundStatus: 'PROCESSING',
        bankAccountVerified: true,
        bankAccountDisabled: true,
        payoutHold: true,
        transferState: 'NOT_SENT',
      }),
    ).toBe('HOLD');
    expect(
      projectDealerOrderFunding(100n, [
        {
          id: 'a1',
          amount: 100n,
          reversedAmount: 0n,
          refunds: [{ id: 'r1', status: 'PROCESSING', amount: 100n }],
        },
      ]).refundObligationAmount,
    ).toBe(100n);
  });

  it.each(['SENT', 'UNKNOWN'] as const)(
    'OPS-03: %s transfers need reconciliation, never a second payout',
    (transferState) => {
      expect(
        dealerRefundPayoutDecision({
          refundStatus: 'PROCESSING',
          bankAccountVerified: true,
          bankAccountDisabled: false,
          payoutHold: false,
          transferState,
        }),
      ).toBe('RECONCILE');
    },
  );

  it('OPS-04: a locked partner webhook does not veto a valid backoffice shipment', () => {
    expect(
      allowsDealerWebhook(
        { businessStatus: 'ACTIVE', securityStatus: 'SECURITY_LOCKED' },
        'EXISTING_ORDER',
      ),
    ).toBe(false);
    expect(() => {
      assertDealerHandover({
        orderStatus: 'PROCESSING',
        fulfillmentStatus: 'PREPARING',
        grandTotal: 100n,
        allocations: [{ id: 'a1', amount: 100n, reversedAmount: 0n, refunds: [] }],
      });
    }).not.toThrow();
  });

  it('OPS-05: correcting money after shipment or a refund requires reconciliation', () => {
    const input = { handedToCarrier: false, completedRefundAmount: 0n, hasRefundObligation: false };
    expect(dealerReceiptCorrectionDecision(input)).toBe('REVERSE_BEFORE_REALLOCATION');
    expect(dealerReceiptCorrectionDecision({ ...input, handedToCarrier: true })).toBe(
      'RECONCILIATION_REQUIRED',
    );
    expect(dealerReceiptCorrectionDecision({ ...input, hasRefundObligation: true })).toBe(
      'RECONCILIATION_REQUIRED',
    );
    expect(dealerReceiptCorrectionDecision({ ...input, completedRefundAmount: 1n })).toBe(
      'RECONCILIATION_REQUIRED',
    );
  });

  it('OPS-06: business suspension retains after-sales, existing payment and order webhooks', () => {
    const context = { businessStatus: 'BUSINESS_SUSPENDED', securityStatus: 'NORMAL' } as const;
    expect(allowsDealerCapability(context, 'CREATE_ORDER')).toBe(false);
    expect(allowsDealerCapability(context, 'ISSUE_API_KEY')).toBe(false);
    expect(allowsDealerCapability(context, 'AFTER_SALES')).toBe(true);
    expect(allowsDealerCapability(context, 'PAY_EXISTING_ORDER')).toBe(true);
    expect(allowsDealerWebhook(context, 'EXISTING_ORDER')).toBe(true);
    expect(allowsDealerWebhook(context, 'CATALOG')).toBe(false);
  });

  it('OPS-07: expiry first leaves late receipts for reconciliation; verification first prevents expiry', () => {
    expect(
      dealerExpiryDisposition({ orderStatus: 'PLACED', fullyFunded: false, holdDue: true }),
    ).toBe('CANCEL_AND_RECONCILE');
    expect(dealerReceiptDisposition({ orderStatus: 'CANCELLED', fullyFunded: false })).toBe(
      'RECONCILE_OR_REFUND',
    );
    expect(
      dealerExpiryDisposition({ orderStatus: 'CONFIRMED', fullyFunded: true, holdDue: true }),
    ).toBe('NO_ACTION');
  });

  it('INV-SHIP-01: blocks handover with a one-VND shortfall', () => {
    expect(() => {
      assertDealerHandover({
        orderStatus: 'PROCESSING',
        fulfillmentStatus: 'PREPARING',
        grandTotal: 100n,
        allocations: [{ id: 'a1', amount: 99n, reversedAmount: 0n, refunds: [] }],
      });
    }).toThrow(new DealerInvariantError('INV-SHIP-01'));
  });

  it.each(['PENDING', 'REJECTED'] as const)(
    'INV-ACCESS-01: %s applications have no order access',
    (businessStatus) => {
      expect(
        allowsDealerCapability({ businessStatus, securityStatus: 'NORMAL' }, 'CREATE_ORDER'),
      ).toBe(false);
      expect(
        allowsDealerCapability({ businessStatus, securityStatus: 'NORMAL' }, 'READ_EXISTING_ORDER'),
      ).toBe(false);
    },
  );
});
