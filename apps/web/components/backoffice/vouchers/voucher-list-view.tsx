'use client';

import { CaretRightIcon, PlusIcon } from '@phosphor-icons/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
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

const PAGE_SIZE = 12;

type StatusFilter = '' | Voucher['status'];
type DiscountFilter = '' | Voucher['discountType'];
type ScopeFilter = '' | Voucher['scopeType'];

interface FilterDraft {
  readonly q: string;
  readonly status: StatusFilter;
  readonly discountType: DiscountFilter;
  readonly scopeType: ScopeFilter;
}

const STATUS_TABS: ReadonlyArray<{ label: string; value: StatusFilter }> = [
  { label: 'Tất cả', value: '' },
  { label: 'Đang áp dụng', value: 'ACTIVE' },
  { label: 'Bản nháp', value: 'DRAFT' },
  { label: 'Tạm dừng', value: 'PAUSED' },
  { label: 'Đã lưu trữ', value: 'ARCHIVED' },
];

const EMPTY_PAGINATION: Pagination = {
  page: 1,
  pageSize: PAGE_SIZE,
  totalItems: 0,
  totalPages: 0,
};

export function VoucherListView() {
  const { client, status, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = useMemo(() => queryFromSearch(searchParams), [searchParams]);
  const [draft, setDraft] = useState<FilterDraft>(() => draftFromQuery(query));
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [pagination, setPagination] = useState<Pagination>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequest = useRef(0);
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    setDraft(draftFromQuery(query));
  }, [query]);

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
    router.push(buildVoucherListHref({ ...draft, page: 1 }));
  }

  function setStatus(nextStatus: StatusFilter) {
    router.push(buildVoucherListHref({ ...draft, status: nextStatus, page: 1 }));
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
          <Select
            id="voucher-status"
            label="Trạng thái"
            value={draft.status}
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                status: event.target.value as StatusFilter,
              }));
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
              setDraft((current) => ({
                ...current,
                discountType: event.target.value as DiscountFilter,
              }));
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
              setDraft((current) => ({
                ...current,
                scopeType: event.target.value as ScopeFilter,
              }));
            }}
          >
            <option value="">Tất cả</option>
            <option value="ORDER">Toàn bộ đơn hàng</option>
            <option value="PRODUCT_TYPE">Dòng sản phẩm</option>
            <option value="PRODUCTS">Sản phẩm cụ thể</option>
            <option value="VARIANTS">Biến thể cụ thể</option>
          </Select>
          <Button size="compact" type="submit" variant="secondary">
            Áp dụng bộ lọc
          </Button>
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
          >
            {vouchers.length === 0 ? (
              <div className={styles.emptyState}>
                <h2>Chưa có mã ưu đãi phù hợp</h2>
                <p>Hãy thay đổi bộ lọc hoặc tạo một chương trình mới.</p>
              </div>
            ) : (
              vouchers.map((voucher) => <VoucherBoardCard key={voucher.id} voucher={voucher} />)
            )}
          </section>
        )}

        <div className={styles.paginationWrap}>
          <BackofficePagination
            buildHref={(page) => buildVoucherListHref({ ...draftFromQuery(query), page })}
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

function VoucherBoardCard({ voucher }: Readonly<{ voucher: Voucher }>) {
  const used = voucher.usageCounts.consumed;
  const usageSummary =
    voucher.totalUsageLimit === null || voucher.totalUsageLimit === undefined
      ? used === 0
        ? 'Chưa có lượt dùng'
        : `${String(used)} lượt đã dùng`
      : `${String(used)}/${String(voucher.totalUsageLimit)} lượt đã dùng`;

  return (
    <Link
      className={styles.voucherCard}
      href={`${VOUCHERS_ROOT}/${encodeURIComponent(voucher.id)}`}
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

function queryFromSearch(searchParams: URLSearchParams): VoucherQuery {
  const pageValue = Number(searchParams.get('page'));
  const status = parseStatus(searchParams.get('status'));
  const discountType = parseDiscount(searchParams.get('discountType'));
  const scopeType = parseScope(searchParams.get('scopeType'));
  const q = searchParams.get('q')?.trim();

  return {
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
    pageSize: PAGE_SIZE,
    ...(q === undefined || q === '' ? {} : { q }),
    ...(status === '' ? {} : { status }),
    ...(discountType === '' ? {} : { discountType }),
    ...(scopeType === '' ? {} : { scopeType }),
  };
}

function draftFromQuery(query: VoucherQuery): FilterDraft {
  return {
    q: query.q ?? '',
    status: query.status ?? '',
    discountType: query.discountType ?? '',
    scopeType: query.scopeType ?? '',
  };
}

function buildVoucherListHref(filters: FilterDraft & { readonly page: number }): string {
  const params = new URLSearchParams();
  if (filters.q.trim() !== '') params.set('q', filters.q.trim());
  if (filters.status !== '') params.set('status', filters.status);
  if (filters.discountType !== '') params.set('discountType', filters.discountType);
  if (filters.scopeType !== '') params.set('scopeType', filters.scopeType);
  if (filters.page > 1) params.set('page', String(filters.page));
  const query = params.toString();
  return query === '' ? VOUCHERS_ROOT : `${VOUCHERS_ROOT}?${query}`;
}

function parseStatus(value: string | null): StatusFilter {
  return value === 'ACTIVE' || value === 'DRAFT' || value === 'PAUSED' || value === 'ARCHIVED'
    ? value
    : '';
}

function parseDiscount(value: string | null): DiscountFilter {
  return value === 'PERCENT' || value === 'FIXED' ? value : '';
}

function parseScope(value: string | null): ScopeFilter {
  return value === 'ORDER' ||
    value === 'PRODUCT_TYPE' ||
    value === 'PRODUCTS' ||
    value === 'VARIANTS'
    ? value
    : '';
}

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}
