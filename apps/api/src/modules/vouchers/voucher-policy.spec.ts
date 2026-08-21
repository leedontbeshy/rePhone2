import { describe, expect, it } from 'vitest';
import { ApiError } from '../../common/errors/api-error.js';
import { calculateVoucherDiscount, parseVoucherScope } from './voucher-policy.js';

const lines = [
  {
    cartItemId: 'b',
    productId: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e1',
    productType: 'IPHONE' as const,
    variantId: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e2',
    lineSubtotal: '101',
  },
  {
    cartItemId: 'a',
    productId: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e3',
    productType: 'ACCESSORY' as const,
    variantId: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e4',
    lineSubtotal: '100',
  },
];

describe('voucher policy', () => {
  it('calculates fixed and percent discounts using integer arithmetic', () => {
    expect(
      calculateVoucherDiscount(
        {
          discountType: 'PERCENT',
          discountValue: '10',
          maxDiscountAmount: null,
          minimumOrderAmount: '0',
          scope: { type: 'ORDER' },
        },
        lines,
      ),
    ).toEqual({
      eligibleSubtotal: '201',
      discountAmount: '20',
      allocations: [
        { cartItemId: 'a', amount: '10' },
        { cartItemId: 'b', amount: '10' },
      ],
    });
    expect(
      calculateVoucherDiscount(
        {
          discountType: 'FIXED',
          discountValue: '999',
          maxDiscountAmount: null,
          minimumOrderAmount: '0',
          scope: { type: 'PRODUCT_TYPE', productType: 'ACCESSORY' },
        },
        lines,
      ).discountAmount,
    ).toBe('100');
  });

  it('allocates remainder deterministically by cart item id', () => {
    const result = calculateVoucherDiscount(
      {
        discountType: 'FIXED',
        discountValue: '1',
        maxDiscountAmount: null,
        minimumOrderAmount: '0',
        scope: { type: 'ORDER' },
      },
      lines,
    );
    expect(result.allocations).toEqual([
      { cartItemId: 'a', amount: '1' },
      { cartItemId: 'b', amount: '0' },
    ]);
  });

  it('rejects unknown, duplicate and empty scope targets', () => {
    for (const config of [
      { productIds: [] },
      { productIds: [lines[0]?.productId, lines[0]?.productId] },
      { productIds: [lines[0]?.productId], unknown: true },
    ]) {
      expect(() => parseVoucherScope('PRODUCTS', config)).toThrow(ApiError);
    }
  });
});
