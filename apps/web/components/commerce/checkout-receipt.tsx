import {
  CreditCardIcon,
  InfoIcon,
  MapPinIcon,
  ShieldCheckIcon,
  TagIcon,
} from '@phosphor-icons/react';
import type { Cart, CartItem } from '@/app/commerce-provider';
import { PublicMediaImage } from '@/components/catalog/public-media';
import { checkoutWarningMessage, type CheckoutPreview } from '@/lib/checkout-api';
import styles from './checkout-experience.module.css';

export function CheckoutReceiptItems({
  cart,
  preview,
}: Readonly<{ cart: Cart; preview: CheckoutPreview | null }>) {
  return (
    <div className={styles.summaryItems}>
      {(preview?.items ?? cart.items).map((source) => {
        const cartItem =
          'cartItemId' in source
            ? cart.items.find((item) => item.id === source.cartItemId)
            : source;
        return (
          <ReceiptItem
            key={'cartItemId' in source ? source.cartItemId : source.id}
            cartItem={cartItem}
            source={source}
          />
        );
      })}
    </div>
  );
}

function ReceiptItem({
  cartItem,
  source,
}: Readonly<{
  cartItem: CartItem | undefined;
  source: CartItem | CheckoutPreview['items'][number];
}>) {
  const isPreview = 'lineTotal' in source;
  const price = isPreview
    ? source.lineTotal
    : (source.estimatedLineTotal ?? source.priceAtAddition);
  const target = source.target;
  return (
    <article className={styles.summaryItem}>
      <div className={styles.summaryImageFrame} data-checkout-media>
        <PublicMediaImage
          className={styles.summaryImage}
          fallbackLabel={`Ảnh ${target.productName}`}
          media={cartItem?.media ?? undefined}
        />
      </div>
      <div className={styles.summaryItemCopy} data-checkout-identity>
        <strong>{target.productName}</strong>
        <span>{target.variantName}</span>
        <b className={styles.summaryItemPrice}>
          {isPreview ? null : <small>Giá tạm tính</small>}
          {money(price)} ₫
        </b>
        {target.inventoryCode ? (
          <span className={styles.summaryInventoryCode}>Mã máy: {target.inventoryCode}</span>
        ) : null}
        <span>Số lượng: {source.quantity}</span>
      </div>
    </article>
  );
}

export function CheckoutReceiptPricing({ preview }: Readonly<{ preview: CheckoutPreview }>) {
  const { pricing } = preview;
  const requiresDeposit = moneyIsPositive(pricing.depositRequired);
  const pickup = preview.fulfillmentType === 'PICKUP';
  return (
    <div className={styles.pricing}>
      {preview.warnings.length > 0 ? (
        <div className={styles.previewWarnings} role="status">
          {preview.warnings.map((warning, index) => (
            <p key={`${warning}-${String(index)}`}>{checkoutWarningMessage(warning)}</p>
          ))}
        </div>
      ) : null}
      {preview.voucher ? (
        <p className={styles.voucherSuccess}>
          <TagIcon aria-hidden="true" size={18} /> {preview.voucher.name} ({preview.voucher.code})
        </p>
      ) : null}
      <PriceLine label="Tạm tính" value={pricing.subtotal} />
      {moneyIsPositive(pricing.itemDiscountAmount) ? (
        <PriceLine discount label="Giảm theo sản phẩm" value={pricing.itemDiscountAmount} />
      ) : null}
      {moneyIsPositive(pricing.voucherDiscountAmount) ? (
        <PriceLine discount label="Giảm giá" value={pricing.voucherDiscountAmount} />
      ) : null}
      <PriceLine label="Phí giao hàng" value={pricing.shippingFee} />
      <div className={styles.grandTotal}>
        <span>Tổng thanh toán</span>
        <strong>{money(pricing.grandTotal)} ₫</strong>
      </div>
      {requiresDeposit || pickup ? (
        <div className={styles.depositExplanation}>
          <span className={styles.depositIcon}>
            <CreditCardIcon aria-hidden="true" size={24} />
          </span>
          <div>
            <strong>
              {requiresDeposit ? 'Đặt trước sau khi tạo đơn' : 'Thanh toán tại cửa hàng'}
            </strong>
            <p>
              {requiresDeposit
                ? 'Khoản đặt cọc là một phần của tổng thanh toán. Thanh toán phần còn lại khi nhận hàng.'
                : 'Bạn sẽ thanh toán khi nhận hàng tại cửa hàng theo thông tin đơn hàng.'}
            </p>
          </div>
        </div>
      ) : null}
      <PriceLine label="Đặt cọc" value={pricing.depositRequired} />
      <PriceLine label="Số tiền còn lại" value={pricing.balanceDue} />
      {requiresDeposit ? (
        <p className={styles.balanceNote}>
          Khoản đặt cọc chưa được thanh toán ở bước này. Số còn lại được cập nhật trên đơn khi thanh
          toán được xác nhận.
        </p>
      ) : null}
      {preview.fulfillmentSummary.pickupStore ? (
        <p className={styles.pickupStore}>
          <MapPinIcon aria-hidden="true" size={18} /> Nhận tại{' '}
          {preview.fulfillmentSummary.pickupStore.name}
        </p>
      ) : null}
    </div>
  );
}

export function CheckoutVerification({ verified }: Readonly<{ verified: boolean }>) {
  return verified ? (
    <div className={styles.assurance}>
      <ShieldCheckIcon aria-hidden="true" size={22} weight="fill" />
      <span>Giá và tình trạng sản phẩm đã được kiểm tra</span>
    </div>
  ) : (
    <div className={styles.prePreview}>
      <InfoIcon aria-hidden="true" size={20} />
      <p>Giá và tình trạng sản phẩm sẽ được kiểm tra trước khi đặt hàng</p>
    </div>
  );
}

function PriceLine({
  discount = false,
  label,
  value,
}: Readonly<{ discount?: boolean; label: string; value: string }>) {
  return (
    <div className={styles.priceLine}>
      <span>{label}</span>
      <strong className={discount ? styles.discount : undefined}>
        {discount ? '−' : ''}
        {money(value)} ₫
      </strong>
    </div>
  );
}

function money(value: string): string {
  try {
    return new Intl.NumberFormat('vi-VN').format(BigInt(value));
  } catch {
    return value;
  }
}

function moneyIsPositive(value: string): boolean {
  try {
    return BigInt(value) > BigInt(0);
  } catch {
    return false;
  }
}
