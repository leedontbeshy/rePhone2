'use client';

import type { components } from '@rephone/api-client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiError } from '../../lib/order-access';
import { useAuth } from '../auth-provider';
import { CatalogHeader, formatMoney } from '../catalog-ui';

type OrderListItem = components['schemas']['OrderListItemDto'];

export default function OrdersPage() {
  const { client, status, user } = useAuth();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    if (status !== 'authenticated' || user?.role !== 'CUSTOMER') {
      setLoading(false);
      return;
    }
    setLoading(true);
    void client
      .GET('/api/v1/orders', { params: { query: { page: 1, pageSize: 50 } } })
      .then((result) => {
        if (result.data === undefined) {
          setError(apiError(result.error, 'Không thể tải danh sách đơn hàng.'));
          return;
        }
        setOrders(result.data.data);
        setError(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [client, status, user?.role]);

  return (
    <>
      <CatalogHeader />
      <main className="catalog-shell commerce-shell">
        <div className="commerce-heading">
          <p className="eyebrow">Lịch sử mua hàng</p>
          <h1>Đơn hàng của tôi</h1>
          <p>Mọi giá, địa chỉ, bảo hành và hướng dẫn thanh toán đều dùng snapshot lúc đặt.</p>
        </div>
        {status === 'anonymous' ? (
          <section className="empty-state">
            <h2>Đăng nhập để xem danh sách đơn</h2>
            <p>Đơn guest được mở trực tiếp bằng liên kết access token đã cấp.</p>
            <Link className="button primary" href="/login">
              Đăng nhập
            </Link>
          </section>
        ) : null}
        {status === 'authenticated' && user?.role !== 'CUSTOMER' ? (
          <div className="commerce-alert error" role="alert">
            Tài khoản nhân viên không dùng cổng đơn hàng khách.
          </div>
        ) : null}
        {loading ? <div className="empty-state">Đang tải đơn hàng…</div> : null}
        {error === null ? null : (
          <div className="commerce-alert error" role="alert">
            {error}
          </div>
        )}
        {!loading &&
        status === 'authenticated' &&
        user?.role === 'CUSTOMER' &&
        orders.length === 0 ? (
          <section className="empty-state">
            <h2>Chưa có đơn hàng</h2>
            <Link className="button primary" href="/products">
              Xem sản phẩm
            </Link>
          </section>
        ) : null}
        <section className="order-list" aria-label="Danh sách đơn hàng">
          {orders.map((order) => (
            <Link
              className="order-list-card"
              href={`/orders/${order.orderNumber}`}
              key={order.orderNumber}
            >
              <div>
                <span>{order.orderNumber}</span>
                <strong>{order.firstItemName}</strong>
                <small>
                  {order.totalItemQuantity} sản phẩm ·{' '}
                  {order.fulfillmentType === 'PICKUP' ? 'Nhận tại cửa hàng' : 'Giao hàng'}
                </small>
              </div>
              <div>
                <strong>{formatMoney(order.grandTotal)} ₫</strong>
                <span>
                  {order.status} · {order.paymentStatus}
                </span>
                <time>{new Date(order.placedAt).toLocaleString('vi-VN')}</time>
              </div>
            </Link>
          ))}
        </section>
      </main>
    </>
  );
}
