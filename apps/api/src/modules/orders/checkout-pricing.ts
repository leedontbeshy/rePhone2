import { randomBytes } from 'node:crypto';
import { ApiError } from '../../common/errors/api-error.js';
import type { CheckoutCatalogLine } from '../catalog/checkout-catalog.reader.js';
import type { CheckoutSettings } from '../settings/checkout-settings.reader.js';
import type { CheckoutVoucherResult } from '../vouchers/checkout-voucher.gateway.js';

const ORDER_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export interface CheckoutPricedLine extends CheckoutCatalogLine {
  lineSubtotal: string;
  discountAmount: string;
  lineTotal: string;
  warrantyDays: number;
  warrantyTerms: string;
}

export interface CheckoutPricing {
  lines: CheckoutPricedLine[];
  subtotal: string;
  itemDiscountAmount: '0';
  voucherDiscountAmount: string;
  shippingFeeOriginal: string;
  shippingFee: string;
  grandTotal: string;
  depositRequired: string;
  balanceDue: string;
}

export function calculateCheckoutPricing(
  lines: readonly CheckoutCatalogLine[],
  settings: CheckoutSettings,
  fulfillmentType: 'PICKUP' | 'SHIPPING',
  voucher: CheckoutVoucherResult | null,
): CheckoutPricing {
  const allocations = new Map(
    (voucher?.allocations ?? []).map(({ cartItemId, amount }) => [cartItemId, money(amount)]),
  );
  const pricedLines = lines.map((line): CheckoutPricedLine => {
    const lineSubtotal = money(line.unitPrice) * BigInt(line.quantity);
    const discountAmount = allocations.get(line.cartItemId) ?? 0n;
    if (discountAmount < 0n || discountAmount > lineSubtotal) {
      throw new ApiError('INTERNAL_ERROR');
    }
    allocations.delete(line.cartItemId);
    const warranty = resolveWarranty(line, settings);
    return {
      ...line,
      lineSubtotal: lineSubtotal.toString(),
      discountAmount: discountAmount.toString(),
      lineTotal: (lineSubtotal - discountAmount).toString(),
      warrantyDays: warranty.days,
      warrantyTerms: warranty.terms,
    };
  });
  if (allocations.size !== 0) throw new ApiError('INTERNAL_ERROR');

  const subtotal = pricedLines.reduce((sum, line) => sum + money(line.lineSubtotal), 0n);
  const voucherDiscount = pricedLines.reduce((sum, line) => sum + money(line.discountAmount), 0n);
  if (voucher !== null && voucherDiscount !== money(voucher.discountAmount)) {
    throw new ApiError('INTERNAL_ERROR');
  }
  const shippingFeeOriginal =
    fulfillmentType === 'SHIPPING' ? money(settings.defaultShippingFee) : 0n;
  const grandTotal = subtotal - voucherDiscount + shippingFeeOriginal;
  if (grandTotal < 0n) throw new ApiError('INTERNAL_ERROR');
  const depositRequired =
    fulfillmentType === 'SHIPPING' ? min(money(settings.shippingDepositAmount), grandTotal) : 0n;

  return {
    lines: pricedLines,
    subtotal: subtotal.toString(),
    itemDiscountAmount: '0',
    voucherDiscountAmount: voucherDiscount.toString(),
    shippingFeeOriginal: shippingFeeOriginal.toString(),
    shippingFee: shippingFeeOriginal.toString(),
    grandTotal: grandTotal.toString(),
    depositRequired: depositRequired.toString(),
    balanceDue: grandTotal.toString(),
  };
}

export function resolveWarranty(
  line: Pick<CheckoutCatalogLine, 'warrantyDaysOverride' | 'variantWarranty' | 'productWarranty'>,
  settings: Pick<CheckoutSettings, 'defaultWarrantyDays' | 'defaultWarrantyTerms'>,
): { days: number; terms: string } {
  return {
    days:
      line.warrantyDaysOverride ??
      line.variantWarranty?.days ??
      line.productWarranty?.days ??
      settings.defaultWarrantyDays,
    terms:
      line.variantWarranty?.terms ?? line.productWarranty?.terms ?? settings.defaultWarrantyTerms,
  };
}

export function generateOrderNumber(now: Date, timezone: string): string {
  const businessDate = formatBusinessDate(now, timezone);
  const bytes = randomBytes(8);
  const suffix = Array.from(bytes, (byte) => ORDER_ALPHABET[byte & 31]).join('');
  return `RPH-${businessDate}-${suffix}`;
}

export function orderTransferContent(orderNumber: string): string {
  return orderNumber.replaceAll('-', '');
}

function formatBusinessDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  if (values.year === undefined || values.month === undefined || values.day === undefined) {
    throw new ApiError('INTERNAL_ERROR');
  }
  return `${values.year}${values.month}${values.day}`;
}

function money(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new ApiError('INTERNAL_ERROR');
  return BigInt(value);
}

function min(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}
