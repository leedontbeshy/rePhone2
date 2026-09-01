'use client';

import type { components } from '@rephone/api-client';
import {
  ArrowRightIcon,
  HeartStraightIcon,
  ShoppingCartSimpleIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { useCommerce } from '@/app/commerce-provider';
import { PublicMediaImage } from '@/components/catalog/public-media';
import { Button, InlineAlert, Price, Skeleton, StatusChip } from '@/components/ui';
import { classNames } from '@/components/ui/class-names';
import { createSynchronousActionLock } from '@/lib/synchronous-action-lock';
import { wishlistAccessoryQuantity } from './cart-wishlist-presenter';
import styles from './cart-wishlist.module.css';

type WishlistItem = components['schemas']['WishlistItemDto'];
type ItemAction = 'add' | 'remove';
interface ItemFeedback {
  text: string;
  tone: 'success' | 'error';
}

export function WishlistView() {
  const { status, user } = useAuth();
  const sessionKey = `${status}:${user?.role ?? 'NONE'}:${user?.id ?? 'NONE'}`;
  return <WishlistSession key={sessionKey} />;
}

function WishlistSession() {
  const { client, status, user } = useAuth();
  const { addAccessory, addIphone, cart } = useCommerce();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, ItemAction | undefined>>({});
  const [messages, setMessages] = useState<Record<string, ItemFeedback | undefined>>({});
  const [pageStatus, setPageStatus] = useState('');
  const [actionLock] = useState(() => createSynchronousActionLock<string>());
  const loadSequence = useRef(0);
  const pageHeadingRef = useRef<HTMLHeadingElement>(null);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    if (status !== 'authenticated' || user?.role !== 'CUSTOMER') {
      loadSequence.current += 1;
      setItems([]);
      setLoadError(null);
      setPending({});
      setMessages({});
      setLoading(false);
      return;
    }
    const sequence = loadSequence.current + 1;
    loadSequence.current = sequence;
    setLoading(true);
    try {
      const result = await client.GET('/api/v1/wishlist');
      if (sequence !== loadSequence.current) return;
      if (result.data === undefined) {
        setLoadError('Chưa thể tải danh sách sản phẩm ưa thích. Vui lòng thử lại.');
        setLoading(false);
        return;
      }
      setItems(result.data.data);
      setLoadError(null);
      setLoading(false);
    } catch {
      if (sequence !== loadSequence.current) return;
      setLoadError('Chưa thể tải danh sách sản phẩm ưa thích. Vui lòng thử lại.');
      setLoading(false);
    }
  }, [client, status, user?.id, user?.role]);

  useEffect(() => {
    void load();
    return () => {
      loadSequence.current += 1;
    };
  }, [load]);

  const runAction = (item: WishlistItem, action: ItemAction) =>
    actionLock.run(item.id, async () => {
      setPending((current) => ({ ...current, [item.id]: action }));
      setMessages((current) => ({ ...current, [item.id]: undefined }));
      try {
        if (action === 'remove') {
          const result = await client.DELETE('/api/v1/wishlist/items/{itemId}', {
            params: { path: { itemId: item.id } },
          });
          if (result.response.status !== 204)
            throw new Error('Chưa thể xóa sản phẩm khỏi danh sách.');
          setItems((current) => current.filter((candidate) => candidate.id !== item.id));
          setPageStatus(`Đã xóa ${item.target.productName} khỏi danh sách ưa thích.`);
          requestAnimationFrame(() => {
            (listHeadingRef.current ?? pageHeadingRef.current)?.focus();
          });
          return;
        }
        if (item.itemType === 'IPHONE') {
          if (item.target.inventoryCode === undefined)
            throw new Error('Chiếc máy này hiện không thể thêm vào giỏ hàng.');
          await addIphone(item.target.inventoryCode);
        } else {
          await addAccessory(
            item.target.variantId,
            wishlistAccessoryQuantity(cart, item.target.variantId),
          );
        }
        setMessages((current) => ({
          ...current,
          [item.id]: { text: 'Đã thêm vào giỏ hàng.', tone: 'success' },
        }));
      } catch (caught) {
        setMessages((current) => ({
          ...current,
          [item.id]: {
            text: caught instanceof Error ? caught.message : 'Chưa thể thực hiện thao tác này.',
            tone: 'error',
          },
        }));
      } finally {
        setPending((current) => ({ ...current, [item.id]: undefined }));
      }
    });

  const isCustomer = status === 'authenticated' && user?.role === 'CUSTOMER';
  const initialLoading = status === 'loading' || (loading && isCustomer && items.length === 0);
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <p className={styles.eyebrow}>Sản phẩm ưa thích</p>
        <h1 ref={pageHeadingRef} tabIndex={-1}>
          Những lựa chọn bạn muốn xem lại
        </h1>
        <p>
          Theo dõi giá và tình trạng hiện tại, đồng thời dễ dàng đưa sản phẩm còn sẵn vào giỏ hàng.
        </p>
      </header>
      <p className={styles.visuallyHidden} aria-live="polite">
        {pageStatus}
      </p>

      {initialLoading ? <WishlistLoading /> : null}
      {status === 'anonymous' ? (
        <EmptyWishlistState
          title="Đăng nhập để xem sản phẩm ưa thích"
          description="Danh sách của bạn sẽ luôn sẵn sàng khi quay lại."
          actionHref="/login?returnTo=%2Fwishlist"
          actionLabel="Đăng nhập"
        />
      ) : null}
      {status === 'authenticated' && user?.role !== 'CUSTOMER' ? (
        <EmptyWishlistState
          title="Mục này dành cho khách hàng"
          description="Tài khoản nhân viên không có danh sách sản phẩm ưa thích."
          actionHref="/products"
          actionLabel="Xem sản phẩm"
        />
      ) : null}
      {isCustomer && loadError !== null ? (
        <InlineAlert title="Chưa thể tải sản phẩm ưa thích" tone="danger">
          <div className={styles.alertActionRow}>
            <span>{loadError}</span>
            <Button
              loading={loading}
              loadingLabel="Đang tải lại"
              variant="secondary"
              onClick={() => {
                void load();
              }}
            >
              Tải lại
            </Button>
          </div>
        </InlineAlert>
      ) : null}
      {isCustomer && !loading && loadError === null && items.length === 0 ? (
        <EmptyWishlistState
          title="Chưa có sản phẩm ưa thích"
          description="Lưu lại những sản phẩm bạn quan tâm để dễ dàng xem lại sau."
          actionHref="/products"
          actionLabel="Khám phá sản phẩm"
        />
      ) : null}

      {isCustomer && items.length > 0 ? (
        <section
          className={styles.wishlistSection}
          aria-busy={loading}
          aria-labelledby="wishlist-items-title"
        >
          <div className={styles.sectionHeading}>
            <h2 id="wishlist-items-title" ref={listHeadingRef} tabIndex={-1}>
              {items.length} sản phẩm đã lưu
            </h2>
            <span>
              {loading
                ? 'Đang cập nhật giá và tình trạng'
                : 'Giá và tình trạng được cập nhật theo thông tin mới nhất'}
            </span>
          </div>
          <div className={styles.wishlistGrid}>
            {items.map((item) => (
              <WishlistCard
                item={item}
                action={pending[item.id]}
                message={messages[item.id]}
                key={item.id}
                onAction={runAction}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function WishlistCard({
  item,
  action,
  message,
  onAction,
}: {
  item: WishlistItem;
  action: ItemAction | undefined;
  message: ItemFeedback | undefined;
  onAction: (item: WishlistItem, action: ItemAction) => Promise<void>;
}) {
  const href = item.target.inventoryCode
    ? `/products/${item.target.productSlug}/units/${item.target.inventoryCode}`
    : `/products/${item.target.productSlug}`;
  const available = item.availabilityStatus === 'AVAILABLE';
  return (
    <article className={styles.wishlistCard}>
      <Link className={styles.wishlistMediaLink} href={href}>
        <PublicMediaImage
          className={styles.wishlistMedia}
          fallbackLabel={`Chưa có ảnh cho ${item.target.productName}`}
          media={item.media ?? undefined}
        />
      </Link>
      <div className={styles.wishlistCardBody}>
        <StatusChip
          label={availabilityLabel(item.availabilityStatus)}
          tone={available ? 'success' : 'neutral'}
        />
        <div className={styles.wishlistIdentity}>
          <h3>
            <Link href={href}>{item.target.productName}</Link>
          </h3>
          <p>{item.target.variantName}</p>
          {item.target.inventoryCode ? (
            <p className={styles.inventoryCode}>Mã máy: {item.target.inventoryCode}</p>
          ) : null}
        </div>
        <div className={styles.wishlistPrice}>
          {item.currentUnitPrice === null || item.currentUnitPrice === undefined ? (
            <strong>Chưa có giá hiện tại</strong>
          ) : (
            <Price amount={item.currentUnitPrice} />
          )}
        </div>
        <div className={styles.wishlistActions}>
          <Button
            disabled={!available || action !== undefined}
            iconLeading={<ShoppingCartSimpleIcon aria-hidden="true" size={19} />}
            loading={action === 'add'}
            loadingLabel="Đang thêm vào giỏ hàng"
            onClick={() => void onAction(item, 'add')}
          >
            {available ? 'Thêm vào giỏ' : 'Hiện chưa thể mua'}
          </Button>
          <Button
            aria-label={`Xóa ${item.target.productName} khỏi danh sách ưa thích`}
            disabled={action !== undefined}
            loading={action === 'remove'}
            loadingLabel="Đang xóa sản phẩm"
            onClick={() => void onAction(item, 'remove')}
            size="icon"
            variant="secondary"
          >
            <TrashIcon aria-hidden="true" size={19} />
          </Button>
        </div>
        <p
          className={classNames(
            styles.cardMessage,
            message?.tone === 'error' && styles.cardMessageError,
          )}
          aria-live="polite"
          role={message?.tone === 'error' ? 'alert' : undefined}
        >
          {message?.text}
        </p>
      </div>
    </article>
  );
}

function EmptyWishlistState({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <section className={styles.emptyState}>
      <span className={styles.emptyIcon}>
        <HeartStraightIcon aria-hidden="true" size={34} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      <Link className={styles.primaryLink} href={actionHref}>
        {actionLabel} <ArrowRightIcon aria-hidden="true" size={20} />
      </Link>
    </section>
  );
}

function WishlistLoading() {
  return (
    <div className={styles.wishlistGrid} aria-busy="true" aria-label="Đang tải sản phẩm ưa thích">
      {[0, 1, 2].map((item) => (
        <div className={styles.wishlistCard} key={item}>
          <Skeleton height="15rem" width="100%" />
          <div className={styles.wishlistCardBody}>
            <Skeleton width="6rem" />
            <Skeleton height="1.5rem" width="75%" />
            <Skeleton height="2.25rem" width="55%" />
            <Skeleton height="3rem" width="100%" />
          </div>
        </div>
      ))}
    </div>
  );
}

function availabilityLabel(status: WishlistItem['availabilityStatus']): string {
  return {
    AVAILABLE: 'Còn hàng',
    OUT_OF_STOCK: 'Tạm hết hàng',
    RESERVED_OR_SOLD: 'Máy không còn sẵn',
    INACTIVE: 'Không còn kinh doanh',
  }[status];
}
