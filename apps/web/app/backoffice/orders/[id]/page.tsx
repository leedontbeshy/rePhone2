'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  completePickup,
  confirmPickupOrder,
  createShipment,
  extendPickupHold,
  fulfillmentError,
  getBackofficeOrder,
  handOverShipment,
  listActiveReturnLocations,
  markPickupReady,
  markShipmentDelivered,
  markShipmentFailed,
  markShipmentReturned,
  overrideShippingFee,
  startPreparingOrder,
  updateBackofficeOrderInternalNote,
  type BackofficeOrderDetail,
  type BackofficeOrderLocation,
  type FulfillmentAction,
} from '../../../../lib/fulfillment-api';
import { useAuth } from '../../../auth-provider';
import { CatalogHeader, formatMoney } from '../../../catalog-ui';

type BusyAction = FulfillmentAction | 'INTERNAL_NOTE' | 'RELOAD' | null;

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
  const [shippingFee, setShippingFee] = useState('');
  const [shippingFeeReason, setShippingFeeReason] = useState('Điều chỉnh theo kiện hàng thực tế');
  const [carrierName, setCarrierName] = useState('Giao hàng nội bộ');
  const [trackingCode, setTrackingCode] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [codConfirmed, setCodConfirmed] = useState(false);
  const [failureReason, setFailureReason] = useState('Không thể liên hệ người nhận');
  const [returnReason, setReturnReason] = useState('Kho đã nhận và kiểm đếm kiện hoàn');
  const [returnLocationId, setReturnLocationId] = useState('');
  const [returnLocations, setReturnLocations] = useState<BackofficeOrderLocation[]>([]);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const loadOrder = useCallback(async () => {
    const next = await getBackofficeOrder(client, orderId);
    setDetail(next);
    setInternalNote(next.internalNote ?? '');
    setShippingFee(next.pricing.shippingFee);
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
        setShippingFee(next.pricing.shippingFee);
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

  useEffect(() => {
    if (
      status !== 'authenticated' ||
      !isStaff ||
      !detail?.availableActions.includes('MARK_SHIPMENT_RETURNED')
    ) {
      return;
    }
    let active = true;
    void listActiveReturnLocations(client)
      .then((locations) => {
        if (!active) return;
        setReturnLocations(locations);
        setReturnLocationId((current) => current || locations[0]?.id || '');
      })
      .catch(() => {
        if (active) setError('Không thể tải địa điểm nhận hàng hoàn.');
      });
    return () => {
      active = false;
    };
  }, [client, detail?.availableActions, isStaff, status]);

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
      setShippingFee(next.pricing.shippingFee);
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

  const submitShippingFee = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reason = shippingFeeReason.trim();
    if (!/^\d{1,15}$/.test(shippingFee)) {
      setError('Phí giao hàng phải là số VND nguyên không âm, tối đa 15 chữ số.');
      return;
    }
    if (reason.length < 5 || reason.length > 500) {
      setError('Lý do điều chỉnh phải có từ 5 đến 500 ký tự.');
      return;
    }
    void runAction(
      'OVERRIDE_SHIPPING_FEE',
      () => overrideShippingFee(client, orderId, { shippingFee, reason }),
      'Đã cập nhật phí giao hàng và tổng tiền.',
    );
  };

  const submitShipment = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const carrier = carrierName.trim();
    const tracking = trackingCode.trim();
    const url = trackingUrl.trim();
    if (carrier.length === 0 || tracking.length === 0) {
      setError('Đơn vị vận chuyển và mã vận đơn là bắt buộc.');
      return;
    }
    if (url !== '' && !isHttpsUrl(url)) {
      setError('URL tra cứu phải dùng HTTPS hợp lệ.');
      return;
    }
    void runAction(
      'CREATE_SHIPMENT',
      async () => {
        await createShipment(client, orderId, {
          carrierName: carrier,
          trackingCode: tracking,
          ...(url === '' ? {} : { trackingUrl: url }),
        });
        return getBackofficeOrder(client, orderId);
      },
      'Đã tạo vận đơn và mã tra cứu.',
    );
  };

  const submitDelivered = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const shipment = detail?.shipments[0];
    if (detail === null || shipment === undefined) return;
    const codRequired = positiveMoney(detail.pricing.balanceDue);
    if (codRequired && !codConfirmed) {
      setError('Hãy xác nhận đơn vị giao hàng đã thu đủ COD.');
      return;
    }
    if (!codRequired && codConfirmed) {
      setError('Đơn có số dư bằng 0 nên không được xác nhận thu COD.');
      return;
    }
    void runAction(
      'MARK_SHIPMENT_DELIVERED',
      () => markShipmentDelivered(client, shipment.id, { confirmCodCollected: codRequired }),
      'Đã giao hàng, quyết toán COD và phát hành bảo hành.',
    );
  };

  const submitFailed = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const shipment = detail?.shipments[0];
    const reason = failureReason.trim();
    if (shipment === undefined) return;
    if (reason.length < 5 || reason.length > 500) {
      setError('Lý do giao thất bại phải có từ 5 đến 500 ký tự.');
      return;
    }
    void runAction(
      'MARK_SHIPMENT_FAILED',
      () => markShipmentFailed(client, shipment.id, { reason }),
      'Đã ghi nhận giao hàng thất bại.',
    );
  };

  const submitReturned = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const shipment = detail?.shipments[0];
    const reason = returnReason.trim();
    if (shipment === undefined) return;
    if (returnLocationId === '') {
      setError('Hãy chọn địa điểm thực nhận hàng hoàn.');
      return;
    }
    if (reason.length < 5 || reason.length > 500) {
      setError('Ghi chú hàng hoàn phải có từ 5 đến 500 ký tự.');
      return;
    }
    void runAction(
      'MARK_SHIPMENT_RETURNED',
      () =>
        markShipmentReturned(client, shipment.id, {
          returnedToLocationId: returnLocationId,
          reason,
        }),
      'Đã ghi nhận hàng hoàn về kho; iPhone sẽ chờ kiểm định lại.',
    );
  };

  return (
    <>
      <CatalogHeader />
      <main className="backoffice-shell fulfillment-shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/backoffice/orders">Đơn hàng</Link>
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
              Về hàng chờ đơn hàng
            </Link>
          </section>
        ) : null}

        {detail === null ? null : (
          <>
            <header className="backoffice-page-heading fulfillment-detail-heading">
              <div>
                <p className="eyebrow">
                  {detail.fulfillmentType === 'PICKUP' ? 'Pickup order' : 'Shipping order'}
                </p>
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
                  <h2>Khách hàng & giao nhận</h2>
                  <dl className="payment-review-specs">
                    <Spec label="Khách hàng" value={detail.contact.fullName} />
                    <Spec label="Điện thoại" value={detail.contact.phone} />
                    <Spec label="Email" value={detail.contact.email} />
                    {detail.fulfillmentType === 'PICKUP' ? (
                      <Spec
                        label="Cửa hàng"
                        value={
                          detail.pickupStore === null
                            ? '—'
                            : `${detail.pickupStore.code} · ${detail.pickupStore.name}`
                        }
                      />
                    ) : (
                      <>
                        <Spec
                          label="Nguồn xuất"
                          value={
                            detail.location === null
                              ? '—'
                              : `${detail.location.code} · ${detail.location.name}`
                          }
                        />
                        <Spec label="Địa chỉ giao" value={formatAddress(detail.shippingAddress)} />
                      </>
                    )}
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

                {detail.fulfillmentType === 'PICKUP' ? (
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
                ) : (
                  <ShippingTimeline detail={detail} />
                )}

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
                          {shipment.trackingUrl === null ? null : (
                            <div>
                              <dt>Tra cứu</dt>
                              <dd>
                                <a
                                  href={shipment.trackingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Mở trang vận chuyển
                                </a>
                              </dd>
                            </div>
                          )}
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
                          {shipment.returnedToLocation === null ? null : (
                            <Spec
                              label="Nhận hoàn tại"
                              value={`${shipment.returnedToLocation.code} · ${shipment.returnedToLocation.name}`}
                            />
                          )}
                          {shipment.returnNote === null ? null : (
                            <Spec label="Ghi chú hoàn" value={shipment.returnNote} />
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
                    {detail.fulfillmentType === 'SHIPPING' ? (
                      <MoneyLine
                        label="Phí giao ban đầu"
                        value={detail.pricing.shippingFeeOriginal}
                      />
                    ) : null}
                    <MoneyLine label="Phí giao hiện tại" value={detail.pricing.shippingFee} />
                    <MoneyLine label="Tổng" value={detail.pricing.grandTotal} total />
                    <MoneyLine label="Đã thu" value={detail.pricing.paidAmount} />
                    <MoneyLine label="Đã hoàn" value={detail.pricing.refundedAmount} />
                    <MoneyLine label="Còn thu" value={detail.pricing.balanceDue} total />
                  </div>
                  {detail.pricing.shippingFeeOverride === null ? null : (
                    <p className="muted">
                      Điều chỉnh bởi {detail.pricing.shippingFeeOverride.overriddenBy.fullName} lúc{' '}
                      {dateTime(detail.pricing.shippingFeeOverride.overriddenAt)} ·{' '}
                      {detail.pricing.shippingFeeOverride.reason}
                    </p>
                  )}
                </section>

                <section className="detail-panel fulfillment-command-card">
                  <h2>
                    {detail.fulfillmentType === 'PICKUP'
                      ? 'Thao tác pickup'
                      : 'Thao tác vận chuyển'}
                  </h2>
                  <p>Mỗi lệnh sẽ kiểm tra lại trạng thái authoritative trong transaction.</p>
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

                  {hasAction(detail, 'OVERRIDE_SHIPPING_FEE') ? (
                    <form className="fulfillment-command-form" onSubmit={submitShippingFee}>
                      <h3>Điều chỉnh phí giao hàng</h3>
                      <label htmlFor="shipping-fee">
                        Phí giao mới (VND)
                        <input
                          id="shipping-fee"
                          inputMode="numeric"
                          pattern="[0-9]+"
                          maxLength={15}
                          required
                          value={shippingFee}
                          onChange={(event) => {
                            setShippingFee(event.target.value);
                          }}
                        />
                      </label>
                      <label htmlFor="shipping-fee-reason">
                        Lý do
                        <textarea
                          id="shipping-fee-reason"
                          minLength={5}
                          maxLength={500}
                          rows={3}
                          required
                          value={shippingFeeReason}
                          onChange={(event) => {
                            setShippingFeeReason(event.target.value);
                          }}
                        />
                      </label>
                      <button className="button" type="submit" disabled={busy !== null}>
                        {busy === 'OVERRIDE_SHIPPING_FEE' ? 'Đang cập nhật…' : 'Cập nhật phí giao'}
                      </button>
                    </form>
                  ) : null}

                  {hasAction(detail, 'CREATE_SHIPMENT') ? (
                    <form className="fulfillment-command-form" onSubmit={submitShipment}>
                      <h3>Tạo vận đơn</h3>
                      <label htmlFor="carrier-name">
                        Đơn vị vận chuyển
                        <input
                          id="carrier-name"
                          maxLength={255}
                          required
                          value={carrierName}
                          onChange={(event) => {
                            setCarrierName(event.target.value);
                          }}
                        />
                      </label>
                      <label htmlFor="tracking-code">
                        Mã vận đơn
                        <input
                          id="tracking-code"
                          maxLength={255}
                          required
                          value={trackingCode}
                          onChange={(event) => {
                            setTrackingCode(event.target.value);
                          }}
                        />
                      </label>
                      <label htmlFor="tracking-url">
                        URL tra cứu HTTPS (không bắt buộc)
                        <input
                          id="tracking-url"
                          type="url"
                          inputMode="url"
                          maxLength={2048}
                          placeholder="https://carrier.example/track/..."
                          value={trackingUrl}
                          onChange={(event) => {
                            setTrackingUrl(event.target.value);
                          }}
                        />
                      </label>
                      <button className="button primary" type="submit" disabled={busy !== null}>
                        {busy === 'CREATE_SHIPMENT' ? 'Đang tạo…' : 'Tạo vận đơn'}
                      </button>
                    </form>
                  ) : null}

                  {hasAction(detail, 'HAND_OVER_SHIPMENT') && detail.shipments[0] !== undefined ? (
                    <button
                      className="button primary"
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        const shipment = detail.shipments[0];
                        if (shipment === undefined) return;
                        void runAction(
                          'HAND_OVER_SHIPMENT',
                          () => handOverShipment(client, shipment.id),
                          'Đã bàn giao kiện hàng cho đơn vị vận chuyển.',
                        );
                      }}
                    >
                      {busy === 'HAND_OVER_SHIPMENT' ? 'Đang bàn giao…' : 'Bàn giao vận chuyển'}
                    </button>
                  ) : null}

                  {hasAction(detail, 'MARK_SHIPMENT_DELIVERED') ? (
                    <form className="fulfillment-command-form" onSubmit={submitDelivered}>
                      <h3>Xác nhận giao thành công</h3>
                      {positiveMoney(detail.pricing.balanceDue) ? (
                        <label className="cash-confirmation">
                          <input
                            type="checkbox"
                            checked={codConfirmed}
                            onChange={(event) => {
                              setCodConfirmed(event.target.checked);
                            }}
                          />
                          <span>
                            Đơn vị giao hàng đã thu đủ{' '}
                            <strong>{formatMoney(detail.pricing.balanceDue)} ₫</strong> COD
                          </span>
                        </label>
                      ) : (
                        <p>Đơn đã đủ tiền; hệ thống sẽ không tạo Payment COD 0 đồng.</p>
                      )}
                      <button
                        className="button primary"
                        type="submit"
                        disabled={
                          busy !== null ||
                          (positiveMoney(detail.pricing.balanceDue) && !codConfirmed)
                        }
                      >
                        {busy === 'MARK_SHIPMENT_DELIVERED'
                          ? 'Đang hoàn tất…'
                          : 'Đã giao thành công'}
                      </button>
                    </form>
                  ) : null}

                  {hasAction(detail, 'MARK_SHIPMENT_FAILED') ? (
                    <form className="fulfillment-command-form" onSubmit={submitFailed}>
                      <h3>Giao hàng thất bại</h3>
                      <label htmlFor="shipment-failure-reason">
                        Lý do
                        <textarea
                          id="shipment-failure-reason"
                          minLength={5}
                          maxLength={500}
                          rows={3}
                          required
                          value={failureReason}
                          onChange={(event) => {
                            setFailureReason(event.target.value);
                          }}
                        />
                      </label>
                      <button className="button" type="submit" disabled={busy !== null}>
                        {busy === 'MARK_SHIPMENT_FAILED' ? 'Đang cập nhật…' : 'Đánh dấu thất bại'}
                      </button>
                    </form>
                  ) : null}

                  {hasAction(detail, 'MARK_SHIPMENT_RETURNED') ? (
                    <form className="fulfillment-command-form" onSubmit={submitReturned}>
                      <h3>Thực nhận hàng hoàn</h3>
                      <label htmlFor="return-location">
                        Địa điểm nhận hoàn
                        <select
                          id="return-location"
                          required
                          value={returnLocationId}
                          onChange={(event) => {
                            setReturnLocationId(event.target.value);
                          }}
                        >
                          <option value="">Chọn địa điểm</option>
                          {returnLocations.map((location) => (
                            <option key={location.id} value={location.id}>
                              {location.code} · {location.name} · {location.type}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label htmlFor="shipment-return-reason">
                        Ghi chú kiểm nhận
                        <textarea
                          id="shipment-return-reason"
                          minLength={5}
                          maxLength={500}
                          rows={3}
                          required
                          value={returnReason}
                          onChange={(event) => {
                            setReturnReason(event.target.value);
                          }}
                        />
                      </label>
                      <button className="button" type="submit" disabled={busy !== null}>
                        {busy === 'MARK_SHIPMENT_RETURNED'
                          ? 'Đang cập nhật…'
                          : 'Xác nhận hàng hoàn'}
                      </button>
                    </form>
                  ) : null}

                  {detail.availableActions.length === 0 ? (
                    <p className="muted">Đơn không còn thao tác fulfillment khả dụng.</p>
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

function ShippingTimeline({ detail }: { detail: BackofficeOrderDetail }) {
  const shipment = detail.shipments[0];
  return (
    <section className="detail-panel">
      <h2>Shipping timeline</h2>
      <ol className="fulfillment-timeline">
        <Timeline label="Đặt đơn" at={detail.placedAt} />
        <Timeline label="Xác nhận cọc" at={detail.confirmedAt} />
        <Timeline label="Tạo vận đơn" at={shipment?.createdAt ?? null} />
        <Timeline label="Bàn giao vận chuyển" at={shipment?.shippedAt ?? null} />
        {shipment?.status === 'FAILED' || shipment?.status === 'RETURNED' ? (
          <Timeline label="Giao thất bại" at={shipment.failedAt} />
        ) : (
          <Timeline label="Giao thành công" at={shipment?.deliveredAt ?? null} />
        )}
        {shipment?.status === 'RETURNED' ? (
          <Timeline label="Hàng hoàn đã về" at={shipment.returnedAt} />
        ) : null}
        <Timeline label="Hoàn tất" at={detail.completedAt} />
        <Timeline label="Đã hủy" at={detail.cancelledAt} />
      </ol>
    </section>
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

function hasAction(detail: BackofficeOrderDetail, action: FulfillmentAction): boolean {
  return detail.availableActions.includes(action);
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function formatAddress(value: unknown): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return '—';
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
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(', ');
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
