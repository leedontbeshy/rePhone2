'use client';

import type { components } from '@rephone/api-client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiError, captureGuestOrderToken } from '../../../lib/order-access';
import { submitPaymentProof } from '../../../lib/payment-api';
import { useAuth } from '../../auth-provider';
import { CatalogHeader, formatMoney } from '../../catalog-ui';

type GeneratedOrder = components['schemas']['OrderDetailDto'];
type GeneratedPayment = components['schemas']['OrderPaymentDto'];
type OrderPayment = GeneratedPayment;
type OrderItem = GeneratedOrder['items'][number];
type PublicOrderWarranty = NonNullable<OrderItem['warranty']>;
type Order = Omit<GeneratedOrder, 'availableActions' | 'paymentAttempts'> & {
  availableActions: Array<'CANCEL' | 'SUBMIT_PAYMENT_PROOF'>;
  paymentAttempts: OrderPayment[];
};

export default function OrderDetailPage() {
  const params = useParams<{ orderNumber: string }>();
  const orderNumber = decodeURIComponent(params.orderNumber);
  const { client, status } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [uploadingPaymentId, setUploadingPaymentId] = useState<string | null>(null);
  const [proofPaymentId, setProofPaymentId] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState('Tôi thay đổi nhu cầu mua hàng');
  const tokenRef = useRef<string | undefined>(undefined);
  const capturedRef = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);

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
    if (error !== null) errorRef.current?.focus();
  }, [error]);

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
    void loadOrder().finally(() => {
      setLoading(false);
    });
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

  const uploadProof = async (paymentId: string) => {
    if (proofFile === null || proofPaymentId !== paymentId) {
      setError('Hãy chọn tệp JPEG, PNG, WebP hoặc PDF.');
      return;
    }
    if (proofFile.size === 0) {
      setError('Tệp minh chứng đang trống.');
      return;
    }
    if (proofFile.size > 10 * 1024 * 1024) {
      setError('Tệp vượt quá giới hạn 10 MiB.');
      return;
    }
    setUploadingPaymentId(paymentId);
    setError(null);
    setNotice(null);
    try {
      await submitPaymentProof(client, paymentId, proofFile, tokenRef.current);
      setProofFile(null);
      setProofPaymentId(null);
      if (proofInputRef.current !== null) proofInputRef.current.value = '';
      await loadOrder();
      setNotice('Đã nộp minh chứng. Thanh toán đang chờ nhân viên kiểm tra.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể nộp minh chứng thanh toán.');
    } finally {
      setUploadingPaymentId(null);
    }
  };

  return (
    <>
      <CatalogHeader />
      <main className="catalog-shell commerce-shell">
        {loading ? <div className="empty-state">Đang tải đơn hàng…</div> : null}
        {error === null ? null : (
          <div ref={errorRef} tabIndex={-1} className="commerce-alert error" role="alert">
            <span>{error}</span>
            <button className="button" type="button" onClick={() => void loadOrder()}>
              Thử lại
            </button>
          </div>
        )}
        {notice === null ? null : (
          <div className="commerce-alert success" role="status" aria-live="polite">
            {notice}
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
                <p>Đặt lúc {formatDateTime(order.placedAt)}</p>
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
                  {order.items.map((item) => {
                    const warranty = itemWarranty(item);
                    return (
                      <article className="order-item" key={item.id}>
                        <div>
                          <strong>{item.productName}</strong>
                          <span>
                            {item.variantName}
                            {item.inventoryCode ? ` · ${item.inventoryCode}` : ''}
                          </span>
                          <small>Bảo hành {item.warrantyDays} ngày</small>
                          {warranty === null ? null : (
                            <div className="order-warranty-summary">
                              <strong>
                                {warranty.warrantyCode} · {warranty.status}
                              </strong>
                              <span>
                                Hiệu lực {formatDateTime(warranty.startAt)} –{' '}
                                {formatDateTime(warranty.endAt)}
                              </span>
                            </div>
                          )}
                        </div>
                        <div>
                          <span>
                            {item.quantity} × {formatMoney(item.unitPrice)} ₫
                          </span>
                          <strong>{formatMoney(item.lineTotal)} ₫</strong>
                        </div>
                      </article>
                    );
                  })}
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
                {order.fulfillmentType === 'PICKUP' ? <PickupTimeline order={order} /> : null}
                {order.paymentAttempts.map((payment) => (
                  <div className="detail-panel" key={payment.id}>
                    <div className="payment-panel-heading">
                      <h2>{paymentTitle(payment)}</h2>
                      <PaymentStatusBadge status={payment.status} />
                    </div>
                    <dl className="stacked-specs">
                      <div>
                        <dt>Số tiền dự kiến</dt>
                        <dd>{formatMoney(payment.expectedAmount)} ₫</dd>
                      </div>
                      <div>
                        <dt>Phương thức</dt>
                        <dd>{paymentMethodLabel(payment.method)}</dd>
                      </div>
                      {payment.method === 'BANK_TRANSFER' ? (
                        <>
                          <div>
                            <dt>Ngân hàng</dt>
                            <dd>
                              {payment.bankTransferInstructions?.bankName ??
                                payment.bankName ??
                                '—'}
                            </dd>
                          </div>
                          <div>
                            <dt>Số tài khoản</dt>
                            <dd>
                              {payment.bankTransferInstructions?.accountNumber ??
                                payment.bankAccountNumber ??
                                '—'}
                            </dd>
                          </div>
                          <div>
                            <dt>Chủ tài khoản</dt>
                            <dd>
                              {payment.bankTransferInstructions?.accountHolder ??
                                payment.bankAccountHolder ??
                                '—'}
                            </dd>
                          </div>
                          <div>
                            <dt>Nội dung</dt>
                            <dd>
                              {payment.bankTransferInstructions?.transferContent ??
                                payment.transferContent ??
                                '—'}
                            </dd>
                          </div>
                        </>
                      ) : null}
                      <div>
                        <dt>Trạng thái</dt>
                        <dd>{payment.status}</dd>
                      </div>
                      {payment.expiresAt === null || payment.expiresAt === undefined ? null : (
                        <div>
                          <dt>Hạn nộp</dt>
                          <dd>{formatDateTime(payment.expiresAt)}</dd>
                        </div>
                      )}
                      {payment.submittedAt === null || payment.submittedAt === undefined ? null : (
                        <div>
                          <dt>Đã nộp</dt>
                          <dd>{formatDateTime(payment.submittedAt)}</dd>
                        </div>
                      )}
                      {payment.reviewSlaDueAt === null ||
                      payment.reviewSlaDueAt === undefined ? null : (
                        <div>
                          <dt>SLA review</dt>
                          <dd>
                            {formatDateTime(payment.reviewSlaDueAt)}
                            {payment.reviewOverdue ? ' · Đã quá SLA' : ''}
                          </dd>
                        </div>
                      )}
                      {payment.receivedAmount === null ||
                      payment.receivedAmount === undefined ? null : (
                        <div>
                          <dt>Đã nhận</dt>
                          <dd>{formatMoney(payment.receivedAmount)} ₫</dd>
                        </div>
                      )}
                    </dl>
                    {payment.method === 'BANK_TRANSFER' &&
                    payment.bankTransferInstructions?.qrUrl ? (
                      <img
                        className="payment-qr"
                        src={payment.bankTransferInstructions.qrUrl}
                        alt="Mã QR chuyển khoản cọc"
                        width={220}
                        height={220}
                      />
                    ) : null}
                    {payment.rejectionReason === null ||
                    payment.rejectionReason === undefined ? null : (
                      <div className="payment-rejection" role="status">
                        <strong>Minh chứng bị từ chối</strong>
                        <span>{payment.rejectionReason}</span>
                      </div>
                    )}
                    {canSubmitProof(order, payment) ? (
                      <form
                        className="payment-proof-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void uploadProof(payment.id);
                        }}
                      >
                        <label htmlFor={`proof-${payment.id}`}>
                          Minh chứng chuyển khoản
                          <input
                            ref={proofInputRef}
                            id={`proof-${payment.id}`}
                            type="file"
                            required
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            onChange={(event) => {
                              setProofFile(event.target.files?.[0] ?? null);
                              setProofPaymentId(payment.id);
                              setError(null);
                            }}
                          />
                        </label>
                        <p>JPEG, PNG, WebP hoặc PDF · tối đa 10 MiB.</p>
                        <button
                          className="button primary"
                          type="submit"
                          disabled={
                            uploadingPaymentId !== null ||
                            proofFile === null ||
                            proofPaymentId !== payment.id
                          }
                        >
                          {uploadingPaymentId === payment.id
                            ? 'Đang nộp minh chứng…'
                            : 'Nộp minh chứng'}
                        </button>
                      </form>
                    ) : null}
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
                    <span>Đã thanh toán</span>
                    <strong>{formatMoney(order.pricing.paidAmount)} ₫</strong>
                  </div>
                  <div>
                    <span>Đã hoàn</span>
                    <strong>{formatMoney(order.pricing.refundedAmount)} ₫</strong>
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
                        onChange={(event) => {
                          setReason(event.target.value);
                        }}
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

function PickupTimeline({ order }: { order: Order }) {
  const events = [
    { label: 'Đặt đơn', at: order.placedAt },
    { label: 'Đã xác nhận', at: order.confirmedAt },
    { label: 'Sẵn sàng nhận', at: order.pickupReadyAt },
    { label: 'Đã nhận hàng', at: order.pickedUpAt },
    { label: 'Hoàn tất', at: order.completedAt },
  ];
  return (
    <section className="detail-panel pickup-customer-panel">
      <h2>Tiến độ nhận tại cửa hàng</h2>
      <p>{pickupStatusMessage(order.fulfillmentStatus)}</p>
      <ol className="fulfillment-timeline">
        {events.map((event) => (
          <li className={event.at ? 'complete' : 'pending'} key={event.label}>
            <span aria-hidden="true" />
            <div>
              <strong>{event.label}</strong>
              <time>{event.at ? formatDateTime(event.at) : 'Chưa thực hiện'}</time>
            </div>
          </li>
        ))}
      </ol>
      {order.pickupHoldUntil ? (
        <p className="pickup-deadline">
          <strong>Giữ hàng đến:</strong> {formatDateTime(order.pickupHoldUntil)}
        </p>
      ) : null}
    </section>
  );
}

function canSubmitProof(order: Order, payment: OrderPayment): boolean {
  if (!order.availableActions.includes('SUBMIT_PAYMENT_PROOF')) return false;
  if (payment.method !== 'BANK_TRANSFER') return false;
  if (payment.status !== 'AWAITING_PROOF') return false;
  if (payment.expiresAt === null || payment.expiresAt === undefined) return false;
  return Date.parse(payment.expiresAt) > Date.now();
}

function itemWarranty(item: OrderItem): PublicOrderWarranty | null {
  return item.warranty ?? null;
}

function pickupStatusMessage(status: string): string {
  if (status === 'PENDING') return 'Cửa hàng sẽ xác nhận và chuẩn bị đơn của bạn.';
  if (status === 'PREPARING') return 'Cửa hàng đang chuẩn bị sản phẩm.';
  if (status === 'READY') return 'Đơn đã sẵn sàng. Hãy mang mã đơn khi đến nhận hàng.';
  if (status === 'COMPLETED') return 'Bạn đã nhận hàng thành công.';
  if (status === 'CANCELLED') return 'Đơn pickup đã được hủy.';
  return `Trạng thái hiện tại: ${status}.`;
}

function paymentTitle(payment: OrderPayment): string {
  if (payment.method === 'CASH') return 'Thanh toán tiền mặt';
  if (payment.method === 'COD') return 'Thanh toán COD';
  if (payment.purpose === 'FULL_PAYMENT') return 'Thanh toán toàn bộ';
  if (payment.purpose === 'BALANCE') return 'Thanh toán số dư';
  return 'Thanh toán cọc';
}

function paymentMethodLabel(method: string): string {
  if (method === 'BANK_TRANSFER') return 'Chuyển khoản ngân hàng';
  if (method === 'CASH') return 'Tiền mặt tại cửa hàng';
  if (method === 'COD') return 'Thu hộ khi giao hàng';
  return method;
}

function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <span className={`payment-status-badge ${status.toLowerCase()}`}>
      {paymentStatusLabel(status)}
    </span>
  );
}

function paymentStatusLabel(status: string): string {
  if (status === 'AWAITING_PROOF') return 'Chờ minh chứng';
  if (status === 'UNDER_REVIEW') return 'Đang review';
  if (status === 'VERIFIED') return 'Đã xác minh';
  if (status === 'REJECTED') return 'Bị từ chối';
  if (status === 'EXPIRED') return 'Đã hết hạn';
  if (status === 'CANCELLED') return 'Đã hủy';
  return status;
}

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? value
    : new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(timestamp);
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
