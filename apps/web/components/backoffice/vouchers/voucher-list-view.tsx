'use client';

import { CaretRightIcon, MagnifyingGlassIcon, PlusIcon } from '@phosphor-icons/react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useAuth } from '@/app/auth-provider';
import {
  BackofficePagination,
  CatalogVoucherShell,
  CatalogVoucherStatusChip,
  VOUCHERS_ROOT,
} from '@/components/backoffice';
import { Button, InlineAlert, Input, Link, Select, Skeleton } from '@/components/ui';
import {
  listVouchers,
  type Pagination,
  type Voucher,
  type VoucherQuery,
} from '@/lib/backoffice-voucher-api';
import {
  formatVoucherDateRange,
  voucherDiscountSummary,
  voucherScopeSummary,
  voucherStatusLabel,
} from './voucher-admin-ui';
import styles from './voucher-admin.module.css';
import {
  buildVoucherListHref,
  VOUCHER_LIST_PAGE_SIZE,
  voucherDraftFromQuery,
  voucherFilterDraftsEqual,
  voucherQueriesEqual,
  voucherQueryFromDraft,
  voucherQueryFromSearch,
  type VoucherDiscountFilter,
  type VoucherFilterDraft,
  type VoucherScopeFilter,
  type VoucherStatusFilter,
} from './voucher-list-filters';

const STATUS_TABS: ReadonlyArray<{ label: string; value: VoucherStatusFilter }> = [
  { label: 'Tất cả', value: '' },
  { label: 'Đang áp dụng', value: 'ACTIVE' },
  { label: 'Bản nháp', value: 'DRAFT' },
  { label: 'Tạm dừng', value: 'PAUSED' },
  { label: 'Đã lưu trữ', value: 'ARCHIVED' },
];

const EMPTY_PAGINATION: Pagination = {
  page: 1,
  pageSize: VOUCHER_LIST_PAGE_SIZE,
  totalItems: 0,
  totalPages: 0,
};

export function VoucherListView() {
  const { client, status, user } = useAuth();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState<VoucherQuery>(() => voucherQueryFromSearch(searchParams));
  const [draft, setDraft] = useState<VoucherFilterDraft>(() => voucherDraftFromQuery(query));
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [pagination, setPagination] = useState<Pagination>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequest = useRef(0);
  const isAdmin = user?.role === 'ADMIN';
  const searchKey = searchParams.toString();

  const applyDraft = useCallback(
    (nextDraft: VoucherFilterDraft, historyMode: 'push' | 'replace' = 'push') => {
      const nextQuery = voucherQueryFromDraft(nextDraft);
      setQuery((current) => (voucherQueriesEqual(current, nextQuery) ? current : nextQuery));
      if (typeof window === 'undefined') return;
      const href = buildVoucherListHref(VOUCHERS_ROOT, { ...nextDraft, page: 1 });
      const currentHref = `${window.location.pathname}${window.location.search}`;
      if (href === currentHref) return;
      if (historyMode === 'replace') {
        window.history.replaceState(window.history.state, '', href);
      } else {
        window.history.pushState(window.history.state, '', href);
      }
    },
    [],
  );

  useEffect(() => {
    const nextQuery = voucherQueryFromSearch(new URLSearchParams(searchKey));
    const nextDraft = voucherDraftFromQuery(nextQuery);
    setQuery((current) => (voucherQueriesEqual(current, nextQuery) ? current : nextQuery));
    setDraft((current) => (voucherFilterDraftsEqual(current, nextDraft) ? current : nextDraft));
  }, [searchKey]);

  useEffect(() => {
    function syncFromHistory() {
      const nextQuery = voucherQueryFromSearch(new URLSearchParams(window.location.search));
      const nextDraft = voucherDraftFromQuery(nextQuery);
      setQuery((current) => (voucherQueriesEqual(current, nextQuery) ? current : nextQuery));
      setDraft((current) => (voucherFilterDraftsEqual(current, nextDraft) ? current : nextDraft));
    }

    window.addEventListener('popstate', syncFromHistory);
    return () => {
      window.removeEventListener('popstate', syncFromHistory);
    };
  }, []);

  useEffect(() => {
    if (draft.q.trim() === (query.q ?? '')) return;
    const timeout = window.setTimeout(() => {
      applyDraft(draft, 'replace');
    }, 250);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [applyDraft, draft, query.q]);

  const load = useCallback(async () => {
    const request = latestRequest.current + 1;
    latestRequest.current = request;
    setLoading(true);
    setError(null);
    try {
      const result = await listVouchers(client, query);
      if (request !== latestRequest.current) return;
      setVouchers(result.data);
      setPagination(result.pagination);
    } catch (caught: unknown) {
      if (request !== latestRequest.current) return;
      setError(errorMessage(caught, 'Không thể tải danh sách mã ưu đãi.'));
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, [client, query]);

  useEffect(() => {
    if (status !== 'authenticated' || !isAdmin) return;
    void load();
    return () => {
      latestRequest.current += 1;
    };
  }, [isAdmin, load, status]);

  function applyFilters(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    applyDraft(draft);
  }

  function setStatus(nextStatus: VoucherStatusFilter) {
    const nextDraft = { ...draft, status: nextStatus };
    setDraft(nextDraft);
    applyDraft(nextDraft);
  }

  return (
    <CatalogVoucherShell breadcrumbs={[{ label: 'Mã ưu đãi' }]}>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.headingCopy}>
            <h1>Mã ưu đãi</h1>
            <p>Tạo và theo dõi các chương trình ưu đãi dành cho khách hàng.</p>
          </div>
          <Link className={styles.primaryLink} href={`${VOUCHERS_ROOT}/new`}>
            <PlusIcon aria-hidden size={18} weight="bold" />
            Tạo mã ưu đãi
          </Link>
        </header>

        <form className={styles.listFilters} aria-label="Lọc mã ưu đãi" onSubmit={applyFilters}>
          <div className={styles.searchField}>
            <MagnifyingGlassIcon aria-hidden size={20} />
            <Input
              id="voucher-search"
              label="Tìm kiếm"
              maxLength={100}
              placeholder="Mã hoặc tên chương trình"
              value={draft.q}
              onChange={(event) => {
                setDraft((current) => ({ ...current, q: event.target.value }));
              }}
            />
          </div>
          <Select
            id="voucher-status"
            label="Trạng thái"
            value={draft.status}
            onChange={(event) => {
              const nextDraft = {
                ...draft,
                status: event.target.value as VoucherStatusFilter,
              };
              setDraft(nextDraft);
              applyDraft(nextDraft);
            }}
          >
            <option value="">Tất cả</option>
            <option value="ACTIVE">Đang áp dụng</option>
            <option value="DRAFT">Bản nháp</option>
            <option value="PAUSED">Tạm dừng</option>
            <option value="ARCHIVED">Đã lưu trữ</option>
          </Select>
          <Select
            id="voucher-discount"
            label="Loại ưu đãi"
            value={draft.discountType}
            onChange={(event) => {
              const nextDraft = {
                ...draft,
                discountType: event.target.value as VoucherDiscountFilter,
              };
              setDraft(nextDraft);
              applyDraft(nextDraft);
            }}
          >
            <option value="">Tất cả</option>
            <option value="PERCENT">Giảm theo phần trăm</option>
            <option value="FIXED">Giảm số tiền</option>
          </Select>
          <Select
            id="voucher-scope"
            label="Phạm vi áp dụng"
            value={draft.scopeType}
            onChange={(event) => {
              const nextDraft = {
                ...draft,
                scopeType: event.target.value as VoucherScopeFilter,
              };
              setDraft(nextDraft);
              applyDraft(nextDraft);
            }}
          >
            <option value="">Tất cả</option>
            <option value="ORDER">Toàn bộ đơn hàng</option>
            <option value="PRODUCT_TYPE">Dòng sản phẩm</option>
            <option value="PRODUCTS">Sản phẩm cụ thể</option>
            <option value="VARIANTS">Biến thể cụ thể</option>
          </Select>
        </form>

        <div className={styles.tabs} role="tablist" aria-label="Lọc nhanh theo trạng thái">
          {STATUS_TABS.map((tab) => (
            <button
              aria-selected={(query.status ?? '') === tab.value}
              className={styles.tab}
              data-active={(query.status ?? '') === tab.value}
              key={tab.value || 'all'}
              role="tab"
              type="button"
              onClick={() => {
                setStatus(tab.value);
              }}
            >
              {tab.label}
              {tab.value === (query.status ?? '') ? (
                <span className={styles.tabCount}>{pagination.totalItems}</span>
              ) : null}
            </button>
          ))}
        </div>

        {error === null ? null : (
          <InlineAlert title="Chưa tải được mã ưu đãi" tone="danger">
            {error}{' '}
            <Button size="compact" variant="secondary" onClick={() => void load()}>
              Tải lại
            </Button>
          </InlineAlert>
        )}

        {loading && vouchers.length === 0 ? (
          <section className={styles.loadingState} aria-label="Đang tải mã ưu đãi" role="status">
            <Skeleton height="2rem" width="16rem" />
            <Skeleton height="8rem" width="100%" />
            <span className="rp-visually-hidden">Đang tải mã ưu đãi…</span>
          </section>
        ) : (
          <section
            className={styles.voucherBoard}
            aria-label="Danh sách mã ưu đãi"
            aria-busy={loading || undefined}
            data-updating={loading && vouchers.length > 0}
          >
            {loading && vouchers.length > 0 ? (
              <p className={styles.updateStatus} role="status">
                Đang cập nhật danh sách…
              </p>
            ) : null}
            {vouchers.length === 0 ? (
              <div className={styles.emptyState}>
                <h2>Chưa có mã ưu đãi phù hợp</h2>
                <p>Hãy thay đổi bộ lọc hoặc tạo một chương trình mới.</p>
              </div>
            ) : (
              vouchers.map((voucher) => (
                <VoucherBoardCard disabled={loading} key={voucher.id} voucher={voucher} />
              ))
            )}
          </section>
        )}

        <div className={styles.paginationWrap}>
          <BackofficePagination
            buildHref={(page) =>
              buildVoucherListHref(VOUCHERS_ROOT, { ...voucherDraftFromQuery(query), page })
            }
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            totalPages={pagination.totalPages}
          />
        </div>
      </div>
    </CatalogVoucherShell>
  );
}

function VoucherBoardCard({
  disabled,
  voucher,
}: Readonly<{ disabled: boolean; voucher: Voucher }>) {
  const used = voucher.usageCounts.consumed;
  const usageSummary =
    voucher.totalUsageLimit === null || voucher.totalUsageLimit === undefined
      ? used === 0
        ? 'Chưa có lượt dùng'
        : `${String(used)} lượt đã dùng`
      : `${String(used)}/${String(voucher.totalUsageLimit)} lượt đã dùng`;

  return (
    <Link
      aria-disabled={disabled || undefined}
      className={styles.voucherCard}
      href={`${VOUCHERS_ROOT}/${encodeURIComponent(voucher.id)}`}
      onClick={(event) => {
        if (disabled) event.preventDefault();
      }}
      tabIndex={disabled ? -1 : undefined}
    >
      <span className={styles.voucherCode}>{voucher.code}</span>
      <span className={styles.cardCopy}>
        <h2>{voucher.name}</h2>
        <p>{voucherDiscountSummary(voucher)}</p>
        <p>{voucherScopeSummary(voucher)}</p>
        <p>{formatVoucherDateRange(voucher.startsAt, voucher.endsAt)}</p>
      </span>
      <span className={styles.cardMeta}>
        <CatalogVoucherStatusChip
          label={voucherStatusLabel(voucher.status)}
          status={voucher.status}
        />
        <span className={styles.cardFooter}>
          <span>{usageSummary}</span>
          <span aria-hidden="true">
            <CaretRightIcon size={18} weight="bold" />
          </span>
        </span>
      </span>
    </Link>
  );
}

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}
