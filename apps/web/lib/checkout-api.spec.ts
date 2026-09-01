import { describe, expect, it } from 'vitest';
import {
  checkoutWarningMessage,
  createCheckoutRequestEpoch,
  parseChangedCheckoutPreview,
} from './checkout-api';

const preview = {
  calculatedAt: '2026-08-27T00:00:00.000Z',
  cartUpdatedAt: '2026-08-27T00:00:00.000Z',
  fulfillmentType: 'SHIPPING',
  fulfillmentSummary: { type: 'SHIPPING' },
  items: [
    {
      cartItemId: 'item-1',
      itemType: 'IPHONE',
      quantity: 1,
      unitPrice: '10000000',
      discountAmount: '0',
      lineSubtotal: '10000000',
      lineTotal: '10000000',
      target: {
        productId: 'product-1',
        productName: 'iPhone 13',
        variantId: 'variant-1',
        variantName: '128 GB · Đen',
        inventoryCode: 'IP13-A239',
      },
    },
  ],
  pricing: {
    subtotal: '10000000',
    itemDiscountAmount: '0',
    voucherDiscountAmount: '0',
    shippingFee: '0',
    grandTotal: '10000000',
    depositRequired: '0',
    balanceDue: '10000000',
  },
  warnings: [],
};

describe('parseChangedCheckoutPreview', () => {
  it('returns a structurally safe preview from the review-required response', () => {
    expect(
      parseChangedCheckoutPreview({
        error: {
          code: 'CHECKOUT_REVIEW_REQUIRED',
          details: [{ code: 'CHECKOUT_CHANGED', current: preview }],
        },
      }),
    ).toEqual(preview);
  });

  it('rejects malformed review details', () => {
    expect(
      parseChangedCheckoutPreview({
        error: {
          code: 'CHECKOUT_REVIEW_REQUIRED',
          details: [{ code: 'CHECKOUT_CHANGED', current: { ...preview, items: null } }],
        },
      }),
    ).toBeUndefined();
  });

  it('rejects malformed nested public values', () => {
    expect(
      parseChangedCheckoutPreview({
        error: {
          code: 'CHECKOUT_REVIEW_REQUIRED',
          details: [
            {
              code: 'CHECKOUT_CHANGED',
              current: {
                ...preview,
                fulfillmentSummary: { type: 'PICKUP', pickupStore: { name: { raw: true } } },
              },
            },
          ],
        },
      }),
    ).toBeUndefined();
  });

  it('rejects invalid quantity, money and pickup-store values', () => {
    const cases = [
      { ...preview, items: [{ ...preview.items[0], quantity: 0 }] },
      { ...preview, pricing: { ...preview.pricing, grandTotal: '10.5' } },
      {
        ...preview,
        fulfillmentType: 'PICKUP',
        fulfillmentSummary: { type: 'PICKUP', pickupStore: { name: 'rePhone Quận 1' } },
      },
      { ...preview, fulfillmentSummary: { type: 'PICKUP' } },
    ];

    for (const current of cases) {
      expect(
        parseChangedCheckoutPreview({
          error: {
            code: 'CHECKOUT_REVIEW_REQUIRED',
            details: [{ code: 'CHECKOUT_CHANGED', current }],
          },
        }),
      ).toBeUndefined();
    }
  });
});

describe('checkoutWarningMessage', () => {
  it('uses natural Vietnamese for known and unknown warnings', () => {
    expect(checkoutWarningMessage('PRICE_CHANGED')).toContain('Giá của một sản phẩm');
    expect(checkoutWarningMessage('INTERNAL_WARNING')).not.toContain('INTERNAL_WARNING');
  });
});

describe('createCheckoutRequestEpoch', () => {
  it('rejects responses from a replaced or invalidated checkout request', () => {
    const epoch = createCheckoutRequestEpoch();
    const first = epoch.begin();
    expect(epoch.isCurrent(first)).toBe(true);

    const second = epoch.begin();
    expect(epoch.isCurrent(first)).toBe(false);
    expect(epoch.isCurrent(second)).toBe(true);

    epoch.invalidate();
    expect(epoch.isCurrent(second)).toBe(false);
  });
});
