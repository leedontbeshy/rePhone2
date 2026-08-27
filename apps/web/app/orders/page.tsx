'use client';

import type { components } from '@rephone/api-client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { customerApiError as apiError } from '../../lib/order-access';
import { useAuth } from '../auth-provider';
import { CatalogHeader, formatMoney } from '../catalog-ui';

type GeneratedOrderListItem = components['schemas']['OrderListItemDto'];
type OrderListItem = Omit<GeneratedOrderListItem, 'shipment'> & {
  shipment?: {
    carrierName: string;
    trackingCode: string;
    trackingUrl?: string | null;
    status: string;
  } | null;
};

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
          <p>
            Mọi giá, địa chỉ, bảo hành và hướng dẫn thanh toán được giữ theo thời điểm đặt hàng.
          </p>
        </div>
        {status === 'anonymous' ? (
          <section className="empty-state">
            <h2>Đăng nhập để xem danh sách đơn</h2>
            <p>Đơn đặt không cần tài khoản được mở trực tiếp bằng liên kết bạn đã nhận.</p>
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
                {order.fulfillmentType === 'SHIPPING' && order.shipment ? (
                  <small>
                    {order.shipment.carrierName} · {order.shipment.trackingCode} ·{' '}
                    {shipmentStatusLabel(order.shipment.status)}
                  </small>
                ) : null}
              </div>
              <div>
                <strong>{formatMoney(order.grandTotal)} ₫</strong>
                <span>
                  {orderStatusLabel(order.status)} · {paymentSummaryLabel(order.paymentStatus)}
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

function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PLACED: 'Đã đặt',
    CONFIRMED: 'Đã xác nhận',
    PROCESSING: 'Đang xử lý',
    COMPLETED: 'Đã hoàn tất',
    CANCELLED: 'Đã hủy',
  };
  return labels[status] ?? 'Đang cập nhật';
}

function paymentSummaryLabel(status: string): string {
  const labels: Record<string, string> = {
    UNPAID: 'Chưa thanh toán',
    PARTIALLY_PAID: 'Đã thanh toán một phần',
    PAID: 'Đã thanh toán',
    PARTIALLY_REFUNDED: 'Đã hoàn một phần',
    REFUNDED: 'Đã hoàn tiền',
  };
  return labels[status] ?? 'Đang cập nhật thanh toán';
}

function shipmentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    CREATED: 'Đã tạo vận đơn',
    HANDED_TO_CARRIER: 'Đã bàn giao vận chuyển',
    DELIVERED: 'Đã giao hàng',
    FAILED: 'Giao không thành công',
    RETURNED: 'Đã hoàn về',
    CANCELLED: 'Đã hủy vận chuyển',
  };
  return labels[status] ?? 'Đang cập nhật vận chuyển';
}
