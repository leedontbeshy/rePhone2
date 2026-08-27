'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  cancelAfterSalesRequest,
  getAfterSalesAttachmentUrl,
  getAfterSalesRequest,
  resolveGuestOrderToken,
  uploadAfterSalesAttachment,
  validateAfterSalesAttachment,
  type AfterSalesAttachment,
  type AfterSalesDetail,
  type AfterSalesStatus,
  type AfterSalesType,
} from '../../../lib/after-sales-api';
import { useAuth } from '../../auth-provider';
import { CatalogHeader } from '../../catalog-ui';

export default function CustomerAfterSalesDetailPage() {
  const params = useParams<{ requestNumber: string }>();
  const requestNumber = decodeURIComponent(params.requestNumber);
  const { client, status, user } = useAuth();
  const isCustomer = user?.role === 'CUSTOMER';
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [accessReady, setAccessReady] = useState(false);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [detail, setDetail] = useState<AfterSalesDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [cancelReason, setCancelReason] = useState('Tôi không còn nhu cầu xử lý yêu cầu này');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const tokenRef = useRef<string | undefined>(undefined);
  const errorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const publicOrderNumber = new URLSearchParams(window.location.search).get('orderNumber');
    tokenRef.current = resolveGuestOrderToken(publicOrderNumber, sessionStorage);
    setOrderNumber(publicOrderNumber);
    setAccessReady(true);
  }, []);

  const loadDetail = useCallback(async () => {
    const next = await getAfterSalesRequest(client, requestNumber, tokenRef.current);
    setDetail(next);
    setError(null);
  }, [client, requestNumber]);

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (!accessReady || status === 'loading' || isStaff) return;
    if (status === 'anonymous' && tokenRef.current === undefined) return;
    let active = true;
    setLoading(true);
    void loadDetail()
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught, 'Không thể mở yêu cầu hậu mãi.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessReady, isStaff, loadDetail, status]);

  const upload = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (file === null) {
      setError('Hãy chọn một tệp JPEG, PNG, WebP hoặc PDF.');
      return;
    }
    const validation = validateAfterSalesAttachment(file);
    if (validation !== null) {
      setError(validation);
      return;
    }
    setBusy('UPLOAD_ATTACHMENT');
    setError(null);
    setNotice(null);
    try {
      await uploadAfterSalesAttachment(client, requestNumber, file, tokenRef.current);
      setFile(null);
      if (fileRef.current !== null) fileRef.current.value = '';
      await loadDetail();
      setNotice('Đã tải tệp đính kèm lên an toàn.');
    } catch (caught) {
      setError(errorMessage(caught, 'Không thể tải tệp đính kèm lên.'));
    } finally {
      setBusy(null);
    }
  };

  const openAttachment = async (attachment: AfterSalesAttachment) => {
    const attachmentWindow = window.open('about:blank', '_blank');
    if (attachmentWindow === null) {
      setError('Trình duyệt đang chặn cửa sổ mở tệp. Hãy cho phép mở cửa sổ mới rồi thử lại.');
      return;
    }
    attachmentWindow.opener = null;
    setBusy(`VIEW:${attachment.id}`);
    setError(null);
    try {
      const signed = await getAfterSalesAttachmentUrl(
        client,
        requestNumber,
        attachment.id,
        tokenRef.current,
      );
      attachmentWindow.location.replace(signed.url);
    } catch (caught) {
      attachmentWindow.close();
      setError(errorMessage(caught, 'Không thể mở tệp đính kèm.'));
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reason = cancelReason.trim();
    if (reason.length < 5 || reason.length > 500) {
      setError('Lý do hủy phải có từ 5 đến 500 ký tự.');
      return;
    }
    setBusy('CANCEL');
    setError(null);
    setNotice(null);
    try {
      const next = await cancelAfterSalesRequest(client, requestNumber, reason, tokenRef.current);
      setDetail(next);
      setNotice('Yêu cầu hậu mãi đã được hủy.');
    } catch (caught) {
      setError(errorMessage(caught, 'Không thể hủy yêu cầu hậu mãi.'));
      try {
        await loadDetail();
      } catch {
        // Keep the mutation error authoritative if the refreshed projection also fails.
      }
    } finally {
      setBusy(null);
    }
  };

  const guestMissingCredential =
    accessReady && status === 'anonymous' && tokenRef.current === undefined;
  const backHref = isCustomer
    ? '/after-sales'
    : orderNumber === null
      ? '/'
      : `/orders/${encodeURIComponent(orderNumber)}`;

  return (
    <>
      <CatalogHeader />
      <main className="catalog-shell warranty-shell">
        <div className="breadcrumbs">
          <Link href={backHref}>{isCustomer ? 'Hậu mãi' : 'Đơn hàng'}</Link>
          <span>/</span>
          <span>{detail?.requestNumber ?? requestNumber}</span>
        </div>

        {status === 'loading' || !accessReady || loading ? (
          <div className="status">Đang tải yêu cầu hậu mãi…</div>
        ) : null}
        {isStaff ? (
          <div className="commerce-alert error" role="alert">
            Tài khoản nhân viên vui lòng sử dụng trang quản lý hậu mãi.
          </div>
        ) : null}
        {guestMissingCredential ? (
          <section className="empty-state">
            <h1>Không thể xác minh đơn hàng</h1>
            <p>Hãy mở yêu cầu từ chi tiết đơn hàng hoặc đăng nhập để tiếp tục.</p>
            {orderNumber === null ? null : (
              <Link className="button primary" href={`/orders/${encodeURIComponent(orderNumber)}`}>
                Mở đơn hàng
              </Link>
            )}
          </section>
        ) : null}
        {error === null ? null : (
          <div ref={errorRef} tabIndex={-1} className="commerce-alert error" role="alert">
            <span>{error}</span>
            <button className="button" type="button" onClick={() => void loadDetail()}>
              Tải lại
            </button>
          </div>
        )}
        {notice === null ? null : (
          <div className="commerce-alert success" role="status" aria-live="polite">
            {notice}
          </div>
        )}

        {detail === null ? null : (
          <>
            <article className="warranty-detail-card">
              <header className="warranty-detail-heading">
                <div>
                  <p className="eyebrow">{typeLabel(detail.type)}</p>
                  <h1>{detail.orderItem.productName}</h1>
                  <p>
                    {detail.orderItem.variantName} · {detail.orderItem.orderNumber}
                  </p>
                </div>
                <span className="warranty-badge">{statusLabel(detail.status)}</span>
              </header>
              <code className="warranty-code">{detail.requestNumber}</code>
              <dl className="warranty-detail-specs">
                <Spec label="Số lượng" value={String(detail.orderItem.quantity)} />
                <Spec
                  label="Thiết bị"
                  value={detail.orderItem.inventoryCode ?? 'Theo dòng sản phẩm'}
                />
                <Spec label="Ngày yêu cầu" value={dateTime(detail.requestedAt)} />
                <Spec label="Cập nhật" value={dateTime(detail.updatedAt)} />
              </dl>
              <section className="warranty-terms">
                <h2>Mô tả vấn đề</h2>
                <p>{detail.issueDescription}</p>
                {detail.requestedResolution ? (
                  <p>
                    <strong>Mong muốn:</strong> {detail.requestedResolution}
                  </p>
                ) : null}
              </section>
              {detail.warranty === null || detail.warranty === undefined ? null : (
                <section className="warranty-terms">
                  <h2>Bảo hành liên quan</h2>
                  <p>
                    {detail.warranty.warrantyCode} ·{' '}
                    {detail.warranty.isValid ? 'Còn hiệu lực' : 'Không còn hiệu lực'}
                  </p>
                  <Link
                    className="button"
                    href={`/warranties/${encodeURIComponent(detail.warranty.warrantyCode)}?orderNumber=${encodeURIComponent(detail.orderItem.orderNumber)}`}
                  >
                    Xem bảo hành
                  </Link>
                </section>
              )}
              {detail.decisionNote ? (
                <section className="warranty-terms">
                  <h2>Kết quả kiểm tra</h2>
                  <p>{detail.decisionNote}</p>
                </section>
              ) : null}
              {detail.resolutionType || detail.resolutionNote ? (
                <section className="warranty-terms">
                  <h2>Phương án giải quyết</h2>
                  <p>
                    {detail.resolutionType ? resolutionLabel(detail.resolutionType) : null}
                    {detail.resolutionType && detail.resolutionNote ? ' · ' : null}
                    {detail.resolutionNote}
                  </p>
                </section>
              ) : null}
              {detail.cancelReason ? (
                <section className="warranty-terms">
                  <h2>Lý do hủy</h2>
                  <p>{detail.cancelReason}</p>
                </section>
              ) : null}
            </article>

            <section className="detail-panel" aria-labelledby="after-sales-timeline-title">
              <h2 id="after-sales-timeline-title">Tiến độ xử lý</h2>
              <ol className="fulfillment-timeline">
                <Timeline label="Đã gửi yêu cầu" at={detail.timeline.requestedAt} />
                <Timeline label="Đã tiếp nhận" at={detail.timeline.receivedAt} />
                <Timeline label="Đã kiểm tra" at={detail.timeline.inspectedAt} />
                <Timeline label="Đã quyết định" at={detail.timeline.decidedAt} />
                <Timeline label="Đã giải quyết" at={detail.timeline.resolvedAt} />
                <Timeline label="Đã trả sản phẩm" at={detail.timeline.returnedAt} />
                {detail.status === 'CANCELLED' ? (
                  <Timeline label="Đã hủy" at={detail.timeline.cancelledAt} />
                ) : null}
              </ol>
            </section>

            <section className="detail-panel" aria-labelledby="attachments-title">
              <h2 id="attachments-title">Tệp đính kèm</h2>
              <p>Mỗi tệp được bảo vệ và chỉ mở sau khi xác minh quyền sở hữu đơn hàng.</p>
              {detail.attachments.length === 0 ? <p>Chưa có tệp đính kèm.</p> : null}
              <div className="warranty-policy-list">
                {detail.attachments.map((attachment, index) => (
                  <div className="warranty-policy-card" key={attachment.id}>
                    <div>
                      <strong>Tệp {String(index + 1)}</strong>
                      <span>
                        {attachment.mimeType} · {formatFileSize(attachment.fileSize)} ·{' '}
                        {dateTime(attachment.uploadedAt)}
                      </span>
                    </div>
                    <button
                      className="button"
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        void openAttachment(attachment);
                      }}
                    >
                      {busy === `VIEW:${attachment.id}` ? 'Đang mở…' : 'Mở tệp'}
                    </button>
                  </div>
                ))}
              </div>
              {detail.availableActions.includes('UPLOAD_ATTACHMENT') ? (
                <form
                  className="warranty-command-form"
                  onSubmit={(event) => {
                    void upload(event);
                  }}
                >
                  <label>
                    Thêm tệp
                    <input
                      ref={fileRef}
                      type="file"
                      required
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      disabled={busy !== null}
                      onChange={(event) => {
                        setFile(event.target.files?.[0] ?? null);
                        setError(null);
                      }}
                    />
                  </label>
                  <p>
                    Định dạng JPEG, PNG, WebP hoặc PDF; mỗi tệp tối đa 10 MB; mỗi yêu cầu tối đa 5
                    tệp.
                  </p>
                  <button className="button primary" type="submit" disabled={busy !== null}>
                    {busy === 'UPLOAD_ATTACHMENT' ? 'Đang tải lên…' : 'Tải tệp lên'}
                  </button>
                </form>
              ) : null}
            </section>

            {detail.availableActions.includes('CANCEL') ? (
              <section className="detail-panel" aria-labelledby="cancel-title">
                <h2 id="cancel-title">Hủy yêu cầu</h2>
                <form
                  className="warranty-command-form"
                  onSubmit={(event) => {
                    void cancel(event);
                  }}
                >
                  <label>
                    Lý do hủy
                    <textarea
                      required
                      minLength={5}
                      maxLength={500}
                      rows={3}
                      value={cancelReason}
                      disabled={busy !== null}
                      onChange={(event) => {
                        setCancelReason(event.target.value);
                      }}
                    />
                  </label>
                  <button className="button" type="submit" disabled={busy !== null}>
                    {busy === 'CANCEL' ? 'Đang hủy…' : 'Hủy yêu cầu'}
                  </button>
                </form>
              </section>
            ) : null}
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

function Timeline({ label, at }: { label: string; at: string | null | undefined }) {
  return (
    <li className={at == null ? 'pending' : 'complete'}>
      <span aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <time>{at == null ? 'Chưa thực hiện' : dateTime(at)}</time>
      </div>
    </li>
  );
}

function typeLabel(type: AfterSalesType): string {
  if (type === 'WARRANTY') return 'Bảo hành';
  if (type === 'RETURN') return 'Trả hàng';
  return 'Đổi hàng';
}

function statusLabel(status: AfterSalesStatus): string {
  if (status === 'REQUESTED') return 'Đã yêu cầu';
  if (status === 'RECEIVED') return 'Đã tiếp nhận';
  if (status === 'INSPECTING') return 'Đang kiểm tra';
  if (status === 'APPROVED') return 'Đã duyệt';
  if (status === 'REJECTED') return 'Bị từ chối';
  if (status === 'RESOLVED') return 'Đã giải quyết';
  return 'Đã hủy';
}

function resolutionLabel(value: NonNullable<AfterSalesDetail['resolutionType']>): string {
  if (value === 'REPAIRED') return 'Đã sửa chữa';
  if (value === 'REPLACED') return 'Đã đổi máy';
  if (value === 'REFUNDED') return 'Đã hoàn tiền';
  if (value === 'RETURNED_UNCHANGED') return 'Trả lại không thay đổi';
  return 'Phương án khác';
}

function formatFileSize(value: number): string {
  if (value < 1024) return `${String(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function dateTime(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? value
    : new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(timestamp);
}

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}
