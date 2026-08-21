import { describe, expect, it } from 'vitest';
import type { CheckoutCatalogLine } from '../catalog/checkout-catalog.reader.js';
import type { CheckoutSettings } from '../settings/checkout-settings.reader.js';
import {
  calculateCheckoutPricing,
  generateOrderNumber,
  orderTransferContent,
  resolveWarranty,
} from './checkout-pricing.js';

const settings: CheckoutSettings = {
  storeName: 'rePhone',
  storePhone: '0900000000',
  storeAddress: 'HCMC',
  timezone: 'Asia/Ho_Chi_Minh',
  defaultShippingFee: '30000',
  shippingDepositAmount: '500000',
  pickupHoldMinutes: 1440,
  depositProofWindowMinutes: 30,
  depositReviewWindowMinutes: 1440,
  defaultWarrantyDays: 30,
  defaultWarrantyTerms: 'Default terms',
  bankName: 'Bank',
  bankAccountNumber: '123',
  bankAccountHolder: 'REPHONE',
  bankQrBucket: null,
  bankQrObjectPath: null,
};

const line: CheckoutCatalogLine = {
  cartItemId: 'cart-item-a',
  itemType: 'ACCESSORY',
  productId: 'product-a',
  productType: 'ACCESSORY',
  productName: 'Cable',
  variantId: 'variant-a',
  variantName: 'Cable 1m',
  sku: 'CABLE-1M',
  inventoryUnitId: null,
  inventoryCode: null,
  unitLocationId: null,
  quantity: 2,
  unitPrice: '100000',
  configurationSnapshot: {},
  warrantyDaysOverride: null,
  variantWarranty: { days: 90, terms: 'Variant terms' },
  productWarranty: { days: 60, terms: 'Product terms' },
};

describe('checkout pricing', () => {
  it('uses bigint, deterministic voucher allocation and caps shipping deposit', () => {
    const result = calculateCheckoutPricing([line], settings, 'SHIPPING', {
      id: 'voucher-a',
      code: 'SAVE50',
      name: 'Save',
      eligibleSubtotal: '200000',
      discountAmount: '50000',
      allocations: [{ cartItemId: 'cart-item-a', amount: '50000' }],
    });
    expect(result).toMatchObject({
      subtotal: '200000',
      voucherDiscountAmount: '50000',
      shippingFee: '30000',
      grandTotal: '180000',
      depositRequired: '180000',
      balanceDue: '180000',
    });
    expect(result.lines[0]).toMatchObject({
      lineSubtotal: '200000',
      discountAmount: '50000',
      lineTotal: '150000',
      warrantyDays: 90,
      warrantyTerms: 'Variant terms',
    });
  });

  it('sets pickup fee and deposit to zero', () => {
    const result = calculateCheckoutPricing([line], settings, 'PICKUP', null);
    expect(result.shippingFee).toBe('0');
    expect(result.depositRequired).toBe('0');
    expect(result.grandTotal).toBe('200000');
  });

  it('resolves warranty days and terms independently by precedence', () => {
    expect(
      resolveWarranty({ ...line, warrantyDaysOverride: 365, variantWarranty: null }, settings),
    ).toEqual({ days: 365, terms: 'Product terms' });
  });

  it('uses business timezone for public order number and stable transfer content', () => {
    const orderNumber = generateOrderNumber(
      new Date('2026-08-20T18:00:00.000Z'),
      'Asia/Ho_Chi_Minh',
    );
    expect(orderNumber).toMatch(/^RPH-20260821-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
    expect(orderTransferContent(orderNumber)).toBe(orderNumber.replaceAll('-', ''));
  });
});
