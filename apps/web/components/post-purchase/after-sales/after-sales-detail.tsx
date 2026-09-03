'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useAuth } from '@/app/auth-provider';
import {
  CollectionLoading,
  ConfirmationDialog,
  DetailGrid,
  DetailPanel,
  EmptyState,
  ErrorState,
  LifecycleJourney,
  PostPurchasePageHeader,
  SafeNotFoundState,
  StatusPill,
} from '@/components/post-purchase';
import { Button, FilePicker, InlineAlert } from '@/components/ui';
import {
  AfterSalesCustomerError,
  cancelAfterSalesRequest,
  getAfterSalesAttachmentUrl,
  getAfterSalesRequest,
  resolveGuestOrderToken,
  uploadAfterSalesAttachment,
  validateAfterSalesAttachment,
  type AfterSalesAttachment,
  type AfterSalesDetail as AfterSalesDetailDto,
} from '@/lib/after-sales-api';
import {
  afterSalesJourney,
  afterSalesNextStep,
  afterSalesStatus,
  afterSalesTypeLabel,
  afterSalesWarrantyLabel,
  attachmentTypeLabel,
  formatCustomerDate,
  formatFileSize,
} from '@/lib/after-sales-presenter';
import styles from './after-sales.module.css';
import { AfterSalesProductSummary } from './product-summary';

export function AfterSalesDetail() {
  const params = useParams<{ requestNumber: string }>();
  const searchParams = useSearchParams();
  const requestNumber = decodeURIComponent(params.requestNumber);
  const orderNumber = searchParams.get('orderNumber');
  const { client, status, user } = useAuth();
  const [storedDetail, setStoredDetail] = useState<AfterSalesDetailDto | null>(null);
  const [detailAccessKey, setDetailAccessKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const guestTokenRef = useRef<string | undefined>(undefined);
  const generationRef = useRef(0);
  const operationRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [retryAction, setRetryAction] = useState<
    { kind: 'detail' } | { attachment: AfterSalesAttachment; kind: 'attachment' } | null
  >(null);
  const isStaff =
    status === 'authenticated' && (user?.role === 'EMPLOYEE' || user?.role === 'ADMIN');

  const accessKey = `${requestNumber}\u0000${orderNumber ?? ''}\u0000${status}\u0000${user?.role ?? ''}\u0000${user?.id ?? ''}`;
  const visibleDetail = detailAccessKey === accessKey ? storedDetail : null;
  const credential = status === 'anonymous' ? guestTokenRef.current : undefined;
  const loadDetail = useCallback(async () => {
    const generation = generationRef.current;
    const next = await getAfterSalesRequest(client, requestNumber, credential);
    if (generationRef.current !== generation) return null;
    setStoredDetail(next);
    setDetailAccessKey(accessKey);
    setNotFound(false);
    setError(null);
    return next;
  }, [accessKey, client, credential, requestNumber]);

  function applySafeNotFound(caught: unknown): boolean {
    if (!(caught instanceof AfterSalesCustomerError) || !caught.notFound) return false;
    setStoredDetail(null);
    setDetailAccessKey('');
    setError(null);
    setNotice(null);
    setRetryAction(null);
    setNotFound(true);
    setCancelOpen(false);
    return true;
  }

  useEffect(() => {
    const generation = ++generationRef.current;
    setStoredDetail(null);
    setDetailAccessKey('');
    setError(null);
    setNotice(null);
    setNotFound(false);
    setBusy(null);
    operationRef.current = null;
    setRetryAction(null);
    setFile(null);
    setFileError(null);
    setCancelOpen(false);
    setCancelReason('');
    setCancelError(null);
    guestTokenRef.current = undefined;
    if (status === 'loading') return;
    if (isStaff) {
      setLoading(false);
      return;
    }
    if (status === 'anonymous') {
      guestTokenRef.current = resolveGuestOrderToken(orderNumber, sessionStorage);
    }
    setLoading(true);
    const token = status === 'anonymous' ? guestTokenRef.current : undefined;
    void getAfterSalesRequest(client, requestNumber, token)
      .then((next) => {
        if (generationRef.current === generation) {
          setStoredDetail(next);
          setDetailAccessKey(accessKey);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (generationRef.current === generation) {
          if (caught instanceof AfterSalesCustomerError && caught.notFound) {
            setNotFound(true);
          } else
            setError(caught instanceof Error ? caught.message : 'Không thể mở yêu cầu hỗ trợ.');
          if (!(caught instanceof AfterSalesCustomerError) || !caught.notFound) {
            setRetryAction({ kind: 'detail' });
          }
        }
      })
      .finally(() => {
        if (generationRef.current === generation) setLoading(false);
      });
    return () => {
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [accessKey, client, isStaff, orderNumber, requestNumber, status]);

  async function retryDetail() {
    const generation = generationRef.current;
    setLoading(true);
    setError(null);
    setRetryAction(null);
    try {
      await loadDetail();
    } catch (caught) {
      if (generationRef.current !== generation) return;
      if (caught instanceof AfterSalesCustomerError && caught.notFound) {
        setNotFound(true);
      } else {
        setError(caught instanceof Error ? caught.message : 'Không thể mở yêu cầu hỗ trợ.');
        setRetryAction({ kind: 'detail' });
      }
    } finally {
      if (generationRef.current === generation) setLoading(false);
    }
  }

  async function upload(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (operationRef.current !== null) return;
    if (file === null) {
      setFileError('Hãy chọn một ảnh hoặc tài liệu PDF.');
      return;
    }
    if ((visibleDetail?.attachments.length ?? 0) >= 5) {
      setError('Yêu cầu này đã có đủ 5 tệp đính kèm.');
      return;
    }
    const validation = validateAfterSalesAttachment(file);
    if (validation) {
      setFileError(validation);
      return;
    }
    const generation = generationRef.current;
    const token = credential;
    const operation = 'upload';
    operationRef.current = operation;
    setBusy('upload');
    setError(null);
    setFileError(null);
    setNotice(null);
    setRetryAction(null);
    try {
      await uploadAfterSalesAttachment(client, requestNumber, file, token);
      if (generationRef.current !== generation) return;
      setFile(null);
      setFileError(null);
      if (fileRef.current) fileRef.current.value = '';
      await loadDetail();
      if (generationRef.current !== generation) return;
      setNotice('Đã thêm ảnh hoặc tài liệu vào yêu cầu.');
    } catch (caught) {
      if (generationRef.current !== generation) return;
      if (applySafeNotFound(caught)) return;
      if (caught instanceof AfterSalesCustomerError && caught.conflict) {
        try {
          await loadDetail();
        } catch {
          /* Keep the conflict message. */
        }
      }
      if (generationRef.current === generation)
        setError(caught instanceof Error ? caught.message : 'Không thể tải tệp lên.');
    } finally {
      if (generationRef.current === generation && operationRef.current === operation) {
        operationRef.current = null;
        setBusy(null);
      }
    }
  }

  async function openAttachment(attachment: AfterSalesAttachment) {
    if (operationRef.current !== null) return;
    const generation = generationRef.current;
    const target = window.open('about:blank', '_blank');
    if (target === null) {
      setError('Trình duyệt đang chặn cửa sổ mở tệp. Hãy cho phép mở cửa sổ mới rồi thử lại.');
      return;
    }
    target.opener = null;
    const operation = `open:${attachment.id}`;
    operationRef.current = operation;
    setBusy(operation);
    setError(null);
    setRetryAction(null);
    try {
      const result = await getAfterSalesAttachmentUrl(
        client,
        requestNumber,
        attachment.id,
        credential,
      );
      if (generationRef.current !== generation) {
        target.close();
        return;
      }
      target.location.replace(result.url);
    } catch (caught) {
      target.close();
      if (generationRef.current !== generation) return;
      if (applySafeNotFound(caught)) return;
      if (generationRef.current === generation) {
        setRetryAction({ attachment, kind: 'attachment' });
        setError(caught instanceof Error ? caught.message : 'Không thể mở tệp. Hãy thử lại.');
      }
    } finally {
      if (generationRef.current === generation && operationRef.current === operation) {
        operationRef.current = null;
        setBusy(null);
      }
    }
  }

  async function cancel() {
    if (operationRef.current !== null) return;
    const reason = cancelReason.trim();
    if (reason.length < 5 || reason.length > 500) {
      setCancelError('Lý do cần có từ 5 đến 500 ký tự.');
      return;
    }
    const generation = generationRef.current;
    const token = credential;
    const operation = 'cancel';
    operationRef.current = operation;
    setCancelError(null);
    setBusy('cancel');
    setError(null);
    setNotice(null);
    setRetryAction(null);
    try {
      await cancelAfterSalesRequest(client, requestNumber, reason, token);
      if (generationRef.current !== generation) return;
      await loadDetail();
      if (generationRef.current !== generation) return;
      setCancelOpen(false);
      setNotice('Yêu cầu hỗ trợ đã được hủy.');
    } catch (caught) {
      if (generationRef.current !== generation) return;
      if (applySafeNotFound(caught)) return;
      if (caught instanceof AfterSalesCustomerError && caught.conflict) {
        try {
          await loadDetail();
        } catch {
          /* Keep the useful conflict notice. */
        }
        if (generationRef.current === generation) {
          setCancelOpen(false);
          setNotice('Yêu cầu vừa được cập nhật. Bạn hãy xem trạng thái mới nhất.');
        }
      } else setError(caught instanceof Error ? caught.message : 'Không thể hủy yêu cầu.');
    } finally {
      if (generationRef.current === generation && operationRef.current === operation) {
        operationRef.current = null;
        setBusy(null);
      }
    }
  }

  if (status === 'loading' || (loading && visibleDetail === null))
    return (
      <div className={styles.page}>
        <PostPurchasePageHeader title="Chi tiết yêu cầu hỗ trợ" />
        <CollectionLoading label="Đang tải yêu cầu hỗ trợ…" />
      </div>
    );
  if (isStaff)
    return (
      <div className={styles.page}>
        <PostPurchasePageHeader title="Chi tiết yêu cầu hỗ trợ" />
        <EmptyState
          title="Khu vực dành cho khách hàng"
          description="Tài khoản nhân viên sử dụng khu vực quản lý hỗ trợ riêng."
          actionHref="/backoffice/after-sales"
          actionLabel="Mở khu vực quản lý"
        />
      </div>
    );
  if (notFound)
    return (
      <div className={styles.page}>
        <PostPurchasePageHeader title="Chi tiết yêu cầu hỗ trợ" />
        <SafeNotFoundState />
      </div>
    );

  const detail = visibleDetail;

  const requestStatus = visibleDetail ? afterSalesStatus(visibleDetail.status) : null;
  const orderHref = visibleDetail
    ? `/orders/${encodeURIComponent(visibleDetail.orderItem.orderNumber)}`
    : '/orders';

  return (
    <div className={styles.page}>
      {!visibleDetail ? <PostPurchasePageHeader title="Chi tiết yêu cầu hỗ trợ" /> : null}
      {visibleDetail ? (
        <PostPurchasePageHeader
          title={requestStatus?.label ?? 'Yêu cầu hỗ trợ'}
          description={
            <span className={styles.detailHeaderMeta}>
              <span>{visibleDetail.requestNumber}</span>
              <span>·</span>
              <span>{afterSalesTypeLabel(visibleDetail.type)}</span>
            </span>
          }
          status={
            requestStatus ? (
              <StatusPill tone={requestStatus.tone}>{requestStatus.label}</StatusPill>
            ) : undefined
          }
        />
      ) : null}
      {error ? (
        <ErrorState
          message={error}
          onRetry={
            retryAction?.kind === 'attachment'
              ? () => void openAttachment(retryAction.attachment)
              : retryAction?.kind === 'detail'
                ? () => void retryDetail()
                : undefined
          }
        />
      ) : null}
      {notice ? <InlineAlert tone="success">{notice}</InlineAlert> : null}
      {!detail && !error ? <SafeNotFoundState /> : null}
      {detail ? (
        <>
          {loading ? (
            <p className={styles.refreshStatus} role="status">
              Đang cập nhật yêu cầu hỗ trợ…
            </p>
          ) : null}
          <LifecycleJourney
            title="Tiến trình xử lý"
            ariaLabel="Các chặng xử lý yêu cầu hỗ trợ"
            currentSummary={afterSalesNextStep(visibleDetail.status)}
            stages={afterSalesJourney(visibleDetail)}
          />
          <DetailGrid>
            <div className={styles.stack}>
              <DetailPanel title="Thông tin yêu cầu">
                <div className={styles.stack}>
                  <AfterSalesProductSummary
                    name={detail.orderItem.productName}
                    secondary={detail.orderItem.variantName}
                  />
                  <dl className={styles.definitionList}>
                    <div>
                      <dt>Vấn đề bạn đã gửi</dt>
                      <dd>{detail.issueDescription}</dd>
                    </div>
                    {detail.requestedResolution ? (
                      <div>
                        <dt>Mong muốn hỗ trợ</dt>
                        <dd>{detail.requestedResolution}</dd>
                      </div>
                    ) : null}
                    {detail.decisionNote ? (
                      <div>
                        <dt>Kết quả kiểm tra</dt>
                        <dd>{detail.decisionNote}</dd>
                      </div>
                    ) : null}
                    {detail.resolutionNote ? (
                      <div>
                        <dt>Phương án hỗ trợ</dt>
                        <dd>{detail.resolutionNote}</dd>
                      </div>
                    ) : null}
                    {detail.cancelReason ? (
                      <div>
                        <dt>Lý do hủy</dt>
                        <dd>{detail.cancelReason}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              </DetailPanel>
              <DetailPanel title="Ảnh và tài liệu">
                <div className={styles.attachmentList}>
                  {detail.attachments.length === 0 ? (
                    <p className={styles.muted}>Chưa có ảnh hoặc tài liệu.</p>
                  ) : null}
                  {detail.attachments.map((attachment, index) => (
                    <div className={styles.attachmentRow} key={attachment.id}>
                      <div className={styles.attachmentCopy}>
                        <strong>
                          {attachmentTypeLabel(attachment.mimeType)} {index + 1}
                        </strong>
                        <span>
                          {formatFileSize(attachment.fileSize)} ·{' '}
                          {formatCustomerDate(attachment.uploadedAt)}
                        </span>
                      </div>
                      <Button
                        variant="secondary"
                        disabled={busy !== null}
                        loading={busy === `open:${attachment.id}`}
                        loadingLabel="Đang mở tệp"
                        onClick={() => void openAttachment(attachment)}
                      >
                        Mở tệp
                      </Button>
                    </div>
                  ))}
                </div>
                {detail.availableActions.includes('UPLOAD_ATTACHMENT') &&
                detail.attachments.length < 5 ? (
                  <form className={styles.form} noValidate onSubmit={(event) => void upload(event)}>
                    <FilePicker
                      ref={fileRef}
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      buttonLabel="Chọn tệp"
                      disabled={busy !== null}
                      emptyLabel="Chưa chọn ảnh hoặc tài liệu"
                      error={fileError}
                      errorRole="alert"
                      hint="Mỗi lần một tệp, tối đa 10 MB; tối đa 5 tệp."
                      id="after-sales-attachment"
                      label="Thêm ảnh hoặc tài liệu"
                      required
                      selectedFileName={file?.name ?? null}
                      onChange={(event) => {
                        setFile(event.target.files?.[0] ?? null);
                        setFileError(null);
                      }}
                    />
                    <Button type="submit" loading={busy === 'upload'} loadingLabel="Đang tải tệp">
                      Thêm tệp
                    </Button>
                  </form>
                ) : null}
              </DetailPanel>
            </div>
            <div className={styles.actionStack}>
              <DetailPanel title="Bước tiếp theo">
                <p>{afterSalesNextStep(detail.status)}</p>
                <div className={styles.actions}>
                  <Link className={styles.secondaryLink} href="/after-sales">
                    Danh sách hỗ trợ
                  </Link>
                  <Link className={styles.secondaryLink} href={orderHref}>
                    Xem đơn hàng
                  </Link>
                  {detail.availableActions.includes('CANCEL') ? (
                    <Button
                      variant="destructive"
                      disabled={busy !== null}
                      onClick={() => {
                        setCancelOpen(true);
                      }}
                    >
                      Hủy yêu cầu
                    </Button>
                  ) : null}
                </div>
              </DetailPanel>
              {detail.warranty ? (
                <DetailPanel title="Bảo hành liên quan">
                  <p>
                    {detail.warranty.warrantyCode} · {afterSalesWarrantyLabel(detail.warranty)}
                  </p>
                  <Link
                    className={styles.secondaryLink}
                    href={`/warranties/${encodeURIComponent(detail.warranty.warrantyCode)}?orderNumber=${encodeURIComponent(detail.orderItem.orderNumber)}`}
                  >
                    Xem bảo hành
                  </Link>
                </DetailPanel>
              ) : null}
            </div>
          </DetailGrid>
          <ConfirmationDialog
            open={cancelOpen}
            title="Hủy yêu cầu hỗ trợ?"
            description={`Yêu cầu ${detail.requestNumber} sẽ kết thúc và không thể tiếp tục xử lý.`}
            confirmLabel="Xác nhận hủy"
            pending={busy === 'cancel'}
            reason={cancelReason}
            reasonLabel="Lý do hủy"
            error={cancelError}
            onReasonChange={(value) => {
              setCancelReason(value);
              setCancelError(null);
            }}
            onClose={() => {
              setCancelOpen(false);
            }}
            onConfirm={() => void cancel()}
          />
        </>
      ) : null}
    </div>
  );
}
