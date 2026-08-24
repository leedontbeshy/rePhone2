'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  cancelRefund,
  completeBankTransferRefund,
  completeCashRefund,
  getBackofficeRefund,
  getRefundEvidenceUrl,
  refundError,
  rejectRefund,
  startRefundProcessing,
  type RefundAction,
  type RefundDetail,
} from '../../../../lib/refund-api';
import { useAuth } from '../../../auth-provider';
import { CatalogHeader, formatMoney } from '../../../catalog-ui';

type BusyAction = RefundAction | 'RELOAD' | null;

export default function BackofficeRefundDetailPage() {
  const params = useParams<{ id: string }>();
  const refundId = decodeURIComponent(params.id);
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [detail, setDetail] = useState<RefundDetail | null>(null);
  const [startNote, setStartNote] = useState('Đã đối chiếu thông tin nhận hoàn tiền');
  const [completionNote, setCompletionNote] = useState('Đã hoàn tiền và đối chiếu thành công');
  const [rejectReason, setRejectReason] = useState('Yêu cầu không đủ điều kiện hoàn tiền');
  const [cancelReason, setCancelReason] = useState('Dừng yêu cầu theo xác nhận vận hành');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const evidenceInputRef = useRef<HTMLInputElement>(null);

  const loadRefund = useCallback(async () => {
    const next = await getBackofficeRefund(client, refundId);
    setDetail(next);
    setError(null);
  }, [client, refundId]);

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (status !== 'authenticated' || !isStaff) return;
    let active = true;
    setLoading(true);
    void getBackofficeRefund(client, refundId)
      .then((next) => {
        if (!active) return;
        setDetail(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'Không thể tải chi tiết hoàn tiền.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, isStaff, refundId, status]);

  const reload = async () => {
    setBusy('RELOAD');
    setError(null);
    try {
      await loadRefund();
    } catch (caught) {
      setError(errorMessage(caught, 'Không thể tải lại yêu cầu hoàn tiền.'));
    } finally {
      setBusy(null);
    }
  };

  const runAction = async (
    action: Exclude<BusyAction, 'VIEW_EVIDENCE' | 'RELOAD' | null>,
    operation: () => Promise<RefundDetail>,
    success: string,
  ) => {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const next = await operation();
      setDetail(next);
      setNotice(success);
    } catch (caught) {
      const message = errorMessage(caught, 'Không thể cập nhật yêu cầu hoàn tiền.');
      try {
        setDetail(await getBackofficeRefund(client, refundId));
      } catch {
        // Keep the command error authoritative if the refreshed projection also fails.
      }
      setError(message);
    } finally {
      setBusy(null);
    }
  };

  const openEvidence = async () => {
    const evidenceWindow = window.open('about:blank', '_blank');
    if (evidenceWindow === null) {
      setError('Trình duyệt đã chặn tab minh chứng. Hãy cho phép popup rồi thử lại.');
      return;
    }
    evidenceWindow.opener = null;
    setBusy('VIEW_EVIDENCE');
    setError(null);
    try {
      const signed = await getRefundEvidenceUrl(client, refundId);
      evidenceWindow.location.replace(signed.url);
    } catch (caught) {
      evidenceWindow.close();
      setError(errorMessage(caught, 'Không thể mở minh chứng hoàn tiền.'));
    } finally {
      setBusy(null);
    }
  };

  const submitStart = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const note = startNote.trim();
    if (note !== '' && (note.length < 5 || note.length > 500)) {
      setError('Ghi chú xử lý phải trống hoặc có từ 5 đến 500 ký tự.');
      return;
    }
    void runAction(
      'START_PROCESSING',
      () => startRefundProcessing(client, refundId, note === '' ? undefined : note),
      'Đã nhận xử lý yêu cầu hoàn tiền.',
    );
  };

  const submitCash = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const note = completionNote.trim();
    if (!validNote(note)) {
      setError('Ghi chú hoàn tất phải có từ 5 đến 500 ký tự.');
      return;
    }
    void runAction(
      'COMPLETE_CASH',
      () => completeCashRefund(client, refundId, note),
      'Đã hoàn tất hoàn tiền mặt.',
    );
  };

  const submitBank = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const note = completionNote.trim();
    if (!validNote(note)) {
      setError('Ghi chú hoàn tất phải có từ 5 đến 500 ký tự.');
      return;
    }
    if (evidenceFile === null) {
      setError('Hãy chọn minh chứng chuyển khoản.');
      return;
    }
    if (evidenceFile.size === 0) {
      setError('Tệp minh chứng đang trống.');
      return;
    }
    if (evidenceFile.size > 10 * 1024 * 1024) {
      setError('Tệp vượt quá giới hạn 10 MiB.');
      return;
    }
    void runAction(
      'COMPLETE_BANK_TRANSFER',
      async () => {
        const next = await completeBankTransferRefund(client, refundId, evidenceFile, note);
        setEvidenceFile(null);
        if (evidenceInputRef.current !== null) evidenceInputRef.current.value = '';
        return next;
      },
      'Đã hoàn tất chuyển khoản và lưu minh chứng riêng tư.',
    );
  };

  const submitReject = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reason = rejectReason.trim();
    if (!validNote(reason)) {
      setError('Lý do từ chối phải có từ 5 đến 500 ký tự.');
      return;
    }
    void runAction(
      'REJECT',
      () => rejectRefund(client, refundId, reason),
      'Đã từ chối yêu cầu hoàn tiền.',
    );
  };

  const submitCancel = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reason = cancelReason.trim();
    if (!validNote(reason)) {
      setError('Lý do hủy phải có từ 5 đến 500 ký tự.');
      return;
    }
    void runAction(
      'CANCEL',
      () => cancelRefund(client, refundId, reason),
      'Đã hủy yêu cầu hoàn tiền.',
    );
  };

  return (
    <>
      <CatalogHeader />
      <main className="backoffice-shell payment-review-shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/backoffice/refunds">Hoàn tiền</Link>
          <span>/</span>
          <span>{detail?.order.orderNumber ?? refundId}</span>
        </nav>

        {status === 'loading' || loading ? (
          <div className="status">Đang tải chi tiết hoàn tiền…</div>
        ) : null}
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
            Bạn không có quyền xử lý hoàn tiền.
          </div>
        ) : null}
        {error === null ? null : (
          <div ref={errorRef} tabIndex={-1} className="commerce-alert error" role="alert">
            <span>{error}</span>
            {isStaff ? (
              <button
                className="button"
                type="button"
                disabled={busy !== null}
                onClick={() => void reload()}
              >
                Tải lại
              </button>
            ) : null}
          </div>
        )}
        {notice === null ? null : (
          <div className="commerce-alert success" role="status" aria-live="polite">
            {notice}
          </div>
        )}
        {status === 'authenticated' && isStaff && !loading && detail === null ? (
          <section className="empty-state">
            <h1>Không mở được yêu cầu hoàn tiền</h1>
            <Link className="button" href="/backoffice/refunds">
              Về hàng chờ
            </Link>
          </section>
        ) : null}

        {detail === null ? null : (
          <>
            <header className="backoffice-page-heading payment-detail-heading">
              <div>
                <p className="eyebrow">Refund {methodLabel(detail.method)}</p>
                <h1>{detail.order.orderNumber}</h1>
                <p>ID {detail.id}</p>
              </div>
              <span className={`payment-status-badge ${detail.status.toLowerCase()}`}>
                {statusLabel(detail.status)}
              </span>
            </header>

            <div className="payment-review-layout">
              <section className="payment-review-main">
                <article className="detail-panel">
                  <div className="payment-panel-heading">
                    <h2>Yêu cầu hoàn tiền</h2>
                    <strong>{formatMoney(detail.amount)} ₫</strong>
                  </div>
                  <dl className="payment-review-specs">
                    <Spec label="Phương thức" value={methodLabel(detail.method)} />
                    <Spec label="Trạng thái" value={statusLabel(detail.status)} />
                    <Spec label="Người yêu cầu" value={requesterLabel(detail)} />
                    <Spec label="Tạo lúc" value={dateTime(detail.createdAt)} />
                    <Spec label="Lý do nghiệp vụ" value={detail.reason || '—'} />
                    <Spec label="Ghi chú xử lý" value={detail.note ?? '—'} />
                  </dl>
                  {detail.terminalReason === null ? null : (
                    <div className="payment-rejection">
                      <strong>Lý do terminal</strong>
                      <span>{detail.terminalReason}</span>
                    </div>
                  )}
                </article>

                <article className="detail-panel">
                  <h2>Đơn hàng & nguồn tiền</h2>
                  <dl className="payment-review-specs">
                    <Spec label="Order" value={detail.order.status || '—'} />
                    <Spec label="Fulfillment" value={detail.order.fulfillmentStatus || '—'} />
                    <Spec label="Payment" value={detail.order.paymentStatus || '—'} />
                    <Spec label="Loại giao nhận" value={detail.order.fulfillmentType || '—'} />
                    <Spec label="Đã thu" value={`${formatMoney(detail.order.paidAmount)} ₫`} />
                    <Spec label="Đã hoàn" value={`${formatMoney(detail.order.refundedAmount)} ₫`} />
                    <Spec
                      label="Còn có thể hoàn"
                      value={
                        detail.order.refundableAmount === null
                          ? '—'
                          : `${formatMoney(detail.order.refundableAmount)} ₫`
                      }
                    />
                    <Spec label="Khách hàng" value={detail.order.contactName ?? '—'} />
                  </dl>
                  <Link className="button" href={`/backoffice/orders/${detail.order.id}`}>
                    Mở chi tiết đơn hàng
                  </Link>
                  {detail.payment === null ? (
                    <p className="muted">Refund được đối chiếu trên tổng payment của Order.</p>
                  ) : (
                    <dl className="payment-review-specs refund-source-payment">
                      <Spec label="Payment source" value={detail.payment.id} />
                      <Spec label="Mục đích" value={detail.payment.purpose} />
                      <Spec label="Phương thức thu" value={detail.payment.method} />
                      <Spec label="Trạng thái" value={detail.payment.status} />
                      <Spec
                        label="Đã nhận"
                        value={
                          detail.payment.receivedAmount === null
                            ? '—'
                            : `${formatMoney(detail.payment.receivedAmount)} ₫`
                        }
                      />
                    </dl>
                  )}
                </article>

                <article className="detail-panel">
                  <h2>Timeline</h2>
                  {detail.timeline.length === 0 ? (
                    <p>Chưa có mốc vận hành.</p>
                  ) : (
                    <ol className="fulfillment-timeline">
                      {detail.timeline.map((item) => (
                        <li className="complete" key={`${item.label}-${item.at}`}>
                          <span aria-hidden="true" />
                          <div>
                            <strong>{item.label}</strong>
                            <time>{dateTime(item.at)}</time>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                  {detail.processor === null ? null : (
                    <p className="muted">Processor: {detail.processor.fullName}</p>
                  )}
                  {detail.terminalActor === null ? null : (
                    <p className="muted">Terminal actor: {detail.terminalActor.fullName}</p>
                  )}
                </article>

                {detail.evidenceAvailable ? (
                  <article className="detail-panel">
                    <h2>Minh chứng riêng tư</h2>
                    <p>Signed URL chỉ có hiệu lực tối đa 5 phút và được audit khi mở.</p>
                    <button
                      className="button primary"
                      type="button"
                      disabled={busy !== null || !hasAction(detail, 'VIEW_EVIDENCE')}
                      onClick={() => void openEvidence()}
                    >
                      {busy === 'VIEW_EVIDENCE' ? 'Đang tạo liên kết…' : 'Mở minh chứng'}
                    </button>
                  </article>
                ) : null}
              </section>

              <aside className="payment-review-actions">
                {hasAction(detail, 'START_PROCESSING') ? (
                  <form className="review-action-card verify" onSubmit={submitStart}>
                    <h2>Nhận xử lý</h2>
                    <p>Amount, method và business reason sẽ tiếp tục bất biến.</p>
                    <label>
                      Ghi chú (không bắt buộc)
                      <textarea
                        maxLength={500}
                        value={startNote}
                        onChange={(event) => {
                          setStartNote(event.target.value);
                        }}
                      />
                    </label>
                    <button className="button primary" type="submit" disabled={busy !== null}>
                      {busy === 'START_PROCESSING' ? 'Đang nhận…' : 'Bắt đầu xử lý'}
                    </button>
                  </form>
                ) : null}

                {hasAction(detail, 'COMPLETE_BANK_TRANSFER') ? (
                  <form className="review-action-card verify" onSubmit={submitBank}>
                    <h2>Hoàn tất chuyển khoản</h2>
                    <label>
                      Minh chứng
                      <input
                        ref={evidenceInputRef}
                        type="file"
                        required
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(event) => {
                          setEvidenceFile(event.target.files?.[0] ?? null);
                          setError(null);
                        }}
                      />
                    </label>
                    <p>JPEG, PNG, WebP hoặc PDF · tối đa 10 MiB.</p>
                    <CompletionNote value={completionNote} onChange={setCompletionNote} />
                    <button
                      className="button primary"
                      type="submit"
                      disabled={
                        busy !== null || evidenceFile === null || !validNote(completionNote.trim())
                      }
                    >
                      {busy === 'COMPLETE_BANK_TRANSFER' ? 'Đang hoàn tất…' : 'Xác nhận đã chuyển'}
                    </button>
                  </form>
                ) : null}

                {hasAction(detail, 'COMPLETE_CASH') ? (
                  <form className="review-action-card verify" onSubmit={submitCash}>
                    <h2>Hoàn tất tiền mặt</h2>
                    <p>Xác nhận đã giao đúng số tiền {formatMoney(detail.amount)} ₫.</p>
                    <CompletionNote value={completionNote} onChange={setCompletionNote} />
                    <button
                      className="button primary"
                      type="submit"
                      disabled={busy !== null || !validNote(completionNote.trim())}
                    >
                      {busy === 'COMPLETE_CASH' ? 'Đang hoàn tất…' : 'Xác nhận đã hoàn tiền mặt'}
                    </button>
                  </form>
                ) : null}

                {hasAction(detail, 'REJECT') ? (
                  <form className="review-action-card reject" onSubmit={submitReject}>
                    <h2>Từ chối</h2>
                    <label>
                      Lý do
                      <textarea
                        required
                        minLength={5}
                        maxLength={500}
                        value={rejectReason}
                        onChange={(event) => {
                          setRejectReason(event.target.value);
                        }}
                      />
                    </label>
                    <button className="button danger" type="submit" disabled={busy !== null}>
                      {busy === 'REJECT' ? 'Đang từ chối…' : 'Từ chối yêu cầu'}
                    </button>
                  </form>
                ) : null}

                {hasAction(detail, 'CANCEL') ? (
                  <form className="review-action-card reject" onSubmit={submitCancel}>
                    <h2>Hủy obligation</h2>
                    <label>
                      Lý do
                      <textarea
                        required
                        minLength={5}
                        maxLength={500}
                        value={cancelReason}
                        onChange={(event) => {
                          setCancelReason(event.target.value);
                        }}
                      />
                    </label>
                    <button className="button" type="submit" disabled={busy !== null}>
                      {busy === 'CANCEL' ? 'Đang hủy…' : 'Hủy yêu cầu'}
                    </button>
                  </form>
                ) : null}

                {detail.availableActions.length === 0 ? (
                  <div className="review-action-card">
                    <h2>Đã khóa</h2>
                    <p>Refund terminal không còn thao tác thay đổi trạng thái.</p>
                    <Link className="button" href="/backoffice/refunds">
                      Về hàng chờ
                    </Link>
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

function CompletionNote({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label>
      Ghi chú hoàn tất
      <textarea
        required
        minLength={5}
        maxLength={500}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </label>
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

function hasAction(detail: RefundDetail, action: RefundAction): boolean {
  return detail.availableActions.includes(action);
}

function validNote(value: string): boolean {
  return value.length >= 5 && value.length <= 500;
}

function requesterLabel(detail: RefundDetail): string {
  if (detail.requester !== null) return detail.requester.fullName;
  if (detail.requesterType === 'SYSTEM') return 'Hệ thống';
  if (detail.requesterType === 'CUSTOMER') return 'Khách hàng/guest';
  return 'Nhân viên';
}

function methodLabel(value: string): string {
  if (value === 'BANK_TRANSFER') return 'Chuyển khoản';
  if (value === 'CASH') return 'Tiền mặt';
  return 'Legacy/khác';
}

function statusLabel(value: string): string {
  if (value === 'REQUESTED') return 'Chờ xử lý';
  if (value === 'PROCESSING') return 'Đang xử lý';
  if (value === 'COMPLETED') return 'Đã hoàn tất';
  if (value === 'REJECTED') return 'Bị từ chối';
  if (value === 'CANCELLED') return 'Đã hủy';
  return value;
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
  return value instanceof Error ? value.message : refundError(value, fallback);
}
