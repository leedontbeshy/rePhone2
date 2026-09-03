import { describe, expect, it } from 'vitest';
import type { CheckoutPreviewDto } from './order-response.dto.js';
import { checkoutPreviewFingerprint } from './checkout-preview-fingerprint.js';

type FingerprintSource = Omit<CheckoutPreviewDto, 'previewFingerprint'>;

const preview = {
  calculatedAt: '2026-09-02T10:00:00.000Z',
  cartUpdatedAt: '2026-09-02T09:59:00.000Z',
  fulfillmentType: 'PICKUP',
  items: [
    {
      cartItemId: 'cart-item-1',
      itemType: 'IPHONE',
      target: {
        productId: 'product-1',
        productName: 'iPhone 15',
        variantId: 'variant-1',
        variantName: '128 GB · Đen',
        inventoryCode: 'RPH-U-001',
      },
      quantity: 1,
      unitPrice: '10000000',
      lineSubtotal: '10000000',
      discountAmount: '100000',
      lineTotal: '9900000',
    },
  ],
  pricing: {
    subtotal: '10000000',
    itemDiscountAmount: '100000',
    voucherDiscountAmount: '100000',
    shippingFee: '0',
    grandTotal: '9800000',
    depositRequired: '0',
    balanceDue: '9800000',
  },
  voucher: { code: 'SAVE100', name: 'Ưu đãi 100K', discountAmount: '100000' },
  fulfillmentSummary: {
    type: 'PICKUP',
    pickupStore: { code: 'HCM', name: 'Cửa hàng Hồ Chí Minh' },
  },
  warnings: [],
} satisfies FingerprintSource;

describe('checkoutPreviewFingerprint', () => {
  it('is versioned, deterministic and excludes only the calculation timestamp', () => {
    const fingerprint = checkoutPreviewFingerprint(preview);

    expect(fingerprint).toMatch(/^v1:[a-f0-9]{64}$/);
    expect(checkoutPreviewFingerprint(preview)).toBe(fingerprint);
    expect(
      checkoutPreviewFingerprint({ ...preview, calculatedAt: '2026-09-02T10:01:00.000Z' }),
    ).toBe(fingerprint);
  });

  it.each([
    [
      'cart revision',
      (current: FingerprintSource) => (current.cartUpdatedAt = '2026-09-02T10:00:00.000Z'),
    ],
    ['fulfillment', (current: FingerprintSource) => (current.fulfillmentType = 'SHIPPING')],
    [
      'pickup store',
      (current: FingerprintSource) => {
        if (current.fulfillmentSummary.pickupStore !== undefined) {
          current.fulfillmentSummary.pickupStore.name = 'Cửa hàng mới';
        }
      },
    ],
    [
      'product metadata',
      (current: FingerprintSource) => {
        const item = current.items[0];
        if (item !== undefined) item.target.productName = 'iPhone 15 mới';
      },
    ],
    [
      'line allocation',
      (current: FingerprintSource) => {
        const item = current.items[0];
        if (item !== undefined) item.discountAmount = '200000';
      },
    ],
    [
      'pricing',
      (current: FingerprintSource) => {
        current.pricing.shippingFee = '30000';
      },
    ],
    [
      'voucher metadata',
      (current: FingerprintSource) => {
        if (current.voucher !== undefined) current.voucher.name = 'Tên ưu đãi mới';
      },
    ],
    ['warnings', (current: FingerprintSource) => current.warnings.push('PRICE_CHANGED')],
  ])('changes when %s changes', (_label, mutate) => {
    const changed = structuredClone(preview) as FingerprintSource;
    mutate(changed);

    expect(checkoutPreviewFingerprint(changed)).not.toBe(checkoutPreviewFingerprint(preview));
  });
});
