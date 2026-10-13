import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Cart } from '@/app/commerce-provider';
import type { CheckoutPreview } from '@/lib/checkout-api';
import {
  CheckoutReceiptItems,
  CheckoutReceiptPricing,
  CheckoutVerification,
} from './checkout-receipt';

const cart: Cart = {
  status: 'ACTIVE',
  estimatedSubtotal: '9400000',
  warnings: [],
  items: [
    {
      id: 'cart-unit',
      itemType: 'IPHONE',
      quantity: 1,
      availabilityStatus: 'AVAILABLE',
      currentUnitPrice: '9000000',
      estimatedLineTotal: '9000000',
      priceAtAddition: '8800000',
      warnings: [],
      media: {
        url: 'https://media.example.test/actual-unit.webp',
        altText: 'Ảnh thật máy đã chọn',
      },
      target: {
        productId: 'product-unit',
        productSlug: 'iphone-17',
        productName: 'iPhone 17',
        variantId: 'variant-unit',
        variantName: '256 GB · Xanh lam khói',
        inventoryCode: 'RPH-IP17-256-MBL-U01',
      },
    },
    {
      id: 'cart-accessory',
      itemType: 'ACCESSORY',
      quantity: 2,
      availabilityStatus: 'AVAILABLE',
      currentUnitPrice: '200000',
      estimatedLineTotal: '400000',
      priceAtAddition: '200000',
      warnings: [],
      media: { url: 'https://media.example.test/actual-accessory.webp', altText: 'Củ sạc đã chọn' },
      target: {
        productId: 'product-accessory',
        productSlug: 'cu-sac-usb-c',
        productName: 'Củ sạc USB-C',
        variantId: 'variant-accessory',
        variantName: '20 W · Trắng',
      },
    },
  ],
};

const preview: CheckoutPreview = {
  calculatedAt: '2026-10-12T00:00:00Z',
  cartUpdatedAt: '2026-10-11T00:00:00Z',
  previewFingerprint: `v1:${'a'.repeat(64)}`,
  fulfillmentType: 'SHIPPING',
  fulfillmentSummary: { type: 'SHIPPING' },
  warnings: [],
  items: [
    {
      cartItemId: 'cart-unit',
      itemType: 'IPHONE',
      quantity: 1,
      unitPrice: '10200000',
      discountAmount: '200000',
      lineSubtotal: '10200000',
      lineTotal: '10000000',
      target: {
        productId: 'product-unit',
        productName: 'iPhone 17',
        variantId: 'variant-unit',
        variantName: '256 GB · Xanh lam khói',
        inventoryCode: 'RPH-IP17-256-MBL-U01',
      },
    },
    {
      cartItemId: 'cart-accessory',
      itemType: 'ACCESSORY',
      quantity: 2,
      unitPrice: '200000',
      discountAmount: '0',
      lineSubtotal: '400000',
      lineTotal: '400000',
      target: {
        productId: 'product-accessory',
        productName: 'Củ sạc USB-C',
        variantId: 'variant-accessory',
        variantName: '20 W · Trắng',
      },
    },
  ],
  pricing: {
    subtotal: '10600000',
    itemDiscountAmount: '200000',
    voucherDiscountAmount: '400000',
    shippingFee: '30000',
    grandTotal: '10030000',
    depositRequired: '500000',
    balanceDue: '10030000',
  },
  voucher: { code: 'SAVE400', name: 'Ưu đãi cửa hàng', discountAmount: '400000' },
};

describe('checkout receipt presentation', () => {
  it('uses preview identity and line totals with the matching actual cart media', () => {
    const markup = renderToStaticMarkup(
      <CheckoutReceiptItems
        cart={{ ...cart, items: [...cart.items].reverse() }}
        preview={preview}
      />,
    );
    const unit = markup.split('</article>')[0] ?? '';
    expect(unit).toContain('actual-unit.webp');
    expect(unit).not.toContain('actual-accessory.webp');
    expect(unit).toContain('Mã máy: RPH-IP17-256-MBL-U01');
    expect(unit).toContain('256 GB · Xanh lam khói');
    expect(unit).toMatch(/Số lượng: 1/);
    expect(unit).toContain('10.000.000');
    expect(unit).not.toContain('9.000.000');
    expect(markup).toMatch(/Số lượng: 2/);
    expect(markup).not.toMatch(/ui-studio|Ngoại hình A|Pin 96|Bảo hành 90/);
  });

  it('retains the exact item and an accessible fallback when media is absent', () => {
    const markup = renderToStaticMarkup(
      <CheckoutReceiptItems cart={{ ...cart, items: [] }} preview={preview} />,
    );
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Ảnh iPhone 17"');
    expect(markup).toContain('Ảnh đang được cập nhật');
    expect(markup).toContain('Mã máy: RPH-IP17-256-MBL-U01');
    expect(markup).not.toContain('<img');
  });

  it('identifies pre-preview item amounts as estimates without authoritative totals', () => {
    const markup = renderToStaticMarkup(<CheckoutReceiptItems cart={cart} preview={null} />);
    expect(markup).toContain('Giá tạm tính');
    expect(markup).toContain('9.000.000');
    expect(markup).not.toMatch(/Tổng thanh toán|Đặt cọc|đã được kiểm tra/);
  });

  it('shows authoritative pricing and a deposit under total without adding it again', () => {
    const markup = renderToStaticMarkup(<CheckoutReceiptPricing preview={preview} />);
    expect(markup).toMatch(/Tạm tính<\/span><strong[^>]*>10\.600\.000/);
    expect(markup).toMatch(/Giảm theo sản phẩm<\/span><strong[^>]*>−200\.000/);
    expect(markup).toMatch(/Giảm giá<\/span><strong[^>]*>−400\.000/);
    expect(markup).toMatch(/Phí giao hàng<\/span><strong[^>]*>30\.000/);
    expect(markup).toMatch(/Tổng thanh toán<\/span><strong[^>]*>10\.030\.000/);
    expect(markup).toMatch(/Đặt cọc<\/span><strong[^>]*>500\.000/);
    expect(markup).toMatch(/Số tiền còn lại<\/span><strong[^>]*>10\.030\.000/);
    expect(markup).toContain('Khoản đặt cọc chưa được thanh toán ở bước này.');
    expect(markup).not.toContain('9.530.000');
    expect(markup.indexOf('Tổng thanh toán')).toBeLessThan(markup.indexOf('Đặt cọc</span>'));
    expect(markup).toContain('Khoản đặt cọc là một phần của tổng thanh toán.');
    expect(markup).not.toContain('10.530.000');
    expect(markup).toContain('Ưu đãi cửa hàng (SAVE400)');
  });

  it('uses pickup snapshot amounts and store without inventing payment instructions', () => {
    const pickup: CheckoutPreview = {
      ...preview,
      fulfillmentType: 'PICKUP',
      fulfillmentSummary: {
        type: 'PICKUP',
        pickupStore: { code: 'SHOP', name: 'Cửa hàng kiểm thử' },
      },
      pricing: {
        ...preview.pricing,
        shippingFee: '0',
        grandTotal: '10000000',
        depositRequired: '0',
        balanceDue: '10000000',
      },
    };
    const markup = renderToStaticMarkup(<CheckoutReceiptPricing preview={pickup} />);
    expect(markup).toContain('Thanh toán tại cửa hàng');
    expect(markup).toContain('Nhận tại Cửa hàng kiểm thử');
    expect(markup).toMatch(/Đặt cọc<\/span><strong[^>]*>0/);
    expect(markup).toMatch(/Số tiền còn lại<\/span><strong[^>]*>10\.000\.000/);
    expect(markup).not.toMatch(/qrUrl|accountNumber|Ngân hàng|Thời gian giữ/);
  });

  it('omits zero discounts and maps unknown warning codes to customer copy', () => {
    const withoutVoucher = { ...preview };
    delete withoutVoucher.voucher;
    const markup = renderToStaticMarkup(
      <CheckoutReceiptPricing
        preview={{
          ...withoutVoucher,
          warnings: ['INTERNAL_PRIVATE_WARNING'],
          pricing: { ...preview.pricing, itemDiscountAmount: '0', voucherDiscountAmount: '0' },
        }}
      />,
    );
    expect(markup).not.toContain('Giảm theo sản phẩm');
    expect(markup).not.toContain('Giảm giá');
    expect(markup).not.toContain('INTERNAL_PRIVATE_WARNING');
    expect(markup).toContain('role="status"');
  });

  it('renders only public receipt fields and keeps concurrency and private data out of markup', () => {
    const extra = {
      guestAccessToken: 'PRIVATE-GUEST-TOKEN',
      cost: 'PRIVATE-COST',
      imei: 'PRIVATE-IMEI',
      serialNumber: 'PRIVATE-SERIAL',
      internalNote: 'PRIVATE-INTERNAL-NOTE',
      locationId: 'PRIVATE-LOCATION',
    };
    const markup = renderToStaticMarkup(
      <>
        <CheckoutReceiptItems cart={cart} preview={{ ...preview, ...extra }} />
        <CheckoutReceiptPricing preview={{ ...preview, ...extra }} />
      </>,
    );
    for (const value of Object.values(extra)) expect(markup).not.toContain(value);
    expect(markup).not.toContain(preview.previewFingerprint);
    expect(markup).not.toContain(preview.cartUpdatedAt);
    expect(markup).not.toMatch(/product-unit|variant-unit|cart-unit/);
  });

  it('claims verification only when the caller supplies a valid preview state', () => {
    const initial = renderToStaticMarkup(<CheckoutVerification verified={false} />);
    const verified = renderToStaticMarkup(<CheckoutVerification verified />);
    expect(initial).toContain('sẽ được kiểm tra');
    expect(initial).not.toContain('đã được kiểm tra');
    expect(verified).toContain('đã được kiểm tra');
    expect(verified).not.toContain('sẽ được kiểm tra');
  });
});
