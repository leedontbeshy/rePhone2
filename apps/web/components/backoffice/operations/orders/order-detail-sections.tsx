import NextLink from 'next/link';
import type { SyntheticEvent } from 'react';
import { Button, Skeleton, StatusChip, Textarea, formatVnd } from '@/components/ui';
import type { BackofficeOrderDetail } from '@/lib/fulfillment-api';
import { OperationsPanel, OperationsTimeline } from '../operations-primitives';
import {
  formatOrderAddress,
  formatOrderDateTime,
  holdReasonLabel,
  isSafeTrackingUrl,
  orderTimeline,
  paymentMethodLabel,
  paymentPurposeLabel,
  paymentRecordStatusLabel,
  paymentRecordTone,
  refundMethodLabel,
  refundStatusLabel,
  refundTone,
  reservationStatusLabel,
  shipmentStatusLabel,
  shipmentTone,
  targetTypeLabel,
} from './order-presenter';
import styles from './orders.module.css';

export function OrderDetailMain({
  detail,
  internalNote,
  notePending,
  onSaveNote,
  setInternalNote,
  writesDisabled,
}: Readonly<{
  detail: BackofficeOrderDetail;
  internalNote: string;
  notePending: boolean;
  onSaveNote: (event: SyntheticEvent<HTMLFormElement>) => void;
  setInternalNote: (value: string) => void;
  writesDisabled: boolean;
}>) {
  return (
    <div className={styles.detailSections}>
      <OperationsPanel title="Khách hàng và giao nhận">
        <dl className={styles.specGrid}>
          <Spec label="Khách hàng" value={detail.contact.fullName} />
          <Spec label="Số điện thoại" value={detail.contact.phone} />
          <Spec label="Email" value={detail.contact.email} />
          {detail.fulfillmentType === 'PICKUP' ? (
            <Spec
              label="Cửa hàng nhận"
              value={
                detail.pickupStore === null
                  ? '—'
                  : `${detail.pickupStore.code} · ${detail.pickupStore.name}`
              }
            />
          ) : (
            <>
              <Spec
                label="Nơi xuất hàng"
                value={
                  detail.location === null
                    ? '—'
                    : `${detail.location.code} · ${detail.location.name}`
                }
              />
              <Spec label="Địa chỉ giao" value={formatOrderAddress(detail.shippingAddress)} />
            </>
          )}
          {detail.pickupHoldUntil === null ? null : (
            <Spec label="Giữ hàng đến" value={formatOrderDateTime(detail.pickupHoldUntil)} />
          )}
        </dl>
      </OperationsPanel>

      <OperationsPanel title="Sản phẩm">
        <div className={styles.itemList}>
          {detail.items.map((item) => (
            <article className={styles.itemRow} key={item.id}>
              <div className={styles.itemCopy}>
                <strong>{item.productName}</strong>
                <span>
                  {item.variantName} · {item.sku}
                </span>
                {item.inventoryCode === null ? null : <small>Mã máy: {item.inventoryCode}</small>}
                <small>Bảo hành: {String(item.warrantyDays)} ngày</small>
                {item.warranty === null ? null : (
                  <small>
                    {item.warranty.warrantyCode} · {formatOrderDateTime(item.warranty.startAt)} đến{' '}
                    {formatOrderDateTime(item.warranty.endAt)}
                  </small>
                )}
              </div>
              <div className={styles.itemPrice}>
                <span>
                  {String(item.quantity)} × {formatVnd(item.unitPrice)}
                </span>
                <strong>{formatVnd(item.lineTotal)}</strong>
              </div>
            </article>
          ))}
        </div>
      </OperationsPanel>

      <OperationsPanel title="Tiến trình xử lý">
        <OperationsTimeline items={orderTimeline(detail)} label="Tiến trình đơn hàng" />
      </OperationsPanel>

      {detail.shipments.length === 0 ? null : <ShipmentPanel detail={detail} />}
      <PaymentAndRefundPanel detail={detail} />
      {detail.reservations.length === 0 ? null : <ReservationPanel detail={detail} />}

      <OperationsPanel title="Ghi chú">
        <p className={styles.customerNote}>
          <strong>Khách hàng:</strong> {detail.customerNote ?? 'Không có ghi chú.'}
        </p>
        <OrderNoteForm
          internalNote={internalNote}
          notePending={notePending}
          writesDisabled={writesDisabled}
          setInternalNote={setInternalNote}
          onSaveNote={onSaveNote}
        />
      </OperationsPanel>
    </div>
  );
}

export function OrderNoteForm({
  internalNote,
  notePending,
  onSaveNote,
  setInternalNote,
  writesDisabled,
}: Readonly<{
  internalNote: string;
  notePending: boolean;
  onSaveNote: (event: SyntheticEvent<HTMLFormElement>) => void;
  setInternalNote: (value: string) => void;
  writesDisabled: boolean;
}>) {
  return (
    <form aria-busy={writesDisabled || undefined} className={styles.noteForm} onSubmit={onSaveNote}>
      <fieldset className={styles.noteFieldset} disabled={writesDisabled}>
        <Textarea
          id="order-internal-note"
          label="Ghi chú nội bộ"
          maxLength={2000}
          rows={5}
          value={internalNote}
          onChange={(event) => {
            setInternalNote(event.target.value);
          }}
        />
        <div className={styles.noteActions}>
          <Button
            disabled={writesDisabled}
            loading={notePending}
            loadingLabel="Đang lưu ghi chú"
            type="submit"
            variant="secondary"
          >
            Lưu ghi chú
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

function ShipmentPanel({ detail }: Readonly<{ detail: BackofficeOrderDetail }>) {
  return (
    <OperationsPanel title="Vận chuyển">
      <div className={styles.shipmentList}>
        {detail.shipments.map((shipment) => (
          <article className={styles.recordCard} key={shipment.id}>
            <div className={styles.recordHeading}>
              <div>
                <strong>{shipment.carrierName}</strong>
                <span>Mã vận đơn {shipment.trackingCode}</span>
              </div>
              <StatusChip
                label={shipmentStatusLabel(shipment.status)}
                tone={shipmentTone(shipment.status)}
              />
            </div>
            <dl className={styles.specGrid}>
              <Spec label="Lần giao" value={String(shipment.attemptNumber)} />
              <Spec
                label="Bàn giao"
                value={shipment.shippedAt === null ? '—' : formatOrderDateTime(shipment.shippedAt)}
              />
              <Spec
                label="Giao xong"
                value={
                  shipment.deliveredAt === null ? '—' : formatOrderDateTime(shipment.deliveredAt)
                }
              />
              {shipment.failureReason === null ? null : (
                <Spec label="Lý do thất bại" value={shipment.failureReason} />
              )}
              {shipment.returnedToLocation === null ? null : (
                <Spec
                  label="Nhận hoàn tại"
                  value={`${shipment.returnedToLocation.code} · ${shipment.returnedToLocation.name}`}
                />
              )}
            </dl>
            {shipment.trackingUrl === null || !isSafeTrackingUrl(shipment.trackingUrl) ? null : (
              <div className={styles.linkRow}>
                <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer">
                  Mở trang tra cứu vận đơn
                </a>
              </div>
            )}
          </article>
        ))}
      </div>
    </OperationsPanel>
  );
}

function PaymentAndRefundPanel({ detail }: Readonly<{ detail: BackofficeOrderDetail }>) {
  return (
    <OperationsPanel title="Thanh toán và hoàn tiền">
      {detail.paymentAttempts.length === 0 && detail.refunds.length === 0 ? (
        <p className={styles.muted}>Chưa có khoản thanh toán hoặc hoàn tiền.</p>
      ) : null}
      {detail.paymentAttempts.length === 0 ? null : (
        <div className={styles.paymentList}>
          {detail.paymentAttempts.map((payment) => (
            <article className={styles.recordCard} key={payment.id}>
              <div className={styles.recordHeading}>
                <div>
                  <strong>{paymentPurposeLabel(payment.purpose)}</strong>
                  <span>{paymentMethodLabel(payment.method)}</span>
                </div>
                <StatusChip
                  label={paymentRecordStatusLabel(payment.status)}
                  tone={paymentRecordTone(payment.status)}
                />
              </div>
              <dl className={styles.specGrid}>
                <Spec label="Cần thu" value={formatVnd(payment.expectedAmount)} />
                <Spec
                  label="Đã nhận"
                  value={payment.receivedAmount === null ? '—' : formatVnd(payment.receivedAmount)}
                />
                <Spec
                  label="Đã kiểm tra"
                  value={
                    payment.reviewedAt === null ? '—' : formatOrderDateTime(payment.reviewedAt)
                  }
                />
              </dl>
              <NextLink href={`/backoffice/payments/${encodeURIComponent(payment.id)}`}>
                Xem khoản thanh toán
              </NextLink>
            </article>
          ))}
        </div>
      )}
      {detail.refunds.length === 0 ? null : (
        <div className={styles.refundList}>
          {detail.refunds.map((refund) => (
            <article className={styles.recordCard} key={refund.id}>
              <div className={styles.recordHeading}>
                <div>
                  <strong>{formatVnd(refund.amount)}</strong>
                  <span>
                    {refundMethodLabel(refund.method)} · {refund.reason}
                  </span>
                </div>
                <StatusChip
                  label={refundStatusLabel(refund.status)}
                  tone={refundTone(refund.status)}
                />
              </div>
              {refund.terminalReason === null ? null : (
                <p className={styles.muted}>{refund.terminalReason}</p>
              )}
              <NextLink href={`/backoffice/refunds/${encodeURIComponent(refund.id)}`}>
                Xem yêu cầu hoàn tiền
              </NextLink>
            </article>
          ))}
        </div>
      )}
    </OperationsPanel>
  );
}

function ReservationPanel({ detail }: Readonly<{ detail: BackofficeOrderDetail }>) {
  return (
    <OperationsPanel title="Phần hàng đang giữ">
      <div className={styles.recordList}>
        {detail.reservations.map((reservation) => (
          <article className={styles.recordCard} key={reservation.id}>
            <dl className={styles.specGrid}>
              <Spec label="Trạng thái" value={reservationStatusLabel(reservation.status)} />
              <Spec label="Mục đích" value={holdReasonLabel(reservation.holdReason)} />
              <Spec label="Loại hàng" value={targetTypeLabel(reservation.targetType)} />
              <Spec label="Số lượng" value={String(reservation.quantity)} />
              <Spec
                label="Giữ đến"
                value={
                  reservation.expiresAt === null
                    ? 'Không giới hạn'
                    : formatOrderDateTime(reservation.expiresAt)
                }
              />
            </dl>
          </article>
        ))}
      </div>
    </OperationsPanel>
  );
}

export function Spec({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className={styles.spec}>
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  );
}

export function OrderDetailSkeleton() {
  return (
    <section className={styles.loadingState} aria-label="Đang tải chi tiết đơn hàng" role="status">
      <Skeleton height="2.25rem" width="18rem" />
      <Skeleton height="1.25rem" width="min(100%, 28rem)" />
      <Skeleton height="8rem" width="100%" />
      <span className="rp-visually-hidden">Đang tải chi tiết đơn hàng…</span>
    </section>
  );
}
