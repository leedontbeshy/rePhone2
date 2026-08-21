'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CatalogHeader, MediaImage, formatMoney } from '../catalog-ui';
import { useCommerce, type CartItem } from '../commerce-provider';

export default function CartPage() {
  const {
    cart,
    cartLoading,
    cartError,
    mergeError,
    refreshCart,
    retryMerge,
    updateQuantity,
    removeItem,
  } = useCommerce();

  return (
    <>
      <CatalogHeader />
      <main className="catalog-shell commerce-shell">
        <div className="commerce-heading">
          <p className="eyebrow">Ý định mua hàng</p>
          <h1>Giỏ hàng</h1>
          <p>Giá và tồn được kiểm tra lại theo dữ liệu hiện hành; giỏ hàng chưa giữ sản phẩm.</p>
        </div>
        {mergeError === null ? null : (
          <div className="commerce-alert error" role="alert">
            <span>{mergeError}</span>
            <button className="button" type="button" onClick={() => void retryMerge()}>
              Thử gộp lại
            </button>
          </div>
        )}
        {cartError === null ? null : (
          <div className="commerce-alert error" role="alert">
            <span>{cartError}</span>
            <button className="button" type="button" onClick={() => void refreshCart()}>
              Tải lại
            </button>
          </div>
        )}
        {cartLoading ? <div className="empty-state">Đang tải giỏ hàng…</div> : null}
        {!cartLoading && (cart === null || cart.items.length === 0) ? (
          <section className="empty-state">
            <h2>Giỏ hàng đang trống</h2>
            <p>Chọn một chiếc iPhone thật hoặc phụ kiện để bắt đầu.</p>
            <Link className="button primary" href="/products">
              Xem sản phẩm
            </Link>
          </section>
        ) : null}
        {!cartLoading && cart !== null && cart.items.length > 0 ? (
          <div className="cart-layout">
            <section className="cart-items" aria-label="Sản phẩm trong giỏ">
              {cart.items.map((item) => (
                <CartRow
                  key={item.id}
                  item={item}
                  updateQuantity={updateQuantity}
                  removeItem={removeItem}
                />
              ))}
            </section>
            <aside className="cart-summary">
              <span>Tạm tính hợp lệ</span>
              <strong>{formatMoney(cart.estimatedSubtotal)} ₫</strong>
              <p>Chưa gồm voucher, phí giao hàng hoặc tiền cọc.</p>
              <p>Checkout và reservation sẽ được triển khai ở Slice 06.</p>
            </aside>
          </div>
        ) : null}
      </main>
    </>
  );
}

function CartRow({
  item,
  updateQuantity,
  removeItem,
}: {
  item: CartItem;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(item.quantity);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setQuantity(item.quantity);
  }, [item.quantity]);
  const href = item.target.inventoryCode
    ? `/products/${item.target.productSlug}/units/${item.target.inventoryCode}`
    : `/products/${item.target.productSlug}`;

  const run = async (operation: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể cập nhật giỏ hàng.');
    } finally {
      setPending(false);
    }
  };

  return (
    <article className="cart-row">
      <MediaImage media={item.media ?? undefined} className="cart-item-image" />
      <div className="cart-row-main">
        <Link href={href}>
          <strong>{item.target.productName}</strong>
        </Link>
        <span>{item.target.variantName}</span>
        {item.target.inventoryCode ? <span>{item.target.inventoryCode}</span> : null}
        <div className="cart-price">
          {item.currentUnitPrice === null || item.currentUnitPrice === undefined ? (
            <strong>Không còn giá hiện hành</strong>
          ) : (
            <strong>{formatMoney(item.currentUnitPrice)} ₫</strong>
          )}
          {item.currentUnitPrice !== item.priceAtAddition ? (
            <span>Giá lúc thêm: {formatMoney(item.priceAtAddition)} ₫</span>
          ) : null}
        </div>
        {item.warnings.length > 0 ? (
          <ul className="cart-warnings">
            {item.warnings.map((warning) => (
              <li key={warning}>{warningLabel(warning)}</li>
            ))}
          </ul>
        ) : null}
        <div className="cart-row-actions">
          {item.itemType === 'ACCESSORY' ? (
            <label>
              Số lượng
              <input
                type="number"
                min={1}
                max={99}
                value={quantity}
                disabled={pending}
                onChange={(event) => {
                  setQuantity(Math.min(99, Math.max(1, Number(event.target.value) || 1)));
                }}
              />
            </label>
          ) : (
            <span>Số lượng 1</span>
          )}
          {item.itemType === 'ACCESSORY' ? (
            <button
              className="button"
              type="button"
              disabled={pending || quantity === item.quantity}
              onClick={() => void run(() => updateQuantity(item.id, quantity))}
            >
              Cập nhật
            </button>
          ) : null}
          <button
            className="button"
            type="button"
            disabled={pending}
            onClick={() => void run(() => removeItem(item.id))}
          >
            Xóa
          </button>
        </div>
        <p className="form-error" aria-live="polite">
          {error}
        </p>
      </div>
    </article>
  );
}

function warningLabel(warning: CartItem['warnings'][number]): string {
  return {
    PRICE_CHANGED: 'Giá đã thay đổi kể từ lúc thêm.',
    QUANTITY_NOT_AVAILABLE: 'Số lượng hiện tại không đủ.',
    ITEM_UNAVAILABLE: 'Sản phẩm hiện không còn khả dụng.',
    QUANTITY_CAPPED_ON_MERGE: 'Số lượng sau khi gộp được giới hạn ở 99.',
  }[warning];
}
