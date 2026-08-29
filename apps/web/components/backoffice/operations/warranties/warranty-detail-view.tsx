'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/app/auth-provider';
import { BackofficeActionDialog } from '@/components/backoffice/backoffice-action-dialog';
import {
  OperationsActionRail,
  OperationsDetailLayout,
  OperationsPageHeader,
  OperationsPanel,
  OperationsStatusAxes,
  OperationsTimeline,
} from '../operations-primitives';
import { OperationsShell } from '../operations-shell';
import { Button, InlineAlert, Skeleton } from '@/components/ui';
import {
  getBackofficeWarranty,
  voidWarranty,
  type BackofficeWarrantyDetail,
} from '@/lib/warranty-api';
import {
  formatWarrantyDateTime,
  warrantyStatusPresentation,
  warrantyTimeline,
  warrantyValidityPresentation,
} from './warranty-presenter';
import styles from './warranties.module.css';

export function WarrantyDetailView({ warrantyId }: Readonly<{ warrantyId: string }>) {
  const { client, status: authStatus, user } = useAuth();
  const [detail, setDetail] = useState<BackofficeWarrantyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const mutationRef = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !isStaff) return;
    let active = true;
    setDetail(null);
    setLoading(true);
    setError(null);
    setNotice(null);
    setRefreshRequired(false);
    void getBackofficeWarranty(client, warrantyId)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((caught: unknown) => {
        if (active) setError(messageFrom(caught, 'Không thể tải bảo hành.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authStatus, client, isStaff, warrantyId]);

  async function submitVoid(reason?: string) {
    if (detail === null || reason === undefined || mutationRef.current) return;
    const warrantyId = detail.id;
    mutationRef.current = true;
    setVoidOpen(false);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const changed = await voidWarranty(client, warrantyId, reason);
      setDetail({ ...changed, availableActions: [] });
      setNotice('Đã vô hiệu bảo hành. Thông tin cũ vẫn được giữ để đối chiếu.');
      try {
        setDetail(await getBackofficeWarranty(client, warrantyId));
        setRefreshRequired(false);
      } catch {
        setRefreshRequired(true);
        setError('Thay đổi đã được ghi nhận nhưng chưa tải lại được trạng thái mới nhất.');
      }
    } catch (caught) {
      setError(messageFrom(caught, 'Không thể vô hiệu bảo hành.'));
      try {
        setDetail(await getBackofficeWarranty(client, warrantyId));
        setRefreshRequired(false);
      } catch {
        setDetail((current) =>
          current?.id === warrantyId ? { ...current, availableActions: [] } : current,
        );
        setRefreshRequired(true);
      }
    } finally {
      mutationRef.current = false;
      setBusy(false);
    }
  }

  async function retryDetail() {
    if (detail === null || mutationRef.current) return;
    mutationRef.current = true;
    setBusy(true);
    setError(null);
    try {
      setDetail(await getBackofficeWarranty(client, detail.id));
      setRefreshRequired(false);
    } catch (caught) {
      setError(messageFrom(caught, 'Chưa thể tải lại trạng thái mới nhất.'));
      setRefreshRequired(true);
    } finally {
      mutationRef.current = false;
      setBusy(false);
    }
  }

  return (
    <OperationsShell
      breadcrumbs={[
        { href: '/backoffice/warranties', label: 'Bảo hành' },
        { label: detail?.warrantyCode ?? 'Chi tiết bảo hành' },
      ]}
    >
      {loading && detail === null ? (
        <DetailSkeleton />
      ) : error !== null && detail === null ? (
        <InlineAlert ref={errorRef} tabIndex={-1} title="Chưa mở được bảo hành" tone="danger">
          {error}
        </InlineAlert>
      ) : detail === null ? null : (
        <div className={styles.page}>
          <WarrantyDetailContent
            detail={detail}
            error={error}
            notice={notice}
            refreshRequired={refreshRequired}
            busy={busy}
            onReload={() => {
              void retryDetail();
            }}
            onVoid={() => {
              setVoidReason('');
              setVoidOpen(true);
            }}
          />
          <BackofficeActionDialog
            confirmLabel="Vô hiệu bảo hành"
            description="Thao tác này là vĩnh viễn. Các thông tin đã cấp vẫn được giữ để đối chiếu về sau."
            destructive
            open={voidOpen}
            pending={busy}
            reason={{
              hint: 'Nêu rõ lý do để nhân viên và khách hàng có thể đối chiếu.',
              label: 'Lý do vô hiệu',
              maxLength: 500,
              minLength: 5,
              onChange: setVoidReason,
              value: voidReason,
            }}
            title="Vô hiệu bảo hành này?"
            onCancel={() => {
              setVoidOpen(false);
              setVoidReason('');
            }}
            onConfirm={(reason) => {
              void submitVoid(reason);
            }}
          />
        </div>
      )}
    </OperationsShell>
  );
}

export function WarrantyDetailContent({
  busy,
  detail,
  error,
  notice,
  refreshRequired,
  onReload,
  onVoid,
}: Readonly<{
  busy: boolean;
  detail: BackofficeWarrantyDetail;
  error: string | null;
  notice: string | null;
  refreshRequired: boolean;
  onReload: () => void;
  onVoid: () => void;
}>) {
  const status = warrantyStatusPresentation(detail);
  const validity = warrantyValidityPresentation(detail);
  const canVoid = !refreshRequired && detail.availableActions.includes('VOID');

  return (
    <>
      <OperationsPageHeader
        actions={
          <Link className={styles.inlineLink} href="/backoffice/warranties">
            Về danh sách
          </Link>
        }
        description={`${detail.productName} · ${detail.variantName}`}
        eyebrow="Bảo hành đã cấp"
        meta={
          <>
            <span>Mã {detail.warrantyCode}</span>
            <span>Đơn {detail.orderNumber}</span>
          </>
        }
        title="Chi tiết bảo hành"
      />

      <OperationsStatusAxes
        axes={[
          { kind: 'generic', label: 'Hồ sơ', tone: status.tone, value: status.label },
          { kind: 'generic', label: 'Thời hạn', tone: validity.tone, value: validity.label },
          { kind: 'order', label: 'Đơn hàng', tone: 'neutral', value: detail.orderNumber },
        ]}
      />

      <OperationsDetailLayout
        main={
          <>
            <OperationsPanel title="Thông tin đã áp dụng khi bán">
              <dl className={styles.detailGrid}>
                <DetailItem label="Sản phẩm">
                  <strong>{detail.productName}</strong>
                  <span>{detail.variantName}</span>
                  <span>{detail.sku}</span>
                </DetailItem>
                <DetailItem label="Khách hàng">
                  <strong>{detail.customer.name}</strong>
                  <span>{detail.customer.phone}</span>
                  <span>{detail.customer.email}</span>
                </DetailItem>
                <DetailItem label="Thời hạn">
                  <strong>{String(detail.daysSnapshot)} ngày</strong>
                  <span>Từ {formatWarrantyDateTime(detail.startAt)}</span>
                  <span>Đến {formatWarrantyDateTime(detail.endAt)}</span>
                </DetailItem>
                <DetailItem label="Thiết bị">
                  <strong>{detail.inventoryCode ?? 'Sản phẩm không có mã máy riêng'}</strong>
                  {detail.maskedIdentifierSuffix == null ? null : (
                    <span>Mã nhận dạng kết thúc bằng {detail.maskedIdentifierSuffix}</span>
                  )}
                </DetailItem>
                <DetailItem label="Chính sách">
                  <strong>{detail.policy?.name ?? 'Chính sách không còn trong danh mục'}</strong>
                  {detail.policy == null ? null : <span>{detail.policy.code}</span>}
                  {detail.policy == null ? null : (
                    <Link
                      className={styles.inlineLink}
                      href={`/backoffice/warranty-policies?policy=${encodeURIComponent(detail.policy.id)}`}
                    >
                      Xem chính sách
                    </Link>
                  )}
                </DetailItem>
              </dl>
            </OperationsPanel>

            <OperationsPanel
              description="Nội dung này được giữ nguyên theo thời điểm bảo hành được cấp."
              title="Điều khoản áp dụng"
            >
              <p className={styles.terms}>{detail.termsSnapshot}</p>
            </OperationsPanel>

            <OperationsPanel title="Lịch sử bảo hành">
              <OperationsTimeline items={warrantyTimeline(detail)} />
            </OperationsPanel>

            {detail.status === 'VOIDED' ? (
              <OperationsPanel title="Thông tin vô hiệu">
                <dl className={styles.detailGrid}>
                  <DetailItem label="Lý do">
                    <strong>{detail.voidReason ?? 'Không có thông tin'}</strong>
                  </DetailItem>
                  <DetailItem label="Người thực hiện">
                    <strong>{detail.voidedBy?.fullName ?? 'Không có thông tin'}</strong>
                    {detail.voidedAt == null ? null : (
                      <span>{formatWarrantyDateTime(detail.voidedAt)}</span>
                    )}
                  </DetailItem>
                </dl>
              </OperationsPanel>
            ) : null}
          </>
        }
        rail={
          <OperationsActionRail
            description={
              refreshRequired
                ? 'Trạng thái mới nhất chưa được tải về. Các thao tác thay đổi tạm thời được khóa.'
                : canVoid
                  ? 'Chỉ vô hiệu khi đã xác minh có căn cứ rõ ràng.'
                  : detail.status === 'VOIDED'
                    ? 'Bảo hành đã kết thúc và được giữ ở chế độ chỉ đọc.'
                    : 'Bạn có thể xem đầy đủ thông tin nhưng không có quyền thay đổi bảo hành.'
            }
            primary={
              refreshRequired ? (
                <Button loading={busy} loadingLabel="Đang tải lại" onClick={onReload}>
                  Tải lại chi tiết
                </Button>
              ) : canVoid ? (
                <Button disabled={busy} variant="destructive" onClick={onVoid}>
                  Vô hiệu bảo hành
                </Button>
              ) : undefined
            }
            title={
              refreshRequired
                ? 'Cần tải lại bảo hành'
                : canVoid
                  ? 'Quản lý bảo hành'
                  : 'Trạng thái xử lý'
            }
          >
            {error === null ? null : (
              <InlineAlert title="Chưa thể cập nhật bảo hành" tone="danger">
                {error}
              </InlineAlert>
            )}
            {notice === null ? null : (
              <InlineAlert title="Đã cập nhật" tone="success">
                {notice}
              </InlineAlert>
            )}
          </OperationsActionRail>
        }
      />
    </>
  );
}

function DetailItem({ children, label }: Readonly<{ children: ReactNode; label: string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className={styles.page} aria-label="Đang tải bảo hành" role="status">
      <Skeleton height="5rem" width="min(100%, 34rem)" />
      <Skeleton height="6rem" width="100%" />
      <Skeleton height="24rem" width="100%" />
      <span className="rp-visually-hidden">Đang tải bảo hành…</span>
    </div>
  );
}

function messageFrom(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}
