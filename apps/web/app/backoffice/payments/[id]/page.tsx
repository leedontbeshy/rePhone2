'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  getBackofficePayment,
  getPaymentEvidenceUrl,
  rejectPayment,
  verifyPayment,
  type BackofficePaymentDetail,
  type ReviewPaymentResult,
} from '../../../../lib/payment-api';
import { useAuth } from '../../../auth-provider';
import { CatalogHeader, formatMoney } from '../../../catalog-ui';

export default function BackofficePaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const paymentId = decodeURIComponent(params.id);
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [detail, setDetail] = useState<BackofficePaymentDetail | null>(null);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [verifyNote, setVerifyNote] = useState('');
  const [rejectReason, setRejectReason] = useState('Minh chứng không khớp giao dịch');
  const [busy, setBusy] = useState<'evidence' | 'verify' | 'reject' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const loadPayment = useCallback(async () => {
    const next = await getBackofficePayment(client, paymentId);
    setDetail(next);
    setReceivedAmount((current) => current || next.payment.expectedAmount);
    setError(null);
  }, [client, paymentId]);

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (status !== 'authenticated' || !isStaff) return;
    let active = true;
    setLoading(true);
    void loadPayment()
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'Không thể tải chi tiết thanh toán.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isStaff, loadPayment, status]);

  const openEvidence = async () => {
    const evidenceWindow = window.open('about:blank', '_blank');
    if (evidenceWindow === null) {
      setError('Trình duyệt đã chặn tab minh chứng. Hãy cho phép popup rồi thử lại.');
      return;
    }
    evidenceWindow.opener = null;
    setBusy('evidence');
    setError(null);
    try {
      const signed = await getPaymentEvidenceUrl(client, paymentId);
      evidenceWindow.location.replace(signed.url);
    } catch (caught) {
      evidenceWindow.close();
      setError(caught instanceof Error ? caught.message : 'Không thể mở minh chứng thanh toán.');
    } finally {
      setBusy(null);
    }
  };

  const submitVerify = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runReview('verify', async () => {
      const normalizedAmount = receivedAmount.trim();
      if (!/^\d+$/.test(normalizedAmount) || normalizedAmount === '0') {
        throw new Error('Số tiền đã nhận phải là chuỗi chữ số dương.');
      }
      const note = verifyNote.trim();
      if (
        detail !== null &&
        normalizedAmount !== detail.payment.expectedAmount &&
        note.length < 5
      ) {
        throw new Error('Cần ghi chú ít nhất 5 ký tự khi số tiền khác dự kiến.');
      }
      return verifyPayment(client, paymentId, {
        receivedAmount: normalizedAmount,
        ...(note === '' ? {} : { note }),
      });
    });
  };

  const submitReject = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runReview('reject', async () => {
      const reason = rejectReason.trim();
      if (reason.length < 5) throw new Error('Lý do từ chối cần ít nhất 5 ký tự.');
      return rejectPayment(client, paymentId, { reason });
    });
  };

  const runReview = async (
    action: 'verify' | 'reject',
    operation: () => Promise<ReviewPaymentResult>,
  ) => {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const result = await operation();
      await loadPayment();
      setNotice(reviewNotice(action, result.notificationDelivery));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể review thanh toán.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <CatalogHeader />
      <main className="backoffice-shell payment-review-shell">
        <div className="breadcrumbs">
          <Link href="/backoffice/payments">Thanh toán</Link>
          <span>/</span>
          <span>{detail?.order.orderNumber || paymentId}</span>
        </div>

        {status === 'loading' || loading ? (
          <div className="status">Đang tải chi tiết thanh toán…</div>
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
            Bạn không có quyền review thanh toán.
          </div>
        ) : null}
        {error === null ? null : (
          <div ref={errorRef} tabIndex={-1} className="commerce-alert error" role="alert">
            <span>{error}</span>
            {isStaff ? (
              <button className="button" type="button" onClick={() => void loadPayment()}>
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
            <h1>Không mở được thanh toán</h1>
            <Link className="button" href="/backoffice/payments">
              Về hàng chờ
            </Link>
          </section>
        ) : null}

        {detail === null ? null : (
          <>
            <header className="backoffice-page-heading payment-detail-heading">
              <div>
                <p className="eyebrow">Thanh toán {detail.payment.purpose}</p>
                <h1>{detail.order.orderNumber}</h1>
                <p>ID {detail.payment.id}</p>
              </div>
              <span className={`payment-status-badge ${detail.payment.status.toLowerCase()}`}>
                {statusLabel(detail.payment.status)}
              </span>
            </header>

            <div className="payment-review-layout">
              <section className="payment-review-main">
                <article className="detail-panel">
                  <div className="payment-panel-heading">
                    <h2>Đối chiếu giao dịch</h2>
                    {detail.payment.reviewOverdue ? (
                      <strong className="overdue-label">Đã quá SLA</strong>
                    ) : null}
                  </div>
                  <dl className="payment-review-specs">
                    <Spec
                      label="Dự kiến"
                      value={`${formatMoney(detail.payment.expectedAmount)} ₫`}
                    />
                    <Spec
                      label="Đã nhận"
                      value={
                        detail.payment.receivedAmount === null
                          ? 'Chưa xác minh'
                          : `${formatMoney(detail.payment.receivedAmount)} ₫`
                      }
                    />
                    <Spec label="Phương thức" value={detail.payment.method} />
                    <Spec
                      label="Nội dung chuyển khoản"
                      value={detail.payment.transferContent ?? '—'}
                    />
                    <Spec label="Nộp lúc" value={dateTime(detail.payment.submittedAt)} />
                    <Spec label="SLA review" value={dateTime(detail.payment.reviewSlaDueAt)} />
                  </dl>
                  {detail.payment.rejectionReason === null ? null : (
                    <div className="payment-rejection">
                      <strong>Lý do từ chối</strong>
                      <span>{detail.payment.rejectionReason}</span>
                    </div>
                  )}
                  <button
                    className="button primary"
                    type="button"
                    disabled={busy !== null || !detail.evidenceAvailable}
                    onClick={() => void openEvidence()}
                  >
                    {busy === 'evidence' ? 'Đang tạo liên kết…' : 'Mở minh chứng riêng tư'}
                  </button>
                  {!detail.evidenceAvailable ? (
                    <p className="muted">Thanh toán chưa có evidence để mở.</p>
                  ) : (
                    <p className="muted">Liên kết chỉ có hiệu lực tối đa 5 phút.</p>
                  )}
                </article>

                <article className="detail-panel">
                  <h2>Đơn hàng & khách hàng</h2>
                  <dl className="payment-review-specs">
                    <Spec label="Order" value={detail.order.status || '—'} />
                    <Spec label="Fulfillment" value={detail.order.fulfillmentStatus || '—'} />
                    <Spec label="Payment" value={detail.order.paymentStatus || '—'} />
                    <Spec label="Tổng đơn" value={moneyLabel(detail.order.grandTotal)} />
                    <Spec label="Cọc yêu cầu" value={moneyLabel(detail.order.depositRequired)} />
                    <Spec label="Còn phải trả" value={moneyLabel(detail.order.balanceDue)} />
                  </dl>
                  {detail.order.contact === null ? null : (
                    <address className="payment-contact">
                      <strong>{detail.order.contact.fullName}</strong>
                      <span>{detail.order.contact.phone}</span>
                      <span>{detail.order.contact.email}</span>
                    </address>
                  )}
                  {detail.order.items.map((item) => (
                    <div className="payment-order-item" key={item.id}>
                      <div>
                        <strong>{item.productName}</strong>
                        <span>{item.variantName}</span>
                      </div>
                      <div>
                        <span>× {item.quantity}</span>
                        <strong>{formatMoney(item.lineTotal)} ₫</strong>
                      </div>
                    </div>
                  ))}
                </article>

                {detail.timeline.length === 0 ? null : (
                  <article className="detail-panel">
                    <h2>Timeline</h2>
                    <ol className="payment-timeline">
                      {detail.timeline.map((item) => (
                        <li key={`${item.label}-${item.at}`}>
                          <strong>{item.label}</strong>
                          <time>{dateTime(item.at)}</time>
                        </li>
                      ))}
                    </ol>
                    {detail.reviewer === null ? null : (
                      <p className="muted">Reviewer: {detail.reviewer.fullName}</p>
                    )}
                  </article>
                )}
              </section>

              <aside className="payment-review-actions">
                {detail.payment.status === 'UNDER_REVIEW' ? (
                  <>
                    <form className="review-action-card verify" onSubmit={submitVerify}>
                      <h2>Xác minh</h2>
                      <label>
                        Số tiền đã nhận (VND)
                        <input
                          inputMode="numeric"
                          pattern="[0-9]+"
                          required
                          value={receivedAmount}
                          onChange={(event) => {
                            setReceivedAmount(event.target.value.replace(/\D/g, ''));
                          }}
                        />
                      </label>
                      <label>
                        Ghi chú
                        <textarea
                          minLength={5}
                          maxLength={500}
                          placeholder="Bắt buộc nếu số tiền khác dự kiến"
                          value={verifyNote}
                          onChange={(event) => {
                            setVerifyNote(event.target.value);
                          }}
                        />
                      </label>
                      <button
                        className="button primary"
                        type="submit"
                        disabled={busy !== null || receivedAmount.length === 0}
                      >
                        {busy === 'verify' ? 'Đang xác minh…' : 'Xác minh thanh toán'}
                      </button>
                    </form>

                    <form className="review-action-card reject" onSubmit={submitReject}>
                      <h2>Từ chối</h2>
                      <p>Đơn sẽ bị hủy và tồn/voucher được giải phóng.</p>
                      <label>
                        Lý do từ chối
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
                      <button
                        className="button danger"
                        type="submit"
                        disabled={busy !== null || rejectReason.trim().length < 5}
                      >
                        {busy === 'reject' ? 'Đang từ chối…' : 'Từ chối minh chứng'}
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="review-action-card">
                    <h2>Đã xử lý</h2>
                    <p>Thanh toán terminal không còn action review.</p>
                    <Link className="button" href="/backoffice/payments">
                      Về hàng chờ
                    </Link>
                  </div>
                )}
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
      <dd>{value}</dd>
    </div>
  );
}

function moneyLabel(value: string | null): string {
  return value === null ? '—' : `${formatMoney(value)} ₫`;
}

function dateTime(value: string | null): string {
  if (value === null) return '—';
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toLocaleString('vi-VN');
}

function statusLabel(value: string): string {
  if (value === 'UNDER_REVIEW') return 'Đang review';
  if (value === 'AWAITING_PROOF') return 'Chờ minh chứng';
  if (value === 'VERIFIED') return 'Đã xác minh';
  if (value === 'REJECTED') return 'Bị từ chối';
  if (value === 'EXPIRED') return 'Đã hết hạn';
  if (value === 'CANCELLED') return 'Đã hủy';
  return value;
}

function reviewNotice(
  action: 'verify' | 'reject',
  delivery: ReviewPaymentResult['notificationDelivery'],
): string {
  const result = action === 'verify' ? 'Đã xác minh thanh toán.' : 'Đã từ chối minh chứng.';
  if (delivery === 'FAILED') return `${result} Email thông báo gửi thất bại.`;
  if (delivery === 'SKIPPED_REPLAY') return `${result} Đây là lần replay nên không gửi lại email.`;
  return `${result} Email thông báo đã được gửi.`;
}
