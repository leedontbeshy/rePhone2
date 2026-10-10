'use client';

import { ArchiveIcon, InfoIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import {
  BackofficeActionDialog,
  CatalogVoucherShell,
  CatalogVoucherStatusChip,
  VOUCHERS_ROOT,
} from '@/components/backoffice';
import { Button, InlineAlert, Select, Skeleton } from '@/components/ui';
import {
  activateVoucher,
  archiveVoucher,
  getVoucher,
  listVoucherUsages,
  pauseVoucher,
  updateVoucher,
  voucherErrorRequiresRefetch,
  type CreateVoucherInput,
  type Pagination,
  type UsageQuery,
  type Voucher,
  type VoucherUsage,
  type VoucherUsageStatus,
} from '@/lib/backoffice-voucher-api';
import {
  formatVoucherDateTime,
  formatVoucherMoney,
  voucherDiscountSummary,
  voucherScopeSummary,
  voucherStatusLabel,
  voucherUsageProgress,
  voucherUsageStatusLabel,
  voucherVisibilityLabel,
} from './voucher-admin-ui';
import { VoucherEditor } from './voucher-editor';
import { voucherAllowsOnlyEndDateUpdate, voucherUpdateFromEditor } from './voucher-editor-logic';
import styles from './voucher-admin.module.css';

const USAGE_PAGE_SIZE = 10;
const EDIT_FORM_ID = 'edit-voucher-form';

type PendingAction = 'activate' | 'pause' | 'archive' | null;

const EMPTY_PAGINATION: Pagination = {
  page: 1,
  pageSize: USAGE_PAGE_SIZE,
  totalItems: 0,
  totalPages: 0,
};

export function VoucherDetailView() {
  const params = useParams<{ id: string }>();
  const voucherId = decodeURIComponent(params.id);
  const searchParams = useSearchParams();
  const { client, status, user } = useAuth();
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [usages, setUsages] = useState<VoucherUsage[]>([]);
  const [usageStatus, setUsageStatus] = useState<'' | VoucherUsageStatus>('');
  const [usagePage, setUsagePage] = useState(1);
  const [usagePagination, setUsagePagination] = useState<Pagination>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usageReloadVersion, setUsageReloadVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    searchParams.get('created') === '1' ? 'Đã tạo bản nháp mã ưu đãi.' : null,
  );
  const isAdmin = user?.role === 'ADMIN';
  const voucherLoadedId = voucher?.id ?? null;
  const mutationInFlightRef = useRef(false);
  const usageRequestRef = useRef(0);

  const usageQuery = useMemo<UsageQuery>(
    () => ({
      page: usagePage,
      pageSize: USAGE_PAGE_SIZE,
      ...(usageStatus === '' ? {} : { status: usageStatus }),
    }),
    [usagePage, usageStatus],
  );

  const loadVoucher = useCallback(async () => {
    const result = await getVoucher(client, voucherId);
    setVoucher(result);
    return result;
  }, [client, voucherId]);

  useEffect(() => {
    if (status !== 'authenticated' || !isAdmin) return;
    let active = true;
    setLoading(true);
    setError(null);
    void getVoucher(client, voucherId)
      .then((result) => {
        if (active) setVoucher(result);
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught, 'Không thể tải mã ưu đãi.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, isAdmin, status, voucherId]);

  useEffect(() => {
    if (status !== 'authenticated' || !isAdmin || voucherLoadedId === null) return;
    const request = usageRequestRef.current + 1;
    usageRequestRef.current = request;
    setUsageLoading(true);
    setUsageError(null);
    void listVoucherUsages(client, voucherLoadedId, usageQuery)
      .then((result) => {
        if (usageRequestRef.current !== request) return;
        setUsages(result.data);
        setUsagePagination(result.pagination);
      })
      .catch((caught: unknown) => {
        if (usageRequestRef.current === request) {
          setUsageError(errorMessage(caught, 'Không thể tải lịch sử sử dụng.'));
        }
      })
      .finally(() => {
        if (usageRequestRef.current === request) setUsageLoading(false);
      });
    return () => {
      if (usageRequestRef.current === request) usageRequestRef.current += 1;
    };
  }, [client, isAdmin, status, usageQuery, usageReloadVersion, voucherLoadedId]);

  async function runMutation(operation: () => Promise<Voucher>, success: string) {
    if (busy || mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await operation();
      setVoucher(updated);
      setNotice(success);
      setPendingAction(null);
      setReason('');
      setEditing(false);
      setUsageReloadVersion((current) => current + 1);
    } catch (caught) {
      if (voucherErrorRequiresRefetch(caught)) {
        try {
          await loadVoucher();
        } catch {
          // Keep the command error visible if the authoritative refresh also fails.
        }
        setPendingAction(null);
        setReason('');
        setEditing(false);
        setUsageReloadVersion((current) => current + 1);
      }
      setError(errorMessage(caught, 'Không thể cập nhật mã ưu đãi.'));
    } finally {
      mutationInFlightRef.current = false;
      setBusy(false);
    }
  }

  function retryVoucher() {
    if (loading) return;
    setLoading(true);
    setError(null);
    void loadVoucher()
      .then(() => {
        setEditing(false);
        setPendingAction(null);
        setReason('');
        setUsageReloadVersion((current) => current + 1);
      })
      .catch((caught: unknown) => {
        setError(errorMessage(caught, 'Không thể tải mã ưu đãi.'));
      })
      .finally(() => {
        setLoading(false);
      });
  }

  function save(input: CreateVoucherInput) {
    if (voucher === null) return;
    const update = voucherUpdateFromEditor(voucher, input);
    void runMutation(
      () => updateVoucher(client, voucher.id, update),
      'Đã lưu thay đổi của mã ưu đãi.',
    );
  }

  function openAction(action: Exclude<PendingAction, null>) {
    setError(null);
    setReason('');
    setPendingAction(action);
  }

  function confirmAction() {
    if (voucher === null || pendingAction === null) return;
    if (pendingAction === 'activate') {
      void runMutation(() => activateVoucher(client, voucher.id), 'Mã ưu đãi đang được áp dụng.');
      return;
    }
    if (pendingAction === 'pause') {
      void runMutation(() => pauseVoucher(client, voucher.id, reason), 'Đã tạm dừng mã ưu đãi.');
      return;
    }
    void runMutation(() => archiveVoucher(client, voucher.id, reason), 'Đã lưu trữ mã ưu đãi.');
  }

  const title = voucher?.code ?? 'Chi tiết mã ưu đãi';

  return (
    <CatalogVoucherShell
      breadcrumbs={[{ href: VOUCHERS_ROOT, label: 'Mã ưu đãi' }, { label: title }]}
    >
      <div className={styles.page}>
        {loading && voucher === null ? <VoucherDetailLoading /> : null}
        {error === null || pendingAction !== null ? null : (
          <InlineAlert title="Chưa thể hoàn tất" tone="danger">
            {error}{' '}
            <Button
              loading={loading}
              loadingLabel="Đang tải lại"
              size="compact"
              variant="secondary"
              onClick={retryVoucher}
            >
              Tải lại
            </Button>
          </InlineAlert>
        )}
        {notice === null ? null : (
          <InlineAlert title="Đã cập nhật" tone="success">
            {notice}
          </InlineAlert>
        )}

        {voucher === null ? null : (
          <>
            <header className={styles.detailHeader}>
              <div className={styles.detailHeading}>
                <span className={styles.detailCode}>{voucher.code}</span>
                <div className={styles.detailTitleCopy}>
                  <div className={styles.detailTitleLine}>
                    <h1>{voucher.name}</h1>
                    <CatalogVoucherStatusChip
                      label={voucherStatusLabel(voucher.status)}
                      status={voucher.status}
                    />
                  </div>
                  <p>Theo dõi điều kiện và lượt sử dụng của chương trình.</p>
                </div>
              </div>
              <div className={styles.headerActions}>
                {editing ? (
                  <>
                    <Button
                      disabled={busy}
                      variant="secondary"
                      onClick={() => {
                        setEditing(false);
                      }}
                    >
                      Hủy chỉnh sửa
                    </Button>
                    <Button
                      form={EDIT_FORM_ID}
                      loading={busy}
                      loadingLabel="Đang lưu thay đổi"
                      type="submit"
                    >
                      Lưu thay đổi
                    </Button>
                  </>
                ) : (
                  <>
                    {voucher.status !== 'ARCHIVED' ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setError(null);
                          setEditing(true);
                        }}
                      >
                        Chỉnh sửa
                      </Button>
                    ) : null}
                    {voucher.status === 'DRAFT' || voucher.status === 'PAUSED' ? (
                      <Button
                        onClick={() => {
                          openAction('activate');
                        }}
                      >
                        Mở áp dụng
                      </Button>
                    ) : null}
                    {voucher.status === 'ACTIVE' ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          openAction('pause');
                        }}
                      >
                        Tạm dừng
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </header>

            {editing ? (
              <VoucherEditor
                endDateOnly={voucherAllowsOnlyEndDateUpdate(voucher)}
                formId={EDIT_FORM_ID}
                initialVoucher={voucher}
                pending={busy}
                onSubmit={save}
              />
            ) : (
              <VoucherSummary
                usageError={usageError}
                usageLoading={usageLoading}
                usagePage={usagePage}
                usagePagination={usagePagination}
                usageStatus={usageStatus}
                usages={usages}
                voucher={voucher}
                onArchive={() => {
                  openAction('archive');
                }}
                onUsagePageChange={setUsagePage}
                onUsageRetry={() => {
                  setUsageReloadVersion((current) => current + 1);
                }}
                onUsageStatusChange={(next) => {
                  setUsageStatus(next);
                  setUsagePage(1);
                }}
              />
            )}

            <BackofficeActionDialog
              confirmLabel={
                pendingAction === 'activate'
                  ? 'Mở áp dụng'
                  : pendingAction === 'pause'
                    ? 'Tạm dừng'
                    : 'Lưu trữ mã ưu đãi'
              }
              description={actionDescription(pendingAction)}
              destructive={pendingAction === 'archive'}
              error={error ?? undefined}
              open={pendingAction !== null}
              pending={busy}
              {...(pendingAction === 'pause' || pendingAction === 'archive'
                ? {
                    reason: {
                      value: reason,
                      onChange: setReason,
                      label: pendingAction === 'pause' ? 'Lý do tạm dừng' : 'Lý do lưu trữ',
                    },
                  }
                : {})}
              title={actionTitle(pendingAction)}
              onCancel={() => {
                if (!busy) {
                  setPendingAction(null);
                  setReason('');
                  setError(null);
                }
              }}
              onConfirm={confirmAction}
            />
          </>
        )}
      </div>
    </CatalogVoucherShell>
  );
}

export function VoucherSummary({
  onArchive,
  onUsagePageChange,
  onUsageRetry,
  onUsageStatusChange,
  usageError,
  usageLoading,
  usagePage,
  usagePagination,
  usageStatus,
  usages,
  voucher,
}: Readonly<{
  onArchive: () => void;
  onUsagePageChange: (page: number) => void;
  onUsageRetry: () => void;
  onUsageStatusChange: (status: '' | VoucherUsageStatus) => void;
  usageError: string | null;
  usageLoading: boolean;
  usagePage: number;
  usagePagination: Pagination;
  usageStatus: '' | VoucherUsageStatus;
  usages: readonly VoucherUsage[];
  voucher: Voucher;
}>) {
  const totalUsage =
    voucher.usageCounts.consumed + voucher.usageCounts.reserved + voucher.usageCounts.released;
  const hasUsage = totalUsage > 0;
  return (
    <div className={styles.detailGrid}>
      <div className={styles.detailMain}>
        <section className={styles.panel}>
          <h2>Điều kiện áp dụng</h2>
          <dl className={styles.conditionGrid}>
            <div>
              <dt>Mức ưu đãi</dt>
              <dd>{voucherDiscountSummary(voucher)}</dd>
            </div>
            <div>
              <dt>Phạm vi</dt>
              <dd>{voucherScopeSummary(voucher)}</dd>
            </div>
            <div>
              <dt>Đơn hàng tối thiểu</dt>
              <dd>{formatVoucherMoney(voucher.minimumOrderAmount)}</dd>
            </div>
            <div>
              <dt>Mỗi khách hàng</dt>
              <dd>
                {voucher.perCustomerLimit === null || voucher.perCustomerLimit === undefined
                  ? 'Không giới hạn theo tài khoản'
                  : `${String(voucher.perCustomerLimit)} lượt`}
              </dd>
            </div>
            <div>
              <dt>Tổng giới hạn</dt>
              <dd>
                {voucher.totalUsageLimit === null || voucher.totalUsageLimit === undefined
                  ? 'Không giới hạn'
                  : `${String(voucher.totalUsageLimit)} lượt`}
              </dd>
            </div>
            <div>
              <dt>Đối tượng nhìn thấy</dt>
              <dd>{voucherVisibilityLabel(voucher.visibility)}</dd>
            </div>
          </dl>
          {hasUsage ? (
            <div className={styles.infoBox}>
              <InfoIcon aria-hidden size={20} />
              <span>Một số điều kiện được giữ nguyên sau khi đã phát sinh lượt sử dụng.</span>
            </div>
          ) : null}
        </section>

        <section className={styles.metrics} aria-label="Tổng hợp lượt sử dụng">
          <div className={styles.metric}>
            <span>Đã dùng</span>
            <strong>{voucher.usageCounts.consumed}</strong>
          </div>
          <div className={styles.metric}>
            <span>Đang chờ</span>
            <strong>{voucher.usageCounts.reserved}</strong>
          </div>
          <div className={styles.metric}>
            <span>Đã hoàn lại</span>
            <strong>{voucher.usageCounts.released}</strong>
          </div>
          <div className={styles.usageProgress}>
            <strong>
              {voucher.totalUsageLimit === null || voucher.totalUsageLimit === undefined
                ? `${String(voucher.usageCounts.consumed)} lượt đã dùng`
                : `${String(voucher.usageCounts.consumed)}/${String(voucher.totalUsageLimit)} lượt đã dùng`}
            </strong>
            {voucher.totalUsageLimit === null || voucher.totalUsageLimit === undefined ? null : (
              <div
                aria-label={`${String(Math.round(voucherUsageProgress(voucher.usageCounts.consumed, voucher.totalUsageLimit)))}% giới hạn đã dùng`}
                className={styles.progressTrack}
                role="progressbar"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={Math.round(
                  voucherUsageProgress(voucher.usageCounts.consumed, voucher.totalUsageLimit),
                )}
              >
                <span
                  style={{
                    width: `${String(voucherUsageProgress(voucher.usageCounts.consumed, voucher.totalUsageLimit))}%`,
                  }}
                />
              </div>
            )}
          </div>
        </section>

        <section className={styles.usagePanel}>
          <h2>Lịch sử sử dụng</h2>
          <div className={styles.usageFilters}>
            <Select
              id="usage-status"
              label="Trạng thái lượt sử dụng"
              value={usageStatus}
              onChange={(event) => {
                onUsageStatusChange(event.target.value as '' | VoucherUsageStatus);
              }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="CONSUMED">Đã dùng</option>
              <option value="RESERVED">Đang chờ</option>
              <option value="RELEASED">Đã hoàn lại</option>
            </Select>
          </div>
          {usageError === null ? null : (
            <InlineAlert title="Chưa tải được lịch sử sử dụng" tone="warning">
              {usageError}{' '}
              <Button
                loading={usageLoading}
                loadingLabel="Đang tải lại"
                size="compact"
                variant="secondary"
                onClick={onUsageRetry}
              >
                Thử lại
              </Button>
            </InlineAlert>
          )}
          <div
            className={styles.usageTableWrap}
            aria-busy={usageLoading || undefined}
            aria-label="Lịch sử sử dụng mã ưu đãi"
            role="region"
            tabIndex={0}
          >
            <table className={styles.usageTable}>
              <caption className="rp-visually-hidden">Lịch sử sử dụng mã ưu đãi</caption>
              <thead>
                <tr>
                  <th scope="col">Đơn hàng</th>
                  <th scope="col">Khách hàng</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {usages.length === 0 ? (
                  <tr>
                    <td colSpan={4}>{usageLoading ? 'Đang tải…' : 'Chưa có lượt sử dụng.'}</td>
                  </tr>
                ) : (
                  usages.map((usage) => (
                    <tr key={usage.id}>
                      <td>
                        <Link href={`/backoffice/orders/${encodeURIComponent(usage.orderId)}`}>
                          {usage.orderNumber}
                        </Link>
                      </td>
                      <td>
                        <span className={styles.usageCustomer}>
                          <strong>{usage.customerName}</strong>
                          {usage.customerEmail === null ? null : <span>{usage.customerEmail}</span>}
                        </span>
                      </td>
                      <td>
                        <CatalogVoucherStatusChip
                          label={voucherUsageStatusLabel(usage.status)}
                          status={usage.status}
                        />
                      </td>
                      <td>{formatVoucherDateTime(usageTime(usage))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className={styles.usageFooter}>
            <span>
              {usagePagination.totalItems === 0
                ? 'Chưa có lượt sử dụng'
                : `${String((usagePagination.page - 1) * usagePagination.pageSize + 1)}–${String(
                    Math.min(
                      usagePagination.page * usagePagination.pageSize,
                      usagePagination.totalItems,
                    ),
                  )} trong ${String(usagePagination.totalItems)} lượt`}
            </span>
            <div className={styles.usagePagination}>
              <Button
                disabled={usageLoading || usagePage <= 1}
                size="compact"
                variant="secondary"
                onClick={() => {
                  onUsagePageChange(Math.max(1, usagePage - 1));
                }}
              >
                Trước
              </Button>
              <Button
                disabled={
                  usageLoading ||
                  usagePagination.totalPages === 0 ||
                  usagePage >= usagePagination.totalPages
                }
                size="compact"
                variant="secondary"
                onClick={() => {
                  onUsagePageChange(usagePage + 1);
                }}
              >
                Sau
              </Button>
            </div>
          </div>
        </section>
      </div>

      <aside className={styles.detailRail}>
        <section className={styles.sideCard}>
          <h2>Trạng thái</h2>
          <CatalogVoucherStatusChip
            label={voucherStatusLabel(voucher.status)}
            status={voucher.status}
          />
          <p className={styles.supportCopy}>{statusDescription(voucher.status)}</p>
        </section>
        <section className={styles.sideCard}>
          <h2>Thời gian áp dụng</h2>
          <dl className={styles.sideDetails}>
            <div>
              <dt>Bắt đầu</dt>
              <dd>{formatVoucherDateTime(voucher.startsAt)}</dd>
            </div>
            <div>
              <dt>Kết thúc</dt>
              <dd>{formatVoucherDateTime(voucher.endsAt)}</dd>
            </div>
          </dl>
        </section>
        <section className={styles.sideCard}>
          <h2>Cập nhật gần nhất</h2>
          <p className={styles.supportCopy}>{formatVoucherDateTime(voucher.updatedAt)}</p>
        </section>
        {voucher.status === 'ARCHIVED' ? null : (
          <Button
            className={styles.dangerAction}
            iconLeading={<ArchiveIcon aria-hidden size={18} />}
            variant="destructive"
            onClick={onArchive}
          >
            Lưu trữ mã ưu đãi
          </Button>
        )}
      </aside>
    </div>
  );
}

function VoucherDetailLoading() {
  return (
    <section className={styles.loadingState} aria-label="Đang tải mã ưu đãi" role="status">
      <Skeleton height="2.5rem" width="24rem" />
      <Skeleton height="16rem" width="100%" />
      <span className="rp-visually-hidden">Đang tải mã ưu đãi…</span>
    </section>
  );
}

function usageTime(usage: VoucherUsage): string {
  if (usage.status === 'CONSUMED' && usage.consumedAt !== null) return usage.consumedAt;
  if (usage.status === 'RELEASED' && usage.releasedAt !== null) return usage.releasedAt;
  return usage.createdAt;
}

function statusDescription(status: Voucher['status']): string {
  if (status === 'ACTIVE') return 'Khách hàng đủ điều kiện có thể sử dụng mã này.';
  if (status === 'DRAFT') return 'Mã chưa được áp dụng cho khách hàng.';
  if (status === 'PAUSED') return 'Mã đang tạm ngừng nhận lượt sử dụng mới.';
  return 'Mã đã kết thúc và không thể mở lại.';
}

function actionTitle(action: PendingAction): string {
  if (action === 'activate') return 'Mở áp dụng mã ưu đãi?';
  if (action === 'pause') return 'Tạm dừng mã ưu đãi?';
  if (action === 'archive') return 'Lưu trữ mã ưu đãi?';
  return '';
}

function actionDescription(action: PendingAction): string {
  if (action === 'activate') return 'Hệ thống sẽ kiểm tra toàn bộ điều kiện trước khi mở áp dụng.';
  if (action === 'pause') return 'Khách hàng sẽ không thể bắt đầu lượt sử dụng mới.';
  if (action === 'archive') return 'Mã sẽ kết thúc vĩnh viễn và không thể khôi phục.';
  return '';
}

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}
