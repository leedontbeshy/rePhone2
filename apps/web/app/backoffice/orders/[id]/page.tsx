'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  completePickup,
  confirmPickupOrder,
  extendPickupHold,
  fulfillmentError,
  getBackofficeOrder,
  markPickupReady,
  startPreparingOrder,
  updateBackofficeOrderInternalNote,
  type BackofficeOrderDetail,
  type PickupOrderAction,
} from '../../../../lib/fulfillment-api';
import { useAuth } from '../../../auth-provider';
import { CatalogHeader, formatMoney } from '../../../catalog-ui';

type BusyAction = PickupOrderAction | 'INTERNAL_NOTE' | 'RELOAD' | null;

export default function BackofficeOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = decodeURIComponent(params.id);
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [detail, setDetail] = useState<BackofficeOrderDetail | null>(null);
  const [internalNote, setInternalNote] = useState('');
  const [holdUntil, setHoldUntil] = useState('');
  const [holdReason, setHoldReason] = useState('Khách hàng cần thêm thời gian nhận máy');
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const loadOrder = useCallback(async () => {
    const next = await getBackofficeOrder(client, orderId);
    setDetail(next);
    setInternalNote(next.internalNote ?? '');
    setError(null);
  }, [client, orderId]);

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (status !== 'authenticated' || !isStaff) return;
    let active = true;
    setLoading(true);
    void getBackofficeOrder(client, orderId)
      .then((next) => {
        if (!active) return;
        setDetail(next);
        setInternalNote(next.internalNote ?? '');
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(errorMessage(caught, 'Không thể tải chi tiết đơn hàng.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, isStaff, orderId, status]);

  const runAction = async (
    action: Exclude<BusyAction, 'INTERNAL_NOTE' | 'RELOAD' | null>,
    operation: () => Promise<BackofficeOrderDetail>,
    success: string,
  ) => {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const next = await operation();
      setDetail(next);
      setInternalNote(next.internalNote ?? '');
      setNotice(success);
    } catch (caught) {
      const message = errorMessage(caught, 'Không thể cập nhật đơn hàng.');
      try {
        const current = await getBackofficeOrder(client, orderId);
        setDetail(current);
        setInternalNote(current.internalNote ?? '');
      } catch {
        // Keep the command error authoritative when the follow-up projection cannot be loaded.
      }
      setError(message);
    } finally {
      setBusy(null);
    }
  };

  const reload = async () => {
    setBusy('RELOAD');
    setError(null);
    try {
      await loadOrder();
    } catch (caught) {
      setError(errorMessage(caught, 'Không thể tải lại đơn hàng.'));
    } finally {
      setBusy(null);
    }
  };

  const saveInternalNote = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy('INTERNAL_NOTE');
    setError(null);
    setNotice(null);
    try {
      const normalized = internalNote.trim();
      const next = await updateBackofficeOrderInternalNote(
        client,
        orderId,
        normalized === '' ? null : normalized,
      );
      setDetail(next);
      setInternalNote(next.internalNote ?? '');
      setNotice(normalized === '' ? 'Đã xóa ghi chú nội bộ.' : 'Đã lưu ghi chú nội bộ.');
    } catch (caught) {
      setError(errorMessage(caught, 'Không thể lưu ghi chú nội bộ.'));
    } finally {
      setBusy(null);
    }
  };

  const submitExtension = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = Date.parse(holdUntil);
    if (Number.isNaN(parsed)) {
      setError('Hãy chọn deadline mới hợp lệ.');
      return;
    }
    if (detail?.pickupHoldUntil !== null && detail?.pickupHoldUntil !== undefined) {
      const currentDeadline = Date.parse(detail.pickupHoldUntil);
      if (!Number.isNaN(currentDeadline) && parsed <= currentDeadline) {
        setError('Deadline mới phải muộn hơn hạn giữ hàng hiện tại.');
        return;
      }
    }
    if (parsed > Date.now() + 7 * 24 * 60 * 60 * 1000) {
      setError('Deadline mới không được vượt quá 7 ngày kể từ hiện tại.');
      return;
    }
    const reason = holdReason.trim();
    if (reason.length < 5 || reason.length > 500) {
      setError('Lý do gia hạn phải có từ 5 đến 500 ký tự.');
      return;
    }
    void runAction(
      'EXTEND_PICKUP_HOLD',
      () =>
        extendPickupHold(client, orderId, { holdUntil: new Date(parsed).toISOString(), reason }),
      'Đã gia hạn deadline pickup.',
    );
  };

  const submitCompletion = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (detail === null) return;
    const cashRequired = positiveMoney(detail.pricing.balanceDue);
    if (cashRequired && !cashConfirmed) {
      setError('Hãy xác nhận đã thu đủ tiền mặt trước khi hoàn tất pickup.');
      return;
    }
    void runAction(
      'COMPLETE_PICKUP',
      () => completePickup(client, orderId, { confirmCashCollected: cashRequired }),
      'Đã hoàn tất pickup, consume tồn và phát hành bảo hành.',
    );
  };

  return (
    <>
      <CatalogHeader />
      <main className="backoffice-shell fulfillment-shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/backoffice/orders">Đơn pickup</Link>
          <span>/</span>
          <span>{detail?.orderNumber ?? 'Chi tiết'}</span>
        </nav>

        {status === 'loading' ? <div className="status">Đang kiểm tra phiên đăng nhập…</div> : null}
        {status === 'anonymous' ? (
          <section className="empty-state">
            <h1>Cần đăng nhập nhân viên</h1>
            <Link className="button primary" href="/login">
              Đăng nhập
            </Link>
          </section>
        ) : null}
        {status === 'authenticated' && !isStaff ? (
          <div className="commerce-alert error" role="alert">
            Bạn không có quyền vận hành đơn hàng.
          </div>
        ) : null}
        {status === 'authenticated' && isStaff && loading ? (
          <div className="empty-state">Đang tải chi tiết đơn hàng…</div>
        ) : null}
        {error === null ? null : (
          <div ref={errorRef} tabIndex={-1} className="commerce-alert error" role="alert">
            <span>{error}</span>
            <button
              className="button"
              type="button"
              disabled={busy !== null}
              onClick={() => {
                void reload();
              }}
            >
              Tải lại
            </button>
          </div>
        )}
        {notice === null ? null : (
          <div className="commerce-alert success" role="status" aria-live="polite">
            {notice}
          </div>
        )}
        {status === 'authenticated' && isStaff && !loading && detail === null ? (
          <section className="empty-state">
            <h1>Không tìm thấy đơn hàng</h1>
            <Link className="button" href="/backoffice/orders">
              Về hàng chờ pickup
            </Link>
          </section>
        ) : null}

        {detail === null ? null : (
          <>
            <header className="backoffice-page-heading fulfillment-detail-heading">
              <div>
                <p className="eyebrow">Pickup order</p>
                <h1>{detail.orderNumber}</h1>
                <p>Đặt lúc {dateTime(detail.placedAt)}</p>
              </div>
              <div className="fulfillment-order-statuses" aria-label="Trạng thái đơn">
                <span>{detail.status}</span>
                <span>{detail.fulfillmentStatus}</span>
                <span>{detail.paymentStatus}</span>
              </div>
            </header>

            <div className="fulfillment-detail-layout">
              <section className="fulfillment-detail-main">
                <section className="detail-panel">
                  <h2>Khách hàng & điểm nhận</h2>
                  <dl className="payment-review-specs">
                    <Spec label="Khách hàng" value={detail.contact.fullName} />
                    <Spec label="Điện thoại" value={detail.contact.phone} />
                    <Spec label="Email" value={detail.contact.email} />
                    <Spec
                      label="Cửa hàng"
                      value={
                        detail.pickupStore === null
                          ? '—'
                          : `${detail.pickupStore.code} · ${detail.pickupStore.name}`
                      }
                    />
                  </dl>
                </section>

                <section className="detail-panel">
                  <h2>Sản phẩm</h2>
                  <div className="fulfillment-item-list">
                    {detail.items.map((item) => (
                      <article className="payment-order-item" key={item.id}>
                        <div>
                          <strong>{item.productName}</strong>
                          <span>
                            {item.variantName} · {item.sku}
                          </span>
                          {item.inventoryCode === null ? null : (
                            <small>Mã tồn kho: {item.inventoryCode}</small>
                          )}
                          <small>Bảo hành snapshot: {item.warrantyDays} ngày</small>
                          {item.warranty === null ? null : (
                            <small>
                              {item.warranty.warrantyCode} · {dateTime(item.warranty.startAt)} →{' '}
                              {dateTime(item.warranty.endAt)}
                            </small>
                          )}
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
                </section>

                <section className="detail-panel">
                  <h2>Pickup timeline</h2>
                  <ol className="fulfillment-timeline">
                    <Timeline label="Đặt đơn" at={detail.placedAt} />
                    <Timeline label="Đã xác nhận" at={detail.confirmedAt} />
                    <Timeline label="Sẵn sàng nhận" at={detail.pickupReadyAt} />
                    <Timeline label="Đã nhận hàng" at={detail.pickedUpAt} />
                    <Timeline label="Hoàn tất" at={detail.completedAt} />
                    <Timeline label="Đã hủy" at={detail.cancelledAt} />
                  </ol>
                  <p className="pickup-deadline">
                    <strong>Hạn giữ hàng:</strong>{' '}
                    {detail.pickupHoldUntil === null ? '—' : dateTime(detail.pickupHoldUntil)}
                  </p>
                </section>

                <section className="detail-panel">
                  <h2>Reservation</h2>
                  {detail.reservations.length === 0 ? (
                    <p>Không có reservation.</p>
                  ) : (
                    <div className="fulfillment-record-list">
                      {detail.reservations.map((reservation) => (
                        <dl key={reservation.id}>
                          <Spec label="Trạng thái" value={reservation.status} />
                          <Spec label="Mục đích" value={reservation.holdReason} />
                          <Spec label="Đối tượng" value={reservation.targetType} />
                          <Spec label="Số lượng" value={String(reservation.quantity)} />
                          <Spec
                            label="Hết hạn"
                            value={
                              reservation.expiresAt === null ? '—' : dateTime(reservation.expiresAt)
                            }
                          />
                        </dl>
                      ))}
                    </div>
                  )}
                </section>

                <section className="detail-panel">
                  <h2>Thanh toán & hoàn tiền</h2>
                  {detail.paymentAttempts.length === 0 ? <p>Chưa có payment attempt.</p> : null}
                  {detail.paymentAttempts.map((payment) => (
                    <dl className="payment-review-specs fulfillment-payment" key={payment.id}>
                      <Spec label="Mục đích" value={payment.purpose} />
                      <Spec label="Phương thức" value={payment.method} />
                      <Spec label="Trạng thái" value={payment.status} />
                      <Spec label="Dự kiến" value={`${formatMoney(payment.expectedAmount)} ₫`} />
                      <Spec
                        label="Đã nhận"
                        value={
                          payment.receivedAmount === null
                            ? '—'
                            : `${formatMoney(payment.receivedAmount)} ₫`
                        }
                      />
                      <Spec
                        label="Đã review"
                        value={payment.reviewedAt === null ? '—' : dateTime(payment.reviewedAt)}
                      />
                    </dl>
                  ))}
                  {detail.refunds.map((refund) => (
                    <p key={refund.id}>
                      Refund {formatMoney(refund.amount)} ₫ · {refund.status}
                      {refund.reason === '' ? '' : ` · ${refund.reason}`}
                    </p>
                  ))}
                </section>

                {detail.shipments.length === 0 ? null : (
                  <section className="detail-panel">
                    <h2>Vận chuyển</h2>
                    <div className="fulfillment-record-list">
                      {detail.shipments.map((shipment) => (
                        <dl key={shipment.id}>
                          <Spec label="Lần giao" value={String(shipment.attemptNumber)} />
                          <Spec label="Đơn vị" value={shipment.carrierName} />
                          <Spec label="Mã vận đơn" value={shipment.trackingCode} />
                          <Spec label="Trạng thái" value={shipment.status} />
                          <Spec
                            label="Bàn giao"
                            value={shipment.shippedAt === null ? '—' : dateTime(shipment.shippedAt)}
                          />
                          <Spec
                            label="Giao xong"
                            value={
                              shipment.deliveredAt === null ? '—' : dateTime(shipment.deliveredAt)
                            }
                          />
                          {shipment.failureReason === null ? null : (
                            <Spec label="Lý do lỗi" value={shipment.failureReason} />
                          )}
                        </dl>
                      ))}
                    </div>
                  </section>
                )}

                <section className="detail-panel">
                  <h2>Ghi chú</h2>
                  <p>
                    <strong>Khách hàng:</strong> {detail.customerNote ?? 'Không có'}
                  </p>
                  <form
                    className="fulfillment-note-form"
                    onSubmit={(event) => {
                      void saveInternalNote(event);
                    }}
                  >
                    <label htmlFor="internal-note">
                      Ghi chú nội bộ
                      <textarea
                        id="internal-note"
                        value={internalNote}
                        maxLength={2000}
                        rows={5}
                        onChange={(event) => {
                          setInternalNote(event.target.value);
                        }}
                      />
                    </label>
                    <button className="button" type="submit" disabled={busy !== null}>
                      {busy === 'INTERNAL_NOTE' ? 'Đang lưu…' : 'Lưu ghi chú'}
                    </button>
                  </form>
                </section>
              </section>

              <aside className="fulfillment-command-panel">
                <section className="detail-panel">
                  <h2>Tài chính</h2>
                  <div className="pricing-lines">
                    <MoneyLine label="Tạm tính" value={detail.pricing.subtotal} />
                    <MoneyLine
                      label="Voucher"
                      value={detail.pricing.voucherDiscountAmount}
                      negative
                    />
                    <MoneyLine label="Phí giao" value={detail.pricing.shippingFee} />
                    <MoneyLine label="Tổng" value={detail.pricing.grandTotal} total />
                    <MoneyLine label="Đã thu" value={detail.pricing.paidAmount} />
                    <MoneyLine label="Đã hoàn" value={detail.pricing.refundedAmount} />
                    <MoneyLine label="Còn thu" value={detail.pricing.balanceDue} total />
                  </div>
                </section>

                <section className="detail-panel fulfillment-command-card">
                  <h2>Thao tác pickup</h2>
                  <p>Mỗi lệnh sẽ kiểm tra lại trạng thái và deadline trong transaction.</p>
                  <div className="fulfillment-command-buttons">
                    {hasAction(detail, 'CONFIRM') ? (
                      <button
                        className="button primary"
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          void runAction(
                            'CONFIRM',
                            () => confirmPickupOrder(client, orderId),
                            'Đã xác nhận đơn pickup.',
                          )
                        }
                      >
                        {busy === 'CONFIRM' ? 'Đang xác nhận…' : 'Xác nhận đơn'}
                      </button>
                    ) : null}
                    {hasAction(detail, 'START_PREPARING') ? (
                      <button
                        className="button primary"
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          void runAction(
                            'START_PREPARING',
                            () => startPreparingOrder(client, orderId),
                            'Đã bắt đầu chuẩn bị hàng.',
                          )
                        }
                      >
                        {busy === 'START_PREPARING' ? 'Đang cập nhật…' : 'Bắt đầu chuẩn bị'}
                      </button>
                    ) : null}
                    {hasAction(detail, 'MARK_PICKUP_READY') ? (
                      <button
                        className="button primary"
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          void runAction(
                            'MARK_PICKUP_READY',
                            () => markPickupReady(client, orderId),
                            'Đã đánh dấu đơn sẵn sàng nhận.',
                          )
                        }
                      >
                        {busy === 'MARK_PICKUP_READY' ? 'Đang cập nhật…' : 'Sẵn sàng nhận'}
                      </button>
                    ) : null}
                  </div>

                  {hasAction(detail, 'EXTEND_PICKUP_HOLD') ? (
                    <form className="fulfillment-command-form" onSubmit={submitExtension}>
                      <h3>Gia hạn giữ hàng</h3>
                      <label htmlFor="pickup-hold-until">
                        Deadline mới
                        <input
                          id="pickup-hold-until"
                          type="datetime-local"
                          required
                          value={holdUntil}
                          onChange={(event) => {
                            setHoldUntil(event.target.value);
                          }}
                        />
                      </label>
                      <label htmlFor="pickup-hold-reason">
                        Lý do
                        <textarea
                          id="pickup-hold-reason"
                          required
                          minLength={5}
                          maxLength={500}
                          rows={3}
                          value={holdReason}
                          onChange={(event) => {
                            setHoldReason(event.target.value);
                          }}
                        />
                      </label>
                      <button className="button" type="submit" disabled={busy !== null}>
                        {busy === 'EXTEND_PICKUP_HOLD' ? 'Đang gia hạn…' : 'Gia hạn pickup'}
                      </button>
                    </form>
                  ) : null}

                  {hasAction(detail, 'COMPLETE_PICKUP') ? (
                    <form className="fulfillment-command-form" onSubmit={submitCompletion}>
                      <h3>Hoàn tất tại cửa hàng</h3>
                      {positiveMoney(detail.pricing.balanceDue) ? (
                        <label className="cash-confirmation">
                          <input
                            type="checkbox"
                            checked={cashConfirmed}
                            onChange={(event) => {
                              setCashConfirmed(event.target.checked);
                            }}
                          />
                          <span>
                            Đã thu đủ <strong>{formatMoney(detail.pricing.balanceDue)} ₫</strong>{' '}
                            tiền mặt
                          </span>
                        </label>
                      ) : (
                        <p>Đơn không còn số dư cần thu.</p>
                      )}
                      <button
                        className="button primary"
                        type="submit"
                        disabled={
                          busy !== null ||
                          (positiveMoney(detail.pricing.balanceDue) && !cashConfirmed)
                        }
                      >
                        {busy === 'COMPLETE_PICKUP' ? 'Đang hoàn tất…' : 'Hoàn tất pickup'}
                      </button>
                    </form>
                  ) : null}

                  {detail.availableActions.length === 0 ? (
                    <p className="muted">Đơn không còn thao tác pickup khả dụng.</p>
                  ) : null}
                </section>
              </aside>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  );
}

function Timeline({ label, at }: { label: string; at: string | null }) {
  return (
    <li className={at === null ? 'pending' : 'complete'}>
      <span aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <time>{at === null ? 'Chưa thực hiện' : dateTime(at)}</time>
      </div>
    </li>
  );
}

function MoneyLine({
  label,
  value,
  negative = false,
  total = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
  total?: boolean;
}) {
  return (
    <div className={total ? 'pricing-total' : undefined}>
      <span>{label}</span>
      <strong>
        {negative ? '−' : ''}
        {formatMoney(value)} ₫
      </strong>
    </div>
  );
}

function hasAction(detail: BackofficeOrderDetail, action: PickupOrderAction): boolean {
  return detail.availableActions.includes(action);
}

function positiveMoney(value: string): boolean {
  try {
    return BigInt(value) > BigInt(0);
  } catch {
    return false;
  }
}

function dateTime(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? value
    : new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(timestamp);
}

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fulfillmentError(value, fallback);
}
