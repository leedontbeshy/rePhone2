'use client';

import { FileArrowUpIcon, TrashIcon, XIcon } from '@phosphor-icons/react/ssr';
import NextLink from 'next/link';
import { useParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type SyntheticEvent,
} from 'react';
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
import { Button, ErrorSummary, IconButton, InlineAlert, Skeleton, Textarea } from '@/components/ui';
import {
  cancelRefund,
  completeBankTransferRefund,
  completeCashRefund,
  getBackofficeRefund,
  getRefundEvidenceUrl,
  REFUND_EVIDENCE_TYPES,
  rejectRefund,
  shouldRefetchRefund,
  startRefundProcessing,
  validateRefundEvidenceFile,
  type RefundAction,
  type RefundDetail,
} from '@/lib/refund-api';
import {
  refundDateTime,
  refundFileSize,
  refundFulfillmentStatusLabel,
  refundMethodLabel,
  refundMoney,
  refundOrderStatusLabel,
  refundPaymentPurposeLabel,
  refundPaymentStatusLabel,
  refundPrimaryAction,
  refundRequesterTypeLabel,
  refundStatusPresentation,
  refundTimeline,
} from './refund-presenter';
import styles from './refunds.module.css';

export type RefundDecision = Exclude<RefundAction, 'VIEW_EVIDENCE'>;

export function RefundDetailView() {
  const params = useParams<{ id: string }>();
  const refundId = decodeURIComponent(params.id);
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [detail, setDetail] = useState<RefundDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'evidence' | RefundDecision | null>(null);
  const [decision, setDecision] = useState<RefundDecision | null>(null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const decisionTriggerRef = useRef<HTMLButtonElement | null>(null);

  const loadRefund = useCallback(async () => {
    const next = await getBackofficeRefund(client, refundId);
    setDetail(next);
    return next;
  }, [client, refundId]);

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (status !== 'authenticated' || !isStaff) return;
    let active = true;
    setLoading(true);
    setError(null);
    void loadRefund()
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'Không thể tải hồ sơ hoàn tiền.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isStaff, loadRefund, status]);

  function openDecision(next: RefundDecision, trigger: HTMLButtonElement) {
    decisionTriggerRef.current = trigger;
    setFieldError(null);
    setDecision(next);
  }

  function closeDecision() {
    setDecision(null);
    setFieldError(null);
    queueMicrotask(() => decisionTriggerRef.current?.focus());
  }

  function clearEvidenceFile() {
    setEvidenceFile(null);
    if (fileInputRef.current !== null) fileInputRef.current.value = '';
  }

  async function openEvidence() {
    if (!detail?.availableActions.includes('VIEW_EVIDENCE')) return;
    const evidenceWindow = window.open('about:blank', '_blank');
    if (evidenceWindow === null) {
      setError('Trình duyệt đang chặn cửa sổ minh chứng. Hãy cho phép rồi thử lại.');
      return;
    }
    evidenceWindow.opener = null;
    setBusy('evidence');
    setError(null);
    try {
      const evidence = await getRefundEvidenceUrl(client, refundId);
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
    if (decision === null || detail === null || !detail.availableActions.includes(decision)) return;
    const validation = validateRefundDecision(decision, note, reason, evidenceFile);
    if (validation !== null) {
      setFieldError(validation);
      return;
    }

    setBusy(decision);
    setFieldError(null);
    setError(null);
    setNotice(null);
    try {
      const next = await runRefundDecision(client, refundId, decision, note, reason, evidenceFile);
      setDetail(next);
      setNotice(refundDecisionNotice(decision));
      if (decision === 'COMPLETE_BANK_TRANSFER') clearEvidenceFile();
      setNote('');
      setReason('');
      closeDecision();
    } catch (caught) {
      setFieldError(caught instanceof Error ? caught.message : 'Không thể cập nhật hoàn tiền.');
      if (shouldRefetchRefund(caught)) {
        try {
          await loadRefund();
        } catch {
          // Giữ lỗi thao tác và dữ liệu biểu mẫu để nhân viên có thể thử tải lại toàn hồ sơ.
        }
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <OperationsShell
      breadcrumbs={[
        { href: '/backoffice', label: 'Tổng quan' },
        { href: '/backoffice/refunds', label: 'Hoàn tiền' },
        { label: detail?.orderNumber ?? 'Hồ sơ' },
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
              void loadRefund().catch((caught: unknown) => {
                setError(
                  caught instanceof Error ? caught.message : 'Không thể tải hồ sơ hoàn tiền.',
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

      {loading && detail === null ? <RefundDetailSkeleton /> : null}
      {!loading && detail === null ? (
        <OperationsPanel title="Không mở được hồ sơ hoàn tiền">
          <NextLink className={styles.rowAction} href="/backoffice/refunds">
            Trở lại danh sách
          </NextLink>
        </OperationsPanel>
      ) : null}
      {detail === null ? null : (
        <RefundRecord
          busy={busy}
          detail={detail}
          onEvidence={() => void openEvidence()}
          onOpenDecision={openDecision}
        />
      )}

      {decision === null || detail === null ? null : (
        <RefundActionDialog
          actionAllowed={detail.availableActions.includes(decision)}
          busy={busy === decision}
          decision={decision}
          error={fieldError}
          evidenceFile={evidenceFile}
          fileInputRef={fileInputRef}
          note={note}
          reason={reason}
          refundAmount={detail.amount}
          onClose={closeDecision}
          onEvidenceFile={(file) => {
            setEvidenceFile(file);
            setFieldError(file === null ? null : validateRefundEvidenceFile(file));
          }}
          onNote={setNote}
          onReason={setReason}
          onRemoveEvidence={clearEvidenceFile}
          onSubmit={(event) => {
            void submitDecision(event);
          }}
        />
      )}
    </OperationsShell>
  );
}

export function RefundRecord({
  busy,
  detail,
  onEvidence,
  onOpenDecision,
}: Readonly<{
  busy: 'evidence' | RefundDecision | null;
  detail: RefundDetail;
  onEvidence: () => void;
  onOpenDecision: (decision: RefundDecision, trigger: HTMLButtonElement) => void;
}>) {
  const refundState = refundStatusPresentation(detail.status);
  const primaryAction = refundPrimaryAction(detail.availableActions);
  const secondaryActions = detail.availableActions.filter(
    (action): action is RefundDecision => action !== 'VIEW_EVIDENCE' && action !== primaryAction,
  );
  const canViewEvidence = detail.availableActions.includes('VIEW_EVIDENCE');
  const timeline = refundTimeline(detail);
  return (
    <>
      <OperationsPageHeader
        description={`Yêu cầu hoàn bằng ${refundMethodLabel(detail.method).toLocaleLowerCase('vi-VN')}`}
        eyebrow="Hồ sơ hoàn tiền"
        meta={
          <>
            <span>{detail.order.customerName}</span>
            <span>Tạo lúc {refundDateTime(detail.createdAt)}</span>
          </>
        }
        title={detail.orderNumber}
      />
      <OperationsStatusAxes
        axes={[
          {
            kind: 'order',
            label: 'Đơn hàng',
            value: refundOrderStatusLabel(detail.order.status),
            tone: detail.order.status === 'CANCELLED' ? 'danger' : 'info',
          },
          {
            kind: 'fulfillment',
            label: 'Giao nhận',
            value: refundFulfillmentStatusLabel(detail.order.fulfillmentStatus),
            tone: detail.order.fulfillmentStatus === 'FAILED' ? 'danger' : 'neutral',
          },
          {
            kind: 'payment',
            label: 'Hoàn tiền',
            value: refundState.label,
            tone: refundState.tone,
          },
        ]}
      />

      <OperationsDetailLayout
        main={
          <>
            <OperationsPanel title="Thông tin hoàn tiền">
              <dl className={styles.detailGrid}>
                <Spec label="Số tiền hoàn" value={refundMoney(detail.amount)} />
                <Spec label="Phương thức" value={refundMethodLabel(detail.method)} />
                <Spec
                  label="Người yêu cầu"
                  value={
                    detail.requester?.fullName ?? refundRequesterTypeLabel(detail.requestedByType)
                  }
                />
                <Spec label="Thời điểm tạo" value={refundDateTime(detail.createdAt)} />
                <Spec label="Lý do" value={detail.reason} wide />
                <Spec label="Ghi chú xử lý" value={detail.note ?? 'Chưa có'} wide />
              </dl>
              {detail.terminalReason === null || detail.terminalReason === undefined ? null : (
                <InlineAlert
                  title={detail.status === 'REJECTED' ? 'Lý do từ chối' : 'Lý do hủy'}
                  tone={detail.status === 'REJECTED' ? 'danger' : 'warning'}
                >
                  {detail.terminalReason}
                </InlineAlert>
              )}
              {detail.evidenceAvailable ? (
                <div className={styles.evidenceCard}>
                  <span className={styles.evidenceCopy}>
                    <strong>Minh chứng hoàn tiền</strong>
                    <span>
                      {canViewEvidence
                        ? 'Mỗi lần mở sẽ lấy bản xem mới.'
                        : 'Minh chứng được lưu cùng hồ sơ đã hoàn tất.'}
                    </span>
                  </span>
                  {canViewEvidence ? (
                    <Button
                      disabled={busy !== null}
                      iconLeading={<FileArrowUpIcon aria-hidden="true" size={20} />}
                      loading={busy === 'evidence'}
                      loadingLabel="Đang mở minh chứng"
                      variant="secondary"
                      onClick={onEvidence}
                    >
                      Mở minh chứng
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </OperationsPanel>

            <OperationsPanel title="Đơn hàng và khách hàng">
              <dl className={styles.detailGrid}>
                <Spec label="Khách hàng" value={detail.order.customerName} />
                <Spec label="Email" value={detail.order.customerEmail} />
                <Spec
                  label="Tình trạng thanh toán"
                  value={refundPaymentStatusLabel(detail.order.paymentStatus)}
                />
                <Spec label="Mã đơn" value={detail.order.orderNumber} />
              </dl>
              <NextLink className={styles.rowAction} href={`/backoffice/orders/${detail.order.id}`}>
                Mở chi tiết đơn hàng
              </NextLink>
            </OperationsPanel>

            {detail.payment === null || detail.payment === undefined ? null : (
              <OperationsPanel title="Khoản thanh toán liên quan">
                <dl className={styles.detailGrid}>
                  <Spec
                    label="Nội dung thu"
                    value={refundPaymentPurposeLabel(detail.payment.purpose)}
                  />
                  <Spec label="Phương thức thu" value={refundMethodLabel(detail.payment.method)} />
                  <Spec
                    label="Số tiền dự kiến"
                    value={refundMoney(detail.payment.expectedAmount)}
                  />
                  <Spec
                    label="Số tiền đã nhận"
                    value={
                      detail.payment.receivedAmount === null ||
                      detail.payment.receivedAmount === undefined
                        ? 'Chưa xác nhận'
                        : refundMoney(detail.payment.receivedAmount)
                    }
                  />
                </dl>
              </OperationsPanel>
            )}

            <OperationsPanel title="Lịch sử xử lý">
              <OperationsTimeline
                items={timeline.map((item) => ({
                  at: refundDateTime(item.at),
                  description: item.description,
                  label: item.label,
                  state: item.state,
                }))}
              />
            </OperationsPanel>
          </>
        }
        rail={
          <>
            <OperationsActionRail
              description={refundActionDescription(primaryAction, detail)}
              primary={
                primaryAction === null ? undefined : (
                  <RefundActionButton
                    action={primaryAction}
                    busy={busy}
                    onOpenDecision={onOpenDecision}
                  />
                )
              }
              supporting={
                <>
                  {secondaryActions.map((action) => (
                    <RefundActionButton
                      action={action}
                      busy={busy}
                      key={action}
                      supporting
                      onOpenDecision={onOpenDecision}
                    />
                  ))}
                  <NextLink className={styles.rowAction} href="/backoffice/refunds">
                    Trở lại danh sách
                  </NextLink>
                </>
              }
              title="Xử lý hoàn tiền"
            >
              {primaryAction === null ? (
                <div className={styles.railComplete}>
                  <strong>{refundState.label}</strong>
                  {detail.processor === null || detail.processor === undefined ? null : (
                    <p>Người xử lý: {detail.processor.fullName}</p>
                  )}
                  {detail.note === null || detail.note === undefined ? null : <p>{detail.note}</p>}
                </div>
              ) : null}
            </OperationsActionRail>
            <OperationsMoneySummary
              rows={[
                {
                  label: 'Số tiền yêu cầu hoàn',
                  value: refundMoney(detail.amount),
                  emphasis: 'primary',
                },
                { label: 'Tổng đơn', value: refundMoney(detail.order.grandTotal) },
                { label: 'Đã thu', value: refundMoney(detail.order.paidAmount) },
                { label: 'Đã hoàn', value: refundMoney(detail.order.refundedAmount) },
                { label: 'Còn phải thu', value: refundMoney(detail.order.balanceDue) },
              ]}
            />
          </>
        }
      />
    </>
  );
}

function RefundActionButton({
  action,
  busy,
  supporting = false,
  onOpenDecision,
}: Readonly<{
  action: RefundDecision;
  busy: 'evidence' | RefundDecision | null;
  supporting?: boolean;
  onOpenDecision: (decision: RefundDecision, trigger: HTMLButtonElement) => void;
}>) {
  return (
    <Button
      disabled={busy !== null}
      variant={action === 'REJECT' ? 'destructive' : supporting ? 'secondary' : 'primary'}
      onClick={(event) => {
        onOpenDecision(action, event.currentTarget);
      }}
    >
      {refundActionLabel(action)}
    </Button>
  );
}

export function RefundActionDialog({
  actionAllowed,
  busy,
  decision,
  error,
  evidenceFile,
  fileInputRef,
  note,
  reason,
  refundAmount,
  onClose,
  onEvidenceFile,
  onNote,
  onReason,
  onRemoveEvidence,
  onSubmit,
}: Readonly<{
  actionAllowed: boolean;
  busy: boolean;
  decision: RefundDecision;
  error: string | null;
  evidenceFile: File | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  note: string;
  reason: string;
  refundAmount: string;
  onClose: () => void;
  onEvidenceFile: (file: File | null) => void;
  onNote: (value: string) => void;
  onReason: (value: string) => void;
  onRemoveEvidence: () => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useModalDialog(dialogRef);
  const asksForReason = decision === 'REJECT' || decision === 'CANCEL';
  const asksForEvidence = decision === 'COMPLETE_BANK_TRANSFER';
  const asksForNote = !asksForReason;
  return (
    <dialog
      aria-describedby="refund-action-description"
      aria-labelledby="refund-action-title"
      className={styles.dialog}
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form noValidate onSubmit={onSubmit}>
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="refund-action-title">{refundActionLabel(decision)}</h2>
            <p id="refund-action-description">Số tiền hoàn: {refundMoney(refundAmount)}</p>
          </div>
          <IconButton aria-label="Đóng" disabled={busy} variant="ghost" onClick={onClose}>
            <XIcon aria-hidden="true" size={22} />
          </IconButton>
        </header>
        <div className={styles.dialogBody}>
          <ErrorSummary errors={error === null ? [] : [{ message: error }]} />
          {!actionAllowed ? (
            <InlineAlert title="Hồ sơ đã thay đổi" tone="warning">
              Thao tác này không còn được phép trên dữ liệu mới nhất.
            </InlineAlert>
          ) : null}
          {asksForEvidence ? (
            <div className={styles.fileField}>
              <span className={styles.fileLabel} id="refund-evidence-label">
                Minh chứng chuyển khoản *
              </span>
              <input
                accept={REFUND_EVIDENCE_TYPES.join(',')}
                aria-labelledby="refund-evidence-label"
                className={styles.fileInput}
                id="refund-evidence"
                ref={fileInputRef}
                type="file"
                onChange={(event) => {
                  onEvidenceFile(event.target.files?.[0] ?? null);
                }}
              />
              {evidenceFile === null ? (
                <label className={styles.filePicker} htmlFor="refund-evidence">
                  <FileArrowUpIcon aria-hidden="true" size={26} />
                  <span>
                    <strong>Chọn minh chứng</strong>
                    <small>JPEG, PNG, WebP hoặc PDF · tối đa 10 MB</small>
                  </span>
                </label>
              ) : (
                <div className={styles.selectedFile}>
                  <FileArrowUpIcon aria-hidden="true" size={24} />
                  <span>
                    <strong>{evidenceFile.name}</strong>
                    <small>{refundFileSize(evidenceFile.size)}</small>
                  </span>
                  <IconButton
                    aria-label="Bỏ tệp đã chọn"
                    disabled={busy}
                    variant="ghost"
                    onClick={onRemoveEvidence}
                  >
                    <TrashIcon aria-hidden="true" size={20} />
                  </IconButton>
                </div>
              )}
            </div>
          ) : null}
          {asksForNote ? (
            <Textarea
              id="refund-action-note"
              label={decision === 'START_PROCESSING' ? 'Ghi chú' : 'Ghi chú hoàn tất'}
              hint={
                decision === 'START_PROCESSING'
                  ? 'Có thể để trống; nếu nhập cần ít nhất 5 ký tự.'
                  : 'Ghi rõ cách đã bàn giao hoặc chuyển tiền.'
              }
              maxLength={500}
              minLength={decision === 'START_PROCESSING' ? undefined : 5}
              required={decision !== 'START_PROCESSING'}
              value={note}
              onChange={(event) => {
                onNote(event.target.value);
              }}
            />
          ) : null}
          {asksForReason ? (
            <Textarea
              id="refund-action-reason"
              label={decision === 'REJECT' ? 'Lý do từ chối' : 'Lý do hủy'}
              maxLength={500}
              minLength={5}
              required
              value={reason}
              onChange={(event) => {
                onReason(event.target.value);
              }}
            />
          ) : null}
        </div>
        <footer className={styles.dialogActions}>
          <Button disabled={busy} variant="secondary" onClick={onClose}>
            Quay lại
          </Button>
          <Button
            disabled={!actionAllowed}
            loading={busy}
            loadingLabel="Đang cập nhật"
            type="submit"
            variant={decision === 'REJECT' ? 'destructive' : 'primary'}
          >
            {refundActionLabel(decision)}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}

export function validateRefundDecision(
  decision: RefundDecision,
  note: string,
  reason: string,
  evidenceFile: File | null,
): string | null {
  if (decision === 'REJECT' || decision === 'CANCEL') {
    return validRequiredText(reason, decision === 'REJECT' ? 'Lý do từ chối' : 'Lý do hủy');
  }
  const normalizedNote = note.trim();
  if (decision === 'START_PROCESSING') {
    if (normalizedNote.length === 0) return null;
    return validRequiredText(normalizedNote, 'Ghi chú');
  }
  const noteError = validRequiredText(normalizedNote, 'Ghi chú hoàn tất');
  if (noteError !== null) return noteError;
  if (decision === 'COMPLETE_BANK_TRANSFER') {
    if (evidenceFile === null) return 'Hãy chọn minh chứng chuyển khoản.';
    return validateRefundEvidenceFile(evidenceFile);
  }
  return null;
}

async function runRefundDecision(
  client: unknown,
  refundId: string,
  decision: RefundDecision,
  note: string,
  reason: string,
  evidenceFile: File | null,
): Promise<RefundDetail> {
  if (decision === 'START_PROCESSING') {
    const normalized = note.trim();
    return startRefundProcessing(
      client,
      refundId,
      normalized.length === 0 ? undefined : normalized,
    );
  }
  if (decision === 'COMPLETE_CASH') {
    return completeCashRefund(client, refundId, note.trim());
  }
  if (decision === 'COMPLETE_BANK_TRANSFER') {
    if (evidenceFile === null) throw new Error('Hãy chọn minh chứng chuyển khoản.');
    return completeBankTransferRefund(client, refundId, evidenceFile, note.trim());
  }
  if (decision === 'REJECT') return rejectRefund(client, refundId, reason.trim());
  return cancelRefund(client, refundId, reason.trim());
}

function refundActionDescription(action: RefundAction | null, detail: RefundDetail): string {
  if (action === 'START_PROCESSING') return 'Nhận hồ sơ trước khi thực hiện hoàn tiền.';
  if (action === 'COMPLETE_BANK_TRANSFER') {
    return `Lưu minh chứng sau khi đã chuyển ${refundMoney(detail.amount)}.`;
  }
  if (action === 'COMPLETE_CASH') {
    return `Xác nhận đã bàn giao đủ ${refundMoney(detail.amount)}.`;
  }
  if (action === 'REJECT') return 'Yêu cầu này chỉ có thể được từ chối hoặc hủy.';
  if (action === 'CANCEL') return 'Hủy yêu cầu khi không còn cần hoàn tiền.';
  return 'Hồ sơ hiện không còn thao tác thay đổi trạng thái.';
}

function refundActionLabel(action: RefundDecision): string {
  if (action === 'START_PROCESSING') return 'Nhận xử lý';
  if (action === 'COMPLETE_BANK_TRANSFER') return 'Xác nhận đã chuyển khoản';
  if (action === 'COMPLETE_CASH') return 'Xác nhận đã hoàn tiền mặt';
  if (action === 'REJECT') return 'Từ chối yêu cầu';
  return 'Hủy yêu cầu';
}

function refundDecisionNotice(decision: RefundDecision): string {
  if (decision === 'START_PROCESSING') return 'Đã nhận xử lý yêu cầu hoàn tiền.';
  if (decision === 'COMPLETE_BANK_TRANSFER') return 'Đã hoàn tất chuyển khoản và lưu minh chứng.';
  if (decision === 'COMPLETE_CASH') return 'Đã xác nhận hoàn tiền mặt.';
  if (decision === 'REJECT') return 'Đã từ chối yêu cầu hoàn tiền.';
  return 'Đã hủy yêu cầu hoàn tiền.';
}

function validRequiredText(value: string, label: string): string | null {
  const length = value.trim().length;
  if (length < 5) return `${label} cần ít nhất 5 ký tự.`;
  if (length > 500) return `${label} không được vượt quá 500 ký tự.`;
  return null;
}

function useModalDialog(dialogRef: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    dialog.querySelector<HTMLElement>('input, textarea, button')?.focus();
    return () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
    };
  }, [dialogRef]);
}

function RefundDetailSkeleton() {
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
      <span className="rp-visually-hidden">Đang tải hồ sơ hoàn tiền…</span>
    </section>
  );
}

function Spec({
  label,
  value,
  wide = false,
}: Readonly<{ label: string; value: string; wide?: boolean }>) {
  return (
    <div className={styles.spec} data-wide={wide || undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
