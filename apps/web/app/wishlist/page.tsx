'use client';

import type { components } from '@rephone/api-client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth-provider';
import { CatalogHeader, MediaImage, formatMoney } from '../catalog-ui';

type WishlistItem = components['schemas']['WishlistItemDto'];

export default function WishlistPage() {
  const { client, status, user } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (status !== 'authenticated' || user?.role !== 'CUSTOMER') {
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await client.GET('/api/v1/wishlist');
    if (result.data === undefined) {
      setError('Không thể tải wishlist. Vui lòng thử lại.');
      setLoading(false);
      return;
    }
    setItems(result.data.data);
    setError(null);
    setLoading(false);
  }, [client, status, user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (itemId: string) => {
    setRemovingId(itemId);
    setError(null);
    const result = await client.DELETE('/api/v1/wishlist/items/{itemId}', {
      params: { path: { itemId } },
    });
    if (result.response.status !== 204) {
      setError('Không thể xóa sản phẩm khỏi wishlist.');
      setRemovingId(null);
      return;
    }
    setItems((current) => current.filter((item) => item.id !== itemId));
    setRemovingId(null);
  };

  return (
    <>
      <CatalogHeader />
      <main className="catalog-shell commerce-shell">
        <div className="commerce-heading">
          <p className="eyebrow">Danh sách đã lưu</p>
          <h1>Wishlist</h1>
          <p>Sản phẩm hết hàng hoặc ngừng bán vẫn được giữ lại để bạn nhận biết trạng thái.</p>
        </div>
        {status === 'loading' || loading ? (
          <div className="empty-state">Đang tải wishlist…</div>
        ) : null}
        {status === 'anonymous' ? (
          <section className="empty-state">
            <h2>Đăng nhập để xem wishlist</h2>
            <Link className="button primary" href="/login">
              Đăng nhập
            </Link>
          </section>
        ) : null}
        {status === 'authenticated' && user?.role !== 'CUSTOMER' ? (
          <section className="empty-state">
            <h2>Wishlist chỉ dành cho khách hàng</h2>
            <Link className="button" href="/products">
              Về catalog
            </Link>
          </section>
        ) : null}
        {error === null ? null : (
          <div className="commerce-alert error" role="alert">
            <span>{error}</span>
            <button className="button" type="button" onClick={() => void load()}>
              Tải lại
            </button>
          </div>
        )}
        {!loading &&
        status === 'authenticated' &&
        user?.role === 'CUSTOMER' &&
        items.length === 0 ? (
          <section className="empty-state">
            <h2>Chưa có sản phẩm đã lưu</h2>
            <Link className="button primary" href="/products">
              Khám phá sản phẩm
            </Link>
          </section>
        ) : null}
        {status === 'authenticated' && user?.role === 'CUSTOMER' && items.length > 0 ? (
          <section className="wishlist-grid" aria-label="Sản phẩm đã lưu">
            {items.map((item) => {
              const href = item.target.inventoryCode
                ? `/products/${item.target.productSlug}/units/${item.target.inventoryCode}`
                : `/products/${item.target.productSlug}`;
              return (
                <article className="wishlist-card" key={item.id}>
                  <Link href={href}>
                    <MediaImage media={item.media ?? undefined} className="wishlist-image" />
                  </Link>
                  <div>
                    <span className={`availability ${availabilityClass(item.availabilityStatus)}`}>
                      {availabilityLabel(item.availabilityStatus)}
                    </span>
                    <h2>
                      <Link href={href}>{item.target.productName}</Link>
                    </h2>
                    <p>{item.target.variantName}</p>
                    {item.target.inventoryCode ? <p>{item.target.inventoryCode}</p> : null}
                    <strong>
                      {item.currentUnitPrice === null || item.currentUnitPrice === undefined
                        ? 'Không còn giá hiện hành'
                        : `${formatMoney(item.currentUnitPrice)} ₫`}
                    </strong>
                    <button
                      className="button"
                      type="button"
                      disabled={removingId === item.id}
                      onClick={() => void remove(item.id)}
                    >
                      {removingId === item.id ? 'Đang xóa…' : 'Xóa khỏi wishlist'}
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}
      </main>
    </>
  );
}

function availabilityClass(status: WishlistItem['availabilityStatus']): string {
  return status === 'AVAILABLE' ? 'available' : 'unavailable';
}

function availabilityLabel(status: WishlistItem['availabilityStatus']): string {
  return {
    AVAILABLE: 'Còn hàng',
    OUT_OF_STOCK: 'Tạm hết hàng',
    RESERVED_OR_SOLD: 'Đã giữ hoặc đã bán',
    INACTIVE: 'Ngừng bán',
  }[status];
}
