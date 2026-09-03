'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { useAuth } from '@/app/auth-provider';
import {
  OperationsPageHeader,
  OperationsPagination,
  OperationsPanel,
} from '../operations-primitives';
import {
  focusQueueReadError,
  isCurrentQueueRequest,
  queuePageWithinTotal,
  queueReadPresentation,
} from '../queue-read-model';
import { OperationsShell } from '../operations-shell';
import {
  Button,
  ErrorSummary,
  InlineAlert,
  Input,
  Select,
  Skeleton,
  StatusChip,
} from '@/components/ui';
import {
  listBackofficeAfterSales,
  type AfterSalesListItem,
  type AfterSalesListQuery,
  type AfterSalesStatus,
  type AfterSalesType,
} from '@/lib/after-sales-backoffice-api';
import {
  afterSalesAssigneeLabel,
  afterSalesStatusPresentation,
  afterSalesTypeLabel,
  formatAfterSalesDateTime,
} from './after-sales-presenter';
import styles from './after-sales.module.css';

const PAGE_SIZE = 20;

export interface AfterSalesFilterDraft {
  createdFrom: string;
  createdTo: string;
  q: string;
  sort: 'newest' | 'oldest' | 'recently-updated';
  status: AfterSalesStatus | '';
  type: AfterSalesType | '';
}

export interface AfterSalesFilterErrors {
  createdFrom?: string;
  createdTo?: string;
  q?: string;
}

const EMPTY_FILTERS: AfterSalesFilterDraft = {
  createdFrom: '',
  createdTo: '',
  q: '',
  sort: 'newest',
  status: '',
  type: '',
};

export function AfterSalesQueueView() {
  const { client, status: authStatus, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const filters = useMemo(() => filtersFromParams(searchParams), [searchKey, searchParams]);
  const query = useMemo(() => queryFromParams(searchParams), [searchKey, searchParams]);
  const [draft, setDraft] = useState(filters);
  const [items, setItems] = useState<AfterSalesListItem[]>([]);
  const [pagination, setPagination] = useState({
    page: query.page,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null);
  const [filterErrors, setFilterErrors] = useState<AfterSalesFilterErrors>({});
  const errorRef = useRef<HTMLDivElement>(null);
  const filterErrorRef = useRef<HTMLDivElement>(null);
  const listRequestRef = useRef(0);
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';

  useEffect(() => {
    setDraft(filters);
    setFilterErrors({});
  }, [filters]);

  useEffect(() => {
    if (error !== null) focusQueueReadError(errorRef.current);
  }, [error]);

  useEffect(() => {
    if (Object.keys(filterErrors).length > 0) filterErrorRef.current?.focus();
  }, [filterErrors]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !isStaff) return;
    const request = ++listRequestRef.current;
    setLoading(true);
    setError(null);
    void listBackofficeAfterSales(client, query)
      .then((result) => {
        if (!isCurrentQueueRequest(request, listRequestRef.current)) return;
        const authoritativePage = queuePageWithinTotal(query.page, result.pagination.totalPages);
        if (authoritativePage !== query.page) {
          const params = paramsFromFilters(filters, authoritativePage);
          const suffix = params.toString();
          router.replace(suffix === '' ? pathname : `${pathname}?${suffix}`, { scroll: false });
          return;
        }
        setItems(result.data);
        setPagination(result.pagination);
        setLoadedQueryKey(searchKey);
      })
      .catch((caught: unknown) => {
        if (!isCurrentQueueRequest(request, listRequestRef.current)) return;
        setError(
          caught instanceof Error ? caught.message : 'Không thể tải danh sách hỗ trợ sau mua.',
        );
      })
      .finally(() => {
        if (isCurrentQueueRequest(request, listRequestRef.current)) setLoading(false);
      });
    return () => {
      if (isCurrentQueueRequest(request, listRequestRef.current)) listRequestRef.current += 1;
    };
  }, [authStatus, client, filters, isStaff, pathname, query, router, searchKey]);

  function applyFilters(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateAfterSalesFilters(draft);
    if (Object.keys(nextErrors).length > 0) {
      setFilterErrors(nextErrors);
      return;
    }
    setFilterErrors({});
    navigate(draft, 1);
  }

  function navigate(next: AfterSalesFilterDraft, page: number) {
    const params = paramsFromFilters(next, page);
    const suffix = params.toString();
    router.replace(suffix === '' ? pathname : `${pathname}?${suffix}`, { scroll: false });
  }

  const readPresentation = queueReadPresentation(loading, error, searchKey, loadedQueryKey);

  return (
    <OperationsShell breadcrumbs={[{ label: 'Hỗ trợ sau mua' }]}>
      <div className={styles.page}>
        <OperationsPageHeader
          description="Tiếp nhận, kiểm tra và hoàn tất từng yêu cầu theo đúng điều kiện của đơn hàng."
          eyebrow="Sau mua"
          meta={
            readPresentation.updating
              ? 'Đang cập nhật danh sách…'
              : `${String(pagination.totalItems)} yêu cầu`
          }
          title="Hỗ trợ sau mua"
        />

        <OperationsPanel title="Tìm hồ sơ cần xử lý">
          <form className={styles.filters} noValidate onSubmit={applyFilters}>
            <Input
              error={filterErrors.q}
              id="after-sales-search"
              label="Tìm kiếm"
              maxLength={255}
              placeholder="Mã yêu cầu, đơn hàng, khách hàng hoặc sản phẩm"
              value={draft.q}
              onChange={(event) => {
                setDraft((current) => ({ ...current, q: event.target.value }));
              }}
            />
            <Select
              id="after-sales-type"
              label="Nhu cầu"
              value={draft.type}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  type: event.target.value as AfterSalesFilterDraft['type'],
                }));
              }}
            >
              <option value="">Tất cả</option>
              <option value="WARRANTY">Bảo hành</option>
              <option value="RETURN">Trả sản phẩm</option>
              <option value="EXCHANGE">Đổi sản phẩm</option>
            </Select>
            <Select
              id="after-sales-status"
              label="Tiến độ"
              value={draft.status}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  status: event.target.value as AfterSalesFilterDraft['status'],
                }));
              }}
            >
              <option value="">Tất cả</option>
              <option value="REQUESTED">Chờ tiếp nhận</option>
              <option value="RECEIVED">Đã tiếp nhận</option>
              <option value="INSPECTING">Đang kiểm tra</option>
              <option value="APPROVED">Đã chấp thuận</option>
              <option value="REJECTED">Không chấp thuận</option>
              <option value="RESOLVED">Đã hoàn tất</option>
              <option value="CANCELLED">Đã hủy</option>
            </Select>
            <Select
              id="after-sales-sort"
              label="Sắp xếp"
              value={draft.sort}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  sort: event.target.value as AfterSalesFilterDraft['sort'],
                }));
              }}
            >
              <option value="newest">Yêu cầu mới nhất</option>
              <option value="recently-updated">Vừa cập nhật</option>
              <option value="oldest">Yêu cầu cũ nhất</option>
            </Select>
            <div className={styles.filterActions}>
              <Button loading={loading} loadingLabel="Đang lọc" type="submit">
                Áp dụng
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDraft(EMPTY_FILTERS);
                  navigate(EMPTY_FILTERS, 1);
                }}
              >
                Xóa lọc
              </Button>
            </div>
            <details
              className={styles.advancedFilters}
              open={draft.createdFrom !== '' || draft.createdTo !== ''}
            >
              <summary>Thêm khoảng thời gian</summary>
              <div className={styles.advancedFields}>
                <Input
                  error={filterErrors.createdFrom}
                  id="after-sales-created-from"
                  label="Từ ngày"
                  type="date"
                  value={draft.createdFrom}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, createdFrom: event.target.value }));
                  }}
                />
                <Input
                  error={filterErrors.createdTo}
                  id="after-sales-created-to"
                  label="Đến ngày"
                  type="date"
                  value={draft.createdTo}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, createdTo: event.target.value }));
                  }}
                />
              </div>
            </details>
          </form>
          {Object.keys(filterErrors).length === 0 ? null : (
            <ErrorSummary
              ref={filterErrorRef}
              errors={filterErrorItems(filterErrors)}
              title="Kiểm tra lại điều kiện lọc"
            />
          )}
        </OperationsPanel>

        {error === null ? null : (
          <InlineAlert ref={errorRef} tabIndex={-1} title="Chưa tải được danh sách" tone="danger">
            <p>{error}</p>
            {readPresentation.retainedSnapshotNotice === null ? null : (
              <p>{readPresentation.retainedSnapshotNotice}</p>
            )}
          </InlineAlert>
        )}

        <OperationsPanel title="Hồ sơ hỗ trợ">
          <div className={styles.queueMeta}>
            <p>
              Trang {String(pagination.page)} / {String(Math.max(1, pagination.totalPages))}
            </p>
            {readPresentation.updating ? <span role="status">Đang làm mới…</span> : null}
          </div>
          {readPresentation.initialLoading ? (
            <QueueSkeleton />
          ) : items.length === 0 ? (
            <div className={styles.emptyState}>
              <h2>Chưa có hồ sơ phù hợp</h2>
              <p>Thử thay đổi từ khóa hoặc điều kiện lọc.</p>
            </div>
          ) : (
            <AfterSalesQueueList items={items} updating={readPresentation.updating} />
          )}
          <OperationsPagination
            className={styles.pagination}
            disabled={loading}
            label="Phân trang hồ sơ hỗ trợ sau mua"
            page={pagination.page}
            totalItems={pagination.totalItems}
            totalPages={pagination.totalPages}
            onPageChange={(nextPage) => {
              navigate(filters, nextPage);
            }}
          />
        </OperationsPanel>
      </div>
    </OperationsShell>
  );
}

export function AfterSalesQueueList({
  items,
  updating = false,
}: Readonly<{ items: readonly AfterSalesListItem[]; updating?: boolean }>) {
  return (
    <ul
      aria-busy={updating}
      className={styles.queueList}
      aria-label="Danh sách hồ sơ hỗ trợ sau mua"
    >
      {items.map((item) => {
        const status = afterSalesStatusPresentation(item.status);
        return (
          <li className={styles.queueItem} key={item.id}>
            <div className={styles.queuePrimary}>
              <Link href={`/backoffice/after-sales/${encodeURIComponent(item.id)}`}>
                {item.requestNumber}
              </Link>
              <span>{afterSalesTypeLabel(item.type)}</span>
            </div>
            <div className={styles.queueCell}>
              <span className={styles.queueLabel}>Sản phẩm</span>
              <strong>{item.orderItem.productName}</strong>
              <span>{item.orderItem.variantName}</span>
            </div>
            <div className={styles.queueCell}>
              <span className={styles.queueLabel}>Phụ trách</span>
              <strong>{afterSalesAssigneeLabel(item)}</strong>
              <span>{item.customer.name}</span>
            </div>
            <div className={styles.queueCell}>
              <span className={styles.queueLabel}>Cập nhật</span>
              <strong>{formatAfterSalesDateTime(item.updatedAt)}</strong>
              <span>{String(item.attachmentCount)} minh chứng</span>
            </div>
            <StatusChip label={status.label} tone={status.tone} />
          </li>
        );
      })}
    </ul>
  );
}

function QueueSkeleton() {
  return (
    <div className={styles.loadingState} aria-label="Đang tải hồ sơ hỗ trợ" role="status">
      <div className={styles.skeletonRows}>
        <Skeleton height="4.5rem" width="100%" />
        <Skeleton height="4.5rem" width="100%" />
        <Skeleton height="4.5rem" width="100%" />
      </div>
      <span className="rp-visually-hidden">Đang tải hồ sơ hỗ trợ…</span>
    </div>
  );
}

export function filtersFromParams(params: Pick<URLSearchParams, 'get'>): AfterSalesFilterDraft {
  const type = params.get('type');
  const status = params.get('status');
  const sort = params.get('sort');
  const createdFrom = normalizedDateParam(params.get('from'));
  const createdTo = normalizedDateParam(params.get('to'));
  const hasValidRange =
    createdFrom === '' || createdTo === '' || compareDateInputs(createdFrom, createdTo) <= 0;
  return {
    createdFrom: hasValidRange ? createdFrom : '',
    createdTo: hasValidRange ? createdTo : '',
    q: (params.get('q') ?? '').trim().slice(0, 255),
    sort: sort === 'oldest' || sort === 'recently-updated' || sort === 'newest' ? sort : 'newest',
    status: isAfterSalesStatus(status) ? status : '',
    type: type === 'WARRANTY' || type === 'RETURN' || type === 'EXCHANGE' ? type : '',
  };
}

export function queryFromParams(params: Pick<URLSearchParams, 'get'>): AfterSalesListQuery {
  const filters = filtersFromParams(params);
  const page = normalizedPage(params.get('page'));
  return {
    ...(filters.q.trim() === '' ? {} : { q: filters.q.trim() }),
    ...(filters.type === '' ? {} : { type: filters.type }),
    ...(filters.status === '' ? {} : { status: filters.status }),
    ...(filters.createdFrom === ''
      ? {}
      : { createdFrom: dateBoundary(filters.createdFrom, false) }),
    ...(filters.createdTo === '' ? {} : { createdTo: dateBoundary(filters.createdTo, true) }),
    page,
    pageSize: PAGE_SIZE,
    sortBy: filters.sort === 'recently-updated' ? 'updatedAt' : 'requestedAt',
    sortOrder: filters.sort === 'oldest' ? 'asc' : 'desc',
  };
}

export function paramsFromFilters(filters: AfterSalesFilterDraft, page: number): URLSearchParams {
  const params = new URLSearchParams();
  const errors = validateAfterSalesFilters(filters);
  setWhenPresent(params, 'q', filters.q.trim().slice(0, 255));
  setWhenPresent(params, 'type', filters.type);
  setWhenPresent(params, 'status', filters.status);
  if (errors.createdFrom === undefined && errors.createdTo === undefined) {
    setWhenPresent(params, 'from', filters.createdFrom);
    setWhenPresent(params, 'to', filters.createdTo);
  }
  if (filters.sort !== 'newest') params.set('sort', filters.sort);
  if (page > 1) params.set('page', String(page));
  return params;
}

export function validateAfterSalesFilters(filters: AfterSalesFilterDraft): AfterSalesFilterErrors {
  const errors: AfterSalesFilterErrors = {};
  if (filters.q.trim().length > 255) {
    errors.q = 'Từ khóa không được quá 255 ký tự.';
  }
  if (filters.createdFrom !== '' && !isDateInput(filters.createdFrom)) {
    errors.createdFrom = 'Ngày bắt đầu không hợp lệ.';
  }
  if (filters.createdTo !== '' && !isDateInput(filters.createdTo)) {
    errors.createdTo = 'Ngày kết thúc không hợp lệ.';
  }
  if (
    errors.createdFrom === undefined &&
    errors.createdTo === undefined &&
    filters.createdFrom !== '' &&
    filters.createdTo !== '' &&
    compareDateInputs(filters.createdFrom, filters.createdTo) > 0
  ) {
    errors.createdTo = 'Ngày kết thúc phải cùng hoặc sau ngày bắt đầu.';
  }
  return errors;
}

function setWhenPresent(params: URLSearchParams, key: string, value: string) {
  if (value !== '') params.set(key, value);
}

function isAfterSalesStatus(value: string | null): value is AfterSalesStatus {
  return (
    value === 'REQUESTED' ||
    value === 'RECEIVED' ||
    value === 'INSPECTING' ||
    value === 'APPROVED' ||
    value === 'REJECTED' ||
    value === 'RESOLVED' ||
    value === 'CANCELLED'
  );
}

function normalizedDateParam(value: string | null): string {
  return value !== null && isDateInput(value) ? value : '';
}

function normalizedPage(value: string | null): number {
  if (value === null || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}

function isDateInput(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function compareDateInputs(left: string, right: string): number {
  return left.localeCompare(right);
}

function dateBoundary(value: string, endOfDay: boolean): string {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
  return date.toISOString();
}

function filterErrorItems(errors: AfterSalesFilterErrors) {
  return [
    ...(errors.q === undefined
      ? []
      : [{ href: '#after-sales-search' as const, message: errors.q }]),
    ...(errors.createdFrom === undefined
      ? []
      : [{ href: '#after-sales-created-from' as const, message: errors.createdFrom }]),
    ...(errors.createdTo === undefined
      ? []
      : [{ href: '#after-sales-created-to' as const, message: errors.createdTo }]),
  ];
}
