'use client';

import type { components } from '@rephone/api-client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiError, captureGuestOrderToken } from '../../../lib/order-access';
import { useAuth } from '../../auth-provider';
import { CatalogHeader, formatMoney } from '../../catalog-ui';

type Order = components['schemas']['OrderDetailDto'];

export default function OrderDetailPage() {
  const params = useParams<{ orderNumber: string }>();
  const orderNumber = decodeURIComponent(params.orderNumber);
  const { client, status } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('Tôi thay đổi nhu cầu mua hàng');
  const tokenRef = useRef<string | undefined>(undefined);
  const capturedRef = useRef(false);

  const loadOrder = useCallback(async () => {
    const token = tokenRef.current;
    const result = await client.GET('/api/v1/orders/{orderNumber}', {
      params: {
        path: { orderNumber },
        header: token === undefined ? {} : { 'X-Guest-Order-Token': token },
      },
    });
    if (result.data === undefined) {
      setError(apiError(result.error, 'Không thể mở đơn hàng này.'));
      return;
    }
    setOrder(result.data.data);
    setError(null);
  }, [client, orderNumber]);

  useEffect(() => {
    if (!capturedRef.current) {
      capturedRef.current = true;
      try {
        tokenRef.current = captureGuestOrderToken(
          orderNumber,
          window.location.hash,
          sessionStorage,
        );
      } finally {
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${window.location.search}`,
        );
      }
    }
    if (status === 'loading') return;
    setLoading(true);
    void loadOrder().finally(() => setLoading(false));
  }, [loadOrder, orderNumber, status]);

  const cancel = async () => {
    if (order === null) return;
    setPending(true);
    setError(null);
    const token = tokenRef.current;
    try {
      const result = await client.POST('/api/v1/orders/{orderNumber}/cancel', {
        params: {
          path: { orderNumber },
          header: {
            'X-Rephone-CSRF': '1',
            ...(token === undefined ? {} : { 'X-Guest-Order-Token': token }),
          },
        },
        body: { reason },
      });
      if (result.data === undefined) {
        throw new Error(apiError(result.error, 'Không thể hủy đơn hàng.'));
      }
      setOrder(result.data.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể hủy đơn hàng.');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <CatalogHeader />
      <main className="catalog-shell commerce-shell">
        {loading ? <div className="empty-state">Đang tải đơn hàng…</div> : null}
        {error === null ? null : (
          <div className="commerce-alert error" role="alert">
            <span>{error}</span>
            <button className="button" type="button" onClick={() => void loadOrder()}>
              Thử lại
            </button>
          </div>
        )}
        {!loading && order === null ? (
          <section className="empty-state">
            <h1>Không mở được đơn hàng</h1>
            <p>Hãy dùng đúng liên kết guest hoặc đăng nhập tài khoản đã đặt đơn.</p>
            <Link className="button" href="/">
              Về trang chủ
            </Link>
          </section>
        ) : null}
        {order === null ? null : (
          <>
            <header className="order-heading">
              <div>
                <p className="eyebrow">Đơn hàng</p>
                <h1>{order.orderNumber}</h1>
                <p>Đặt lúc {new Date(order.placedAt).toLocaleString('vi-VN')}</p>
              </div>
              <div className="order-status">
                <strong>{order.status}</strong>
                <span>
                  {order.fulfillmentStatus} · {order.paymentStatus}
                </span>
              </div>
            </header>
            <div className="order-detail-layout">
              <section className="order-main">
                <div className="detail-panel">
                  <h2>Sản phẩm</h2>
                  {order.items.map((item) => (
                    <article className="order-item" key={item.id}>
                      <div>
                        <strong>{item.productName}</strong>
                        <span>
                          {item.variantName}
                          {item.inventoryCode ? ` · ${item.inventoryCode}` : ''}
                        </span>
                        <small>Bảo hành {item.warrantyDays} ngày</small>
                      </div>
                      <div>
                        <span>
                          {item.quantity} × {formatMoney(item.unitPrice)} ₫
                        </span>
                        <strong>{formatMoney(item.lineTotal)} ₫</strong>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="detail-panel">
                  <h2>Liên hệ & nhận hàng</h2>
                  <p>
                    {order.contact.fullName} · {order.contact.phone}
                    <br />
                    {order.contact.email}
                  </p>
                  {order.pickupStore ? (
                    <p>Nhận tại: {order.pickupStore.name}</p>
                  ) : (
                    <pre className="address-snapshot">{formatAddress(order.shippingAddress)}</pre>
                  )}
                </div>
                {order.paymentAttempts.map((payment) => (
                  <div className="detail-panel" key={payment.id}>
                    <h2>Hướng dẫn cọc</h2>
                    <dl className="stacked-specs">
                      <div>
                        <dt>Số tiền</dt>
                        <dd>{formatMoney(payment.expectedAmount)} ₫</dd>
                      </div>
                      <div>
                        <dt>Ngân hàng</dt>
                        <dd>{payment.bankName}</dd>
                      </div>
                      <div>
                        <dt>Số tài khoản</dt>
                        <dd>{payment.bankAccountNumber}</dd>
                      </div>
                      <div>
                        <dt>Chủ tài khoản</dt>
                        <dd>{payment.bankAccountHolder}</dd>
                      </div>
                      <div>
                        <dt>Nội dung</dt>
                        <dd>{payment.transferContent}</dd>
                      </div>
                      <div>
                        <dt>Trạng thái</dt>
                        <dd>{payment.status}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
                {order.refunds.length === 0 ? null : (
                  <div className="detail-panel">
                    <h2>Hoàn tiền</h2>
                    {order.refunds.map((refund) => (
                      <p key={refund.id}>
                        {formatMoney(refund.amount)} ₫ · {refund.status}
                      </p>
                    ))}
                  </div>
                )}
              </section>
              <aside className="cart-summary">
                <div className="pricing-lines">
                  <div>
                    <span>Tạm tính</span>
                    <strong>{formatMoney(order.pricing.subtotal)} ₫</strong>
                  </div>
                  <div>
                    <span>Voucher</span>
                    <strong>−{formatMoney(order.pricing.voucherDiscountAmount)} ₫</strong>
                  </div>
                  <div>
                    <span>Phí giao</span>
                    <strong>{formatMoney(order.pricing.shippingFee)} ₫</strong>
                  </div>
                  <div className="pricing-total">
                    <span>Tổng</span>
                    <strong>{formatMoney(order.pricing.grandTotal)} ₫</strong>
                  </div>
                  <div>
                    <span>Còn phải trả</span>
                    <strong>{formatMoney(order.pricing.balanceDue)} ₫</strong>
                  </div>
                </div>
                {order.cancelReason ? <p>Lý do hủy: {order.cancelReason}</p> : null}
                {order.availableActions.includes('CANCEL') ? (
                  <div className="cancel-box">
                    <label>
                      Lý do hủy
                      <input
                        minLength={5}
                        maxLength={500}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </label>
                    <button
                      className="button"
                      type="button"
                      disabled={pending || reason.trim().length < 5}
                      onClick={() => void cancel()}
                    >
                      {pending ? 'Đang hủy…' : 'Hủy đơn'}
                    </button>
                  </div>
                ) : null}
              </aside>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function formatAddress(value: unknown): string {
  if (typeof value !== 'object' || value === null) return 'Không có địa chỉ giao hàng.';
  const address = value as Record<string, unknown>;
  return [
    address['receiverName'],
    address['phone'],
    address['addressLine'],
    address['ward'],
    address['district'],
    address['province'],
    address['postalCode'],
  ]
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join(', ');
}
