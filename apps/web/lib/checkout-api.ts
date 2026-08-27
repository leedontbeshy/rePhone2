import type { components } from '@rephone/api-client';
import { checkoutChangedPreview } from './order-access';

export type CheckoutPreview = components['schemas']['CheckoutPreviewDto'];

export function parseChangedCheckoutPreview(value: unknown): CheckoutPreview | undefined {
  const candidate = checkoutChangedPreview(value);
  return isCheckoutPreview(candidate) ? candidate : undefined;
}

export function checkoutWarningMessage(code: string): string {
  const messages: Readonly<Record<string, string>> = {
    PRICE_CHANGED:
      'Giá của một sản phẩm vừa thay đổi. Vui lòng xem lại số tiền trước khi đặt hàng.',
    QUANTITY_NOT_AVAILABLE:
      'Số lượng bạn chọn hiện không còn đủ. Vui lòng quay lại giỏ hàng để điều chỉnh.',
    ITEM_UNAVAILABLE: 'Một sản phẩm hiện không còn sẵn để đặt hàng. Vui lòng chọn sản phẩm khác.',
    QUANTITY_CAPPED_ON_MERGE: 'Số lượng phụ kiện đã được điều chỉnh theo lượng hàng hiện có.',
    VOUCHER_NOT_APPLICABLE: 'Mã ưu đãi chưa áp dụng được cho đơn hàng này.',
  };
  return messages[code] ?? 'Thông tin đơn hàng vừa được cập nhật. Vui lòng kiểm tra lại.';
}

function isCheckoutPreview(value: unknown): value is CheckoutPreview {
  if (!isRecord(value)) return false;
  const fulfillmentSummary = value['fulfillmentSummary'];
  if (
    typeof value['calculatedAt'] !== 'string' ||
    typeof value['cartUpdatedAt'] !== 'string' ||
    (value['fulfillmentType'] !== 'PICKUP' && value['fulfillmentType'] !== 'SHIPPING') ||
    !Array.isArray(value['items']) ||
    !value['items'].every(isPreviewItem) ||
    !isPricing(value['pricing']) ||
    !isFulfillmentSummary(fulfillmentSummary) ||
    !Array.isArray(value['warnings']) ||
    !value['warnings'].every((warning) => typeof warning === 'string')
  ) {
    return false;
  }
  return (
    fulfillmentSummary.type === value['fulfillmentType'] &&
    (value['voucher'] === undefined || isVoucher(value['voucher']))
  );
}

function isPreviewItem(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['cartItemId'] === 'string' &&
    (value['itemType'] === 'IPHONE' || value['itemType'] === 'ACCESSORY') &&
    typeof value['quantity'] === 'number' &&
    Number.isInteger(value['quantity']) &&
    value['quantity'] >= 1 &&
    isMoney(value['unitPrice']) &&
    isMoney(value['discountAmount']) &&
    isMoney(value['lineSubtotal']) &&
    isMoney(value['lineTotal']) &&
    isRecord(value['target']) &&
    typeof value['target']['productId'] === 'string' &&
    typeof value['target']['productName'] === 'string' &&
    typeof value['target']['variantId'] === 'string' &&
    typeof value['target']['variantName'] === 'string' &&
    (value['target']['inventoryCode'] === undefined ||
      value['target']['inventoryCode'] === null ||
      typeof value['target']['inventoryCode'] === 'string')
  );
}

function isPricing(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return [
    'subtotal',
    'itemDiscountAmount',
    'voucherDiscountAmount',
    'shippingFee',
    'grandTotal',
    'depositRequired',
    'balanceDue',
  ].every((key) => isMoney(value[key]));
}

function isFulfillmentSummary(value: unknown): value is {
  type: 'PICKUP' | 'SHIPPING';
  pickupStore?: { code: string; name: string };
} {
  if (!isRecord(value) || (value['type'] !== 'PICKUP' && value['type'] !== 'SHIPPING')) {
    return false;
  }
  return (
    value['pickupStore'] === undefined ||
    (isRecord(value['pickupStore']) &&
      typeof value['pickupStore']['code'] === 'string' &&
      typeof value['pickupStore']['name'] === 'string')
  );
}

function isVoucher(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['code'] === 'string' &&
    typeof value['name'] === 'string' &&
    isMoney(value['discountAmount'])
  );
}

function isMoney(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
