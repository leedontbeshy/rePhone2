import { createHash } from 'node:crypto';
import type { CheckoutPreviewDto } from './order-response.dto.js';

export const CHECKOUT_PREVIEW_FINGERPRINT_PATTERN = /^v1:[a-f0-9]{64}$/;

type CheckoutPreviewFingerprintSource = Omit<CheckoutPreviewDto, 'previewFingerprint'>;

/**
 * Produces an opaque, versioned fingerprint for every business value shown in checkout preview.
 * `calculatedAt` is deliberately excluded because it changes on every authoritative recalculation.
 */
export function checkoutPreviewFingerprint(preview: CheckoutPreviewFingerprintSource): string {
  const businessPreview = {
    schema: 1,
    cartUpdatedAt: preview.cartUpdatedAt,
    fulfillmentType: preview.fulfillmentType,
    items: preview.items.map((item) => ({
      cartItemId: item.cartItemId,
      itemType: item.itemType,
      target: {
        productId: item.target.productId,
        productName: item.target.productName,
        variantId: item.target.variantId,
        variantName: item.target.variantName,
        inventoryCode: item.target.inventoryCode,
      },
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineSubtotal: item.lineSubtotal,
      discountAmount: item.discountAmount,
      lineTotal: item.lineTotal,
    })),
    pricing: {
      subtotal: preview.pricing.subtotal,
      itemDiscountAmount: preview.pricing.itemDiscountAmount,
      voucherDiscountAmount: preview.pricing.voucherDiscountAmount,
      shippingFee: preview.pricing.shippingFee,
      grandTotal: preview.pricing.grandTotal,
      depositRequired: preview.pricing.depositRequired,
      balanceDue: preview.pricing.balanceDue,
    },
    voucher:
      preview.voucher === undefined
        ? null
        : {
            code: preview.voucher.code,
            name: preview.voucher.name,
            discountAmount: preview.voucher.discountAmount,
          },
    fulfillmentSummary: {
      type: preview.fulfillmentSummary.type,
      pickupStore:
        preview.fulfillmentSummary.pickupStore === undefined
          ? null
          : {
              code: preview.fulfillmentSummary.pickupStore.code,
              name: preview.fulfillmentSummary.pickupStore.name,
            },
    },
    warnings: preview.warnings,
  };

  return `v1:${createHash('sha256').update(JSON.stringify(businessPreview)).digest('hex')}`;
}
