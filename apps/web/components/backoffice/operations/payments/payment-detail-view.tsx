'use client';

import { FileArrowUpIcon, XIcon } from '@phosphor-icons/react/ssr';
import NextLink from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useAuth } from '@/app/auth-provider';
import {
  OperationsActionRail,
  OperationsDetailLayout,
  OperationsMoneySummary,
  OperationsPageHeader,
  OperationsPanel,
  OperationsStatusAxes,
  OperationsTimeline,
} from '@/components/backoffice/operations/operations-primitives';
import { OperationsShell } from '@/components/backoffice/operations/operations-shell';
import {
  Button,
  ErrorSummary,
  IconButton,
  InlineAlert,
  Input,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { useModalDialogLifecycle } from '@/components/ui/modal-dialog-lifecycle';
import {
  getBackofficePayment,
  getPaymentEvidenceUrl,
  rejectPayment,
  verifyPayment,
  type BackofficePaymentDetail,
  type ReviewPaymentResult,
} from '@/lib/payment-api';
import {
  paymentDateTime,
  paymentFulfillmentStatusLabel,
  paymentMethodLabel,
  paymentOrderPaymentStatusLabel,
  paymentOrderStatusLabel,
  paymentPurposeLabel,
  paymentStatusPresentation,
} from './payment-presenter';
import styles from './payments.module.css';

type PaymentDecision = 'verify' | 'reject';

export function PaymentDetailView() {
  const params = useParams<{ id: string }>();
  const paymentId = decodeURIComponent(params.id);
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [detail, setDetail] = useState<BackofficePaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'evidence' | PaymentDecision | null>(null);
  const [decision, setDecision] = useState<PaymentDecision | null>(null);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [verifyNote, setVerifyNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const loadPayment = useCallback(async () => {
    const next = await getBackofficePayment(client, paymentId);
    setDetail(next);
    setReceivedAmount((current) => current || next.payment.expectedAmount);
    return next;
  }, [client, paymentId]);

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (status !== 'authenticated' || !isStaff) return;
    let active = true;
    setLoading(true);
    setError(null);
    void loadPayment()
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'Không thể tải hồ sơ thanh toán.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isStaff, loadPayment, status]);

  function openDecision(next: PaymentDecision) {
    setFieldError(null);
    setDecision(next);
  }

  function closeDecision() {
    setDecision(null);
    setFieldError(null);
  }

  async function openEvidence() {
    const evidenceWindow = window.open('about:blank', '_blank');
    if (evidenceWindow === null) {
      setError('Trình duyệt đang chặn cửa sổ minh chứng. Hãy cho phép rồi thử lại.');
      return;
    }
    evidenceWindow.opener = null;
    setBusy('evidence');
    setError(null);
    try {
      const evidence = await getPaymentEvidenceUrl(client, paymentId);
      evidenceWindow.location.replace(evidence.url);
    } catch (caught) {
      evidenceWindow.close();
      setError(caught instanceof Error ? caught.message : 'Không thể mở minh chứng lúc này.');
    } finally {
      setBusy(null);
    }
  }

  async function submitDecision(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (decision === null || detail === null) return;
    const validation = validateDecision(
      decision,
      receivedAmount,
      verifyNote,
      rejectReason,
      detail.payment.expectedAmount,
    );
    if (validation !== null) {
      setFieldError(validation);
      return;
    }

    setBusy(decision);
    setFieldError(null);
    setError(null);
    setNotice(null);
    try {
      const result =
        decision === 'verify'
          ? await verifyPayment(client, paymentId, {
              receivedAmount: receivedAmount.trim(),
              ...(verifyNote.trim().length === 0 ? {} : { note: verifyNote.trim() }),
            })
          : await rejectPayment(client, paymentId, { reason: rejectReason.trim() });
      await loadPayment();
      setNotice(reviewNotice(decision, result.notificationDelivery));
      closeDecision();
    } catch (caught) {
      setFieldError(caught instanceof Error ? caught.message : 'Không thể cập nhật thanh toán.');
      try {
        const refreshed = await loadPayment();
        const requiredAction = decision === 'verify' ? 'VERIFY' : 'REJECT';
        if (!refreshed.availableActions.includes(requiredAction)) closeDecision();
      } catch {
        // Giữ lỗi thao tác đang hiển thị; nút tải lại toàn hồ sơ nằm ngoài hộp thoại.
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <OperationsShell
      breadcrumbs={[
        { href: '/backoffice', label: 'Tổng quan' },
        { href: '/backoffice/payments', label: 'Duyệt thanh toán' },
        { label: detail?.order.orderNumber ?? 'Hồ sơ' },
      ]}
    >
      {error === null ? null : (
        <InlineAlert ref={errorRef} tabIndex={-1} title="Chưa thể tiếp tục" tone="danger">
          <p>{error}</p>
          <Button
            size="compact"
            variant="secondary"
            onClick={() => {
              setError(null);
              void loadPayment().catch((caught: unknown) => {
                setError(
                  caught instanceof Error ? caught.message : 'Không thể tải hồ sơ thanh toán.',
                );
              });
            }}
          >
            Tải lại hồ sơ
          </Button>
        </InlineAlert>
      )}
      {notice === null ? null : (
        <InlineAlert title="Đã cập nhật" tone="success">
          {notice}
        </InlineAlert>
      )}

      {loading && detail === null ? <PaymentDetailSkeleton /> : null}
      {!loading && detail === null ? (
        <OperationsPanel title="Không mở được hồ sơ thanh toán">
          <NextLink className={styles.rowAction} href="/backoffice/payments">
            Trở lại danh sách
          </NextLink>
        </OperationsPanel>
      ) : null}
      {detail === null ? null : (
        <PaymentRecord
          busy={busy}
          detail={detail}
          onEvidence={() => void openEvidence()}
          onOpenDecision={openDecision}
        />
      )}

      {decision === null || detail === null ? null : (
        <PaymentDecisionDialog
          busy={busy === decision}
          decision={decision}
          error={fieldError}
          expectedAmount={detail.payment.expectedAmount}
          receivedAmount={receivedAmount}
          rejectReason={rejectReason}
          verifyNote={verifyNote}
          onClose={closeDecision}
          onReceivedAmount={setReceivedAmount}
          onRejectReason={setRejectReason}
          onSubmit={submitDecision}
          onVerifyNote={setVerifyNote}
        />
      )}
    </OperationsShell>
  );
}

export function PaymentRecord({
  busy,
  detail,
  onEvidence,
  onOpenDecision,
}: Readonly<{
  busy: 'evidence' | PaymentDecision | null;
  detail: BackofficePaymentDetail;
  onEvidence: () => void;
  onOpenDecision: (decision: PaymentDecision) => void;
}>) {
  const paymentState = paymentStatusPresentation(detail.payment.status);
  const canVerify = detail.availableActions.includes('VERIFY');
  const canReject = detail.availableActions.includes('REJECT');
  const canViewEvidence = detail.availableActions.includes('VIEW_EVIDENCE');
  return (
    <>
      <OperationsPageHeader
        description={`${paymentPurposeLabel(detail.payment.purpose)} · ${paymentMethodLabel(detail.payment.method)}`}
        eyebrow="Hồ sơ thanh toán"
        meta={
          <>
            <span>{detail.order.contact?.fullName ?? 'Khách hàng'}</span>
            <span>Nộp lúc {paymentDateTime(detail.payment.submittedAt)}</span>
          </>
        }
        title={detail.order.orderNumber}
      />
      <OperationsStatusAxes
        axes={[
          {
            kind: 'order',
            label: 'Đơn hàng',
            value: paymentOrderStatusLabel(detail.order.status),
            tone: detail.order.status === 'CANCELLED' ? 'danger' : 'info',
          },
          {
            kind: 'fulfillment',
            label: 'Giao nhận',
            value: paymentFulfillmentStatusLabel(detail.order.fulfillmentStatus),
            tone: detail.order.fulfillmentStatus === 'FAILED' ? 'danger' : 'neutral',
          },
          {
            kind: 'payment',
            label: 'Thanh toán',
            value: paymentState.label,
            tone: paymentState.tone,
          },
        ]}
      />

      <OperationsDetailLayout
        main={
          <>
            {detail.payment.reviewOverdue ? (
              <InlineAlert title="Khoản thanh toán đã chờ quá hạn" tone="warning">
                Hãy ưu tiên đối chiếu minh chứng và số tiền đã nhận.
              </InlineAlert>
            ) : null}
            <OperationsPanel title="Đối chiếu giao dịch">
              <dl className={styles.detailGrid}>
                <Spec label="Số tiền dự kiến" value={money(detail.payment.expectedAmount)} />
                <Spec
                  label="Số tiền đã xác nhận"
                  value={
                    detail.payment.receivedAmount === null
                      ? 'Chưa xác nhận'
                      : money(detail.payment.receivedAmount)
                  }
                />
                <Spec label="Phương thức" value={paymentMethodLabel(detail.payment.method)} />
                <Spec
                  label="Nội dung chuyển khoản"
                  value={detail.payment.transferContent ?? 'Không có'}
                />
                <Spec label="Thời điểm nộp" value={paymentDateTime(detail.payment.submittedAt)} />
                <Spec label="Hạn kiểm tra" value={paymentDateTime(detail.payment.reviewSlaDueAt)} />
              </dl>
              <div className={styles.evidenceCard}>
                <span className={styles.evidenceCopy}>
                  <strong>Minh chứng thanh toán</strong>
                  <span>
                    {canViewEvidence
                      ? 'Mỗi lần mở sẽ lấy bản xem mới.'
                      : 'Chưa có minh chứng để xem.'}
                  </span>
                </span>
                <Button
                  disabled={!canViewEvidence || busy !== null}
                  iconLeading={<FileArrowUpIcon aria-hidden="true" size={20} />}
                  loading={busy === 'evidence'}
                  loadingLabel="Đang mở minh chứng"
                  variant="secondary"
                  onClick={onEvidence}
                >
                  Mở minh chứng
                </Button>
              </div>
              {detail.payment.rejectionReason === null ? null : (
                <InlineAlert title="Lý do từ chối" tone="danger">
                  {detail.payment.rejectionReason}
                </InlineAlert>
              )}
            </OperationsPanel>

            <OperationsPanel title="Sản phẩm và khách hàng">
              <div className={styles.contactGrid}>
                <dl className={styles.spec}>
                  <dt>Khách hàng</dt>
                  <dd>{detail.order.contact?.fullName ?? 'Chưa có'}</dd>
                  <dd>{detail.order.contact?.phone ?? ''}</dd>
                  <dd>{detail.order.contact?.email ?? ''}</dd>
                </dl>
                <dl className={styles.spec}>
                  <dt>Tình trạng thu tiền</dt>
                  <dd>{paymentOrderPaymentStatusLabel(detail.order.paymentStatus)}</dd>
                </dl>
              </div>
              <ul className={styles.orderItems}>
                {detail.order.items.map((item) => (
                  <li key={item.id}>
                    <span className={styles.itemCopy}>
                      <strong>{item.productName}</strong>
                      <span>{item.variantName}</span>
                    </span>
                    <span className={styles.itemPrice}>
                      <strong>{money(item.lineTotal)}</strong>
                      <span>Số lượng {String(item.quantity)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </OperationsPanel>

            {detail.timeline.length === 0 ? null : (
              <OperationsPanel title="Lịch sử xử lý">
                <OperationsTimeline
                  items={detail.timeline.map((item, index) => ({
                    label: item.label,
                    at: paymentDateTime(item.at),
                    state: index === detail.timeline.length - 1 ? 'current' : 'complete',
                  }))}
                />
              </OperationsPanel>
            )}
          </>
        }
        rail={
          <>
            <OperationsActionRail
              description={
                canVerify
                  ? 'Đối chiếu đúng số tiền trước khi xác nhận.'
                  : canReject
                    ? 'Hồ sơ chỉ còn thao tác từ chối.'
                    : 'Hồ sơ hiện không còn thao tác cần xử lý.'
              }
              primary={
                canVerify ? (
                  <Button
                    disabled={busy !== null}
                    onClick={() => {
                      onOpenDecision('verify');
                    }}
                  >
                    Xác nhận thanh toán
                  </Button>
                ) : canReject ? (
                  <Button
                    disabled={busy !== null}
                    variant="destructive"
                    onClick={() => {
                      onOpenDecision('reject');
                    }}
                  >
                    Từ chối minh chứng
                  </Button>
                ) : undefined
              }
              supporting={
                <>
                  {canVerify && canReject ? (
                    <Button
                      disabled={busy !== null}
                      variant="secondary"
                      onClick={() => {
                        onOpenDecision('reject');
                      }}
                    >
                      Từ chối minh chứng
                    </Button>
                  ) : null}
                  <NextLink className={styles.rowAction} href="/backoffice/payments">
                    Trở lại danh sách
                  </NextLink>
                </>
              }
              title="Xử lý thanh toán"
            >
              {!canVerify && !canReject ? (
                <div className={styles.railComplete}>
                  <strong>{paymentState.label}</strong>
                  {detail.reviewer === null ? null : <p>Người xử lý: {detail.reviewer.fullName}</p>}
                  {detail.reviewNote === null ? null : <p>{detail.reviewNote}</p>}
                </div>
              ) : null}
            </OperationsActionRail>
            <OperationsMoneySummary
              rows={[
                { label: 'Tổng đơn', value: moneyOrEmpty(detail.order.grandTotal) },
                { label: 'Cọc yêu cầu', value: moneyOrEmpty(detail.order.depositRequired) },
                { label: 'Đã thu', value: moneyOrEmpty(detail.order.paidAmount) },
                { label: 'Đã hoàn', value: moneyOrEmpty(detail.order.refundedAmount) },
                {
                  label: 'Còn phải thu',
                  value: moneyOrEmpty(detail.order.balanceDue),
                  emphasis: 'primary',
                },
              ]}
            />
          </>
        }
      />
    </>
  );
}

function PaymentDecisionDialog({
  busy,
  decision,
  error,
  expectedAmount,
  receivedAmount,
  rejectReason,
  verifyNote,
  onClose,
  onReceivedAmount,
  onRejectReason,
  onSubmit,
  onVerifyNote,
}: Readonly<{
  busy: boolean;
  decision: PaymentDecision;
  error: string | null;
  expectedAmount: string;
  receivedAmount: string;
  rejectReason: string;
  verifyNote: string;
  onClose: () => void;
  onReceivedAmount: (value: string) => void;
  onRejectReason: (value: string) => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => Promise<void>;
  onVerifyNote: (value: string) => void;
}>) {
  const { dialogRef, onDialogClose } = useModalDialogLifecycle(true);
  const verify = decision === 'verify';
  return (
    <dialog
      aria-describedby="payment-decision-description"
      aria-labelledby="payment-decision-title"
      className={styles.dialog}
      ref={dialogRef}
      onClose={onDialogClose}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        noValidate
        onSubmit={(event) => {
          void onSubmit(event);
        }}
      >
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="payment-decision-title">
              {verify ? 'Xác nhận thanh toán' : 'Từ chối minh chứng'}
            </h2>
            <p id="payment-decision-description">
              {verify
                ? `Số tiền dự kiến: ${money(expectedAmount)}`
                : 'Từ chối sẽ hủy đơn và giải phóng hàng đang giữ.'}
            </p>
          </div>
          <IconButton aria-label="Đóng" disabled={busy} variant="ghost" onClick={onClose}>
            <XIcon aria-hidden="true" size={22} />
          </IconButton>
        </header>
        <div className={styles.dialogBody}>
          <ErrorSummary errors={error === null ? [] : [{ message: error }]} />
          {verify ? (
            <>
              <Input
                error={
                  error !== null && !/^[1-9]\d{0,14}$/.test(receivedAmount.trim())
                    ? error
                    : undefined
                }
                id="received-amount"
                inputMode="numeric"
                label="Số tiền đã nhận (đồng)"
                maxLength={15}
                required
                value={receivedAmount}
                onChange={(event) => {
                  onReceivedAmount(event.target.value.replace(/\D/g, ''));
                }}
              />
              <Textarea
                id="payment-review-note"
                label="Ghi chú"
                maxLength={500}
                hint="Bắt buộc khi số tiền khác dự kiến."
                value={verifyNote}
                onChange={(event) => {
                  onVerifyNote(event.target.value);
                }}
              />
            </>
          ) : (
            <Textarea
              error={error !== null && rejectReason.trim().length < 5 ? error : undefined}
              id="payment-reject-reason"
              label="Lý do từ chối"
              minLength={5}
              maxLength={500}
              required
              value={rejectReason}
              onChange={(event) => {
                onRejectReason(event.target.value);
              }}
            />
          )}
        </div>
        <footer className={styles.dialogActions}>
          <Button disabled={busy} variant="secondary" onClick={onClose}>
            Quay lại
          </Button>
          <Button
            loading={busy}
            loadingLabel={verify ? 'Đang xác nhận' : 'Đang từ chối'}
            type="submit"
            variant={verify ? 'primary' : 'destructive'}
          >
            {verify ? 'Xác nhận thanh toán' : 'Từ chối minh chứng'}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}

function PaymentDetailSkeleton() {
  return (
    <section className={styles.detailSkeleton} aria-label="Đang tải hồ sơ" role="status">
      <div>
        {[1, 2, 3].map((item) => (
          <div className={styles.skeletonPanel} key={item}>
            <Skeleton height="1.5rem" width="35%" />
            <Skeleton height="5rem" width="100%" />
          </div>
        ))}
      </div>
      <div className={styles.skeletonPanel}>
        <Skeleton height="1.5rem" width="60%" />
        <Skeleton height="3rem" width="100%" />
      </div>
      <span className="rp-visually-hidden">Đang tải hồ sơ thanh toán…</span>
    </section>
  );
}

function Spec({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className={styles.spec}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function validateDecision(
  decision: PaymentDecision,
  receivedAmount: string,
  verifyNote: string,
  rejectReason: string,
  expectedAmount: string,
): string | null {
  if (decision === 'reject') {
    return rejectReason.trim().length < 5 ? 'Lý do từ chối cần ít nhất 5 ký tự.' : null;
  }
  const normalized = receivedAmount.trim();
  if (!/^[1-9]\d{0,14}$/.test(normalized)) {
    return 'Số tiền đã nhận phải có từ 1 đến 15 chữ số và không bắt đầu bằng 0.';
  }
  if (normalized !== expectedAmount && verifyNote.trim().length < 5) {
    return 'Hãy ghi chú ít nhất 5 ký tự khi số tiền khác dự kiến.';
  }
  return null;
}

function reviewNotice(
  decision: PaymentDecision,
  delivery: ReviewPaymentResult['notificationDelivery'],
): string {
  const result = decision === 'verify' ? 'Đã xác nhận khoản thanh toán.' : 'Đã từ chối minh chứng.';
  if (delivery === 'FAILED') return `${result} Thông báo cho khách chưa gửi được.`;
  if (delivery === 'SKIPPED_REPLAY') return `${result} Không gửi lại thông báo.`;
  return `${result} Đã gửi thông báo cho khách.`;
}

function moneyOrEmpty(value: string | null): string {
  return value === null ? 'Chưa có' : money(value);
}

function money(value: string): string {
  const amount = Number(value);
  return `${Number.isFinite(amount) ? amount.toLocaleString('vi-VN') : '0'} đ`;
}
