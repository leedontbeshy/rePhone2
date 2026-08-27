'use client';

import {
  ArrowRightIcon,
  CheckCircleIcon,
  InfoIcon,
  MinusIcon,
  PlusIcon,
  ShoppingBagOpenIcon,
  TrashIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useCommerce, type CartItem } from '@/app/commerce-provider';
import { PublicMediaImage } from '@/components/catalog/public-media';
import { Button, formatVnd, InlineAlert, Price, Skeleton } from '@/components/ui';
import { classNames } from '@/components/ui/class-names';
import { cartItemHref, cartWarningLabel, isBlockingCartWarning } from './cart-wishlist-presenter';
import styles from './cart-wishlist.module.css';

export function CartView() {
  const commerce = useCommerce();
  const { cart, cartError, cartLoading, mergeError } = commerce;
  const [statusMessage, setStatusMessage] = useState('');
  const pageHeadingRef = useRef<HTMLHeadingElement>(null);
  const cartHeadingRef = useRef<HTMLHeadingElement>(null);
  const blockingWarnings = useMemo(
    () =>
      cart?.warnings.some(isBlockingCartWarning) === true ||
      cart?.items.some((item) => item.warnings.some(isBlockingCartWarning)) === true ||
      mergeError !== null,
    [cart, mergeError],
  );

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <p className={styles.eyebrow}>Giỏ hàng của bạn</p>
        <h1 ref={pageHeadingRef} tabIndex={-1}>
          Kiểm tra sản phẩm đã chọn
        </h1>
        <p>
          Mỗi chiếc máy đều được ghi đúng mã máy. Giá và tình trạng sẽ được kiểm tra lại trước khi
          bạn đặt hàng.
        </p>
      </header>
      <p className={styles.visuallyHidden} aria-live="polite">
        {statusMessage}
      </p>

      {mergeError === null ? null : (
        <InlineAlert title="Chưa thể cập nhật giỏ hàng" tone="danger">
          <AlertAction message={mergeError} label="Thử lại" action={commerce.retryMerge} />
        </InlineAlert>
      )}
      {cartError === null ? null : (
        <InlineAlert title="Chưa thể tải giỏ hàng" tone="danger">
          <AlertAction message={cartError} label="Tải lại" action={commerce.refreshCart} />
        </InlineAlert>
      )}
      {cartLoading ? <CartLoading /> : null}
      {!cartLoading && cartError === null && (cart === null || cart.items.length === 0) ? (
        <EmptyState
          icon={<ShoppingBagOpenIcon aria-hidden="true" size={34} />}
          title="Giỏ hàng đang trống"
          description="Khám phá những chiếc iPhone đã được kiểm tra kỹ lưỡng và phụ kiện phù hợp với bạn."
        />
      ) : null}

      {!cartLoading && cart !== null && cart.items.length > 0 ? (
        <>
          {cart.warnings.length > 0 ? (
            <section className={styles.cartNotices} aria-labelledby="cart-notices-title">
              <h2 id="cart-notices-title">Thông tin cần lưu ý</h2>
              <ul>
                {cart.warnings.map((warning) => (
                  <li key={warning}>
                    <WarningIcon blocking={isBlockingCartWarning(warning)} />
                    <span>{cartWarningLabel(warning)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <div className={styles.cartLayout}>
            <section className={styles.cartItems} aria-label="Sản phẩm trong giỏ hàng">
              <div className={styles.sectionHeading}>
                <h2 ref={cartHeadingRef} tabIndex={-1}>
                  {cart.items.length} sản phẩm đã chọn
                </h2>
                <span>Danh tính và giá của từng sản phẩm</span>
              </div>
              {cart.items.map((item) => (
                <CartRow
                  key={item.id}
                  item={item}
                  updateQuantity={commerce.updateQuantity}
                  removeItem={commerce.removeItem}
                  onRemoved={(productName) => {
                    setStatusMessage(`Đã xóa ${productName} khỏi giỏ hàng.`);
                    requestAnimationFrame(() => {
                      (cartHeadingRef.current ?? pageHeadingRef.current)?.focus();
                    });
                  }}
                />
              ))}
            </section>
            <aside className={styles.cartSummary} aria-labelledby="cart-summary-title">
              <h2 id="cart-summary-title">Tóm tắt giỏ hàng</h2>
              <div className={styles.summaryLine}>
                <span>Tạm tính</span>
                <Price amount={cart.estimatedSubtotal} />
              </div>
              <p>Ưu đãi và chi phí giao hàng sẽ được tính ở bước tiếp theo.</p>
              {blockingWarnings ? (
                <>
                  <span className={styles.disabledCheckout} aria-disabled="true">
                    Tiếp tục đặt hàng <ArrowRightIcon aria-hidden="true" size={20} />
                  </span>
                  <InlineAlert title="Cần điều chỉnh giỏ hàng" tone="warning">
                    Xử lý sản phẩm không còn sẵn hoặc chưa đủ số lượng để tiếp tục.
                  </InlineAlert>
                </>
              ) : (
                <Link className={styles.primaryLink} href="/checkout">
                  Tiếp tục đặt hàng <ArrowRightIcon aria-hidden="true" size={20} />
                </Link>
              )}
              <div className={styles.reassurance}>
                <CheckCircleIcon aria-hidden="true" size={20} weight="fill" />
                <span>Bạn vẫn có thể xem lại toàn bộ thông tin trước khi xác nhận.</span>
              </div>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}

function CartRow({
  item,
  updateQuantity,
  removeItem,
  onRemoved,
}: {
  item: CartItem;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  onRemoved: (productName: string) => void;
}) {
  const [quantity, setQuantity] = useState(item.quantity);
  const [pending, setPending] = useState<'update' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setQuantity(item.quantity);
  }, [item.quantity]);

  const run = async (kind: 'update' | 'remove', operation: () => Promise<void>) => {
    setPending(kind);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chưa thể cập nhật giỏ hàng.');
    } finally {
      setPending(null);
    }
  };
  const priceChanged = item.warnings.includes('PRICE_CHANGED');
  return (
    <article
      className={classNames(
        styles.cartRow,
        item.warnings.some(isBlockingCartWarning) && styles.cartRowBlocked,
      )}
    >
      <Link className={styles.cartMediaLink} href={cartItemHref(item)}>
        <PublicMediaImage
          className={styles.cartMedia}
          fallbackLabel={`Chưa có ảnh cho ${item.target.productName}`}
          media={item.media ?? undefined}
        />
      </Link>
      <div className={styles.cartRowBody}>
        <div className={styles.identityAndPrice}>
          <div className={styles.identity}>
            <span>{item.itemType === 'IPHONE' ? 'iPhone đã chọn' : 'Phụ kiện'}</span>
            <h3>
              <Link href={cartItemHref(item)}>{item.target.productName}</Link>
            </h3>
            <p>{item.target.variantName}</p>
            {item.target.inventoryCode ? (
              <p className={styles.inventoryCode}>Mã máy: {item.target.inventoryCode}</p>
            ) : null}
          </div>
          <div className={styles.itemPrice}>
            {item.currentUnitPrice === null || item.currentUnitPrice === undefined ? (
              <strong>Chưa có giá hiện tại</strong>
            ) : (
              <Price amount={item.currentUnitPrice} />
            )}
            {priceChanged ? (
              <span className={styles.oldPrice}>
                Giá khi thêm: {formatVnd(item.priceAtAddition)}
              </span>
            ) : null}
          </div>
        </div>
        {item.warnings.length > 0 ? (
          <ul className={styles.itemWarnings}>
            {item.warnings.map((warning) => (
              <li
                className={isBlockingCartWarning(warning) ? styles.blockingWarning : undefined}
                key={warning}
              >
                <WarningIcon blocking={isBlockingCartWarning(warning)} />
                <span>{cartWarningLabel(warning)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className={styles.cartRowActions}>
          {item.itemType === 'ACCESSORY' ? (
            <QuantityControl
              quantity={quantity}
              disabled={pending !== null}
              onChange={setQuantity}
            />
          ) : (
            <span className={styles.fixedQuantity}>Số lượng: 1</span>
          )}
          {item.itemType === 'ACCESSORY' ? (
            <Button
              disabled={pending !== null || quantity === item.quantity}
              loading={pending === 'update'}
              loadingLabel="Đang cập nhật số lượng"
              onClick={() => {
                void run('update', () => updateQuantity(item.id, quantity));
              }}
              variant="secondary"
            >
              Cập nhật
            </Button>
          ) : null}
          <Button
            className={styles.removeButton}
            disabled={pending !== null}
            iconLeading={<TrashIcon aria-hidden="true" size={18} />}
            loading={pending === 'remove'}
            loadingLabel="Đang xóa sản phẩm"
            onClick={() => {
              void run('remove', async () => {
                await removeItem(item.id);
                onRemoved(item.target.productName);
              });
            }}
            variant="ghost"
          >
            Xóa
          </Button>
        </div>
        <p className={styles.rowMessage} aria-live="polite">
          {error}
        </p>
      </div>
    </article>
  );
}

function QuantityControl({
  quantity,
  disabled,
  onChange,
}: {
  quantity: number;
  disabled: boolean;
  onChange: (quantity: number) => void;
}) {
  return (
    <div className={styles.quantityControl} aria-label="Chọn số lượng">
      <Button
        aria-label="Giảm số lượng"
        disabled={disabled || quantity <= 1}
        onClick={() => {
          onChange(Math.max(1, quantity - 1));
        }}
        size="icon"
        variant="secondary"
      >
        <MinusIcon aria-hidden="true" size={18} />
      </Button>
      <input
        aria-label="Số lượng phụ kiện"
        disabled={disabled}
        inputMode="numeric"
        max={99}
        min={1}
        type="number"
        value={quantity}
        onChange={(event) => {
          onChange(Math.min(99, Math.max(1, Number(event.target.value) || 1)));
        }}
      />
      <Button
        aria-label="Tăng số lượng"
        disabled={disabled || quantity >= 99}
        onClick={() => {
          onChange(Math.min(99, quantity + 1));
        }}
        size="icon"
        variant="secondary"
      >
        <PlusIcon aria-hidden="true" size={18} />
      </Button>
    </div>
  );
}

function WarningIcon({ blocking }: { blocking: boolean }) {
  return blocking ? (
    <WarningCircleIcon aria-hidden="true" size={18} weight="fill" />
  ) : (
    <InfoIcon aria-hidden="true" size={18} weight="fill" />
  );
}

function AlertAction({
  message,
  label,
  action,
}: {
  message: string;
  label: string;
  action: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const run = async () => {
    setPending(true);
    try {
      await action();
    } catch {
      // The provider keeps the actionable error visible in the surrounding alert.
    } finally {
      setPending(false);
    }
  };
  return (
    <div className={styles.alertActionRow}>
      <span>{message}</span>
      <Button
        loading={pending}
        loadingLabel="Đang thử lại"
        variant="secondary"
        onClick={() => {
          void run();
        }}
      >
        {label}
      </Button>
    </div>
  );
}

function CartLoading() {
  return (
    <div className={styles.cartLayout} aria-busy="true" aria-label="Đang tải giỏ hàng">
      <section className={styles.cartItems}>
        <Skeleton height="1.75rem" width="14rem" />
        {[0, 1].map((item) => (
          <div className={styles.cartRow} key={item}>
            <Skeleton height="9rem" width="9rem" />
            <div className={styles.loadingLines}>
              <Skeleton height="1.5rem" width="70%" />
              <Skeleton width="45%" />
              <Skeleton height="2.75rem" width="12rem" />
            </div>
          </div>
        ))}
      </section>
      <aside className={styles.cartSummary}>
        <Skeleton height="1.5rem" width="9rem" />
        <Skeleton height="2.5rem" width="100%" />
        <Skeleton height="3rem" width="100%" />
      </aside>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <section className={styles.emptyState}>
      <span className={styles.emptyIcon}>{icon}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <Link className={styles.primaryLink} href="/products">
        Xem sản phẩm <ArrowRightIcon aria-hidden="true" size={20} />
      </Link>
    </section>
  );
}
