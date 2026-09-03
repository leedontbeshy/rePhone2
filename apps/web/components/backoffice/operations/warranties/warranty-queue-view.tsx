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
import { Button, InlineAlert, Input, Select, Skeleton, StatusChip } from '@/components/ui';
import {
  listBackofficeWarranties,
  type BackofficeWarrantyListItem,
  type BackofficeWarrantyQuery,
} from '@/lib/warranty-api';
import { formatWarrantyDateTime, warrantyValidityPresentation } from './warranty-presenter';
import styles from './warranties.module.css';

const PAGE_SIZE = 20;

interface WarrantyFilters {
  q: string;
  status: '' | 'ACTIVE' | 'VOIDED';
  validity: '' | 'EXPIRED' | 'NOT_STARTED' | 'VALID';
}

const EMPTY_FILTERS: WarrantyFilters = { q: '', status: '', validity: '' };

export function WarrantyQueueView() {
  const { client, status: authStatus, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const filters = useMemo(() => filtersFromParams(searchParams), [searchKey, searchParams]);
  const query = useMemo(() => queryFromParams(searchParams), [searchKey, searchParams]);
  const [draft, setDraft] = useState(filters);
  const [items, setItems] = useState<BackofficeWarrantyListItem[]>([]);
  const [pagination, setPagination] = useState({
    page: query.page,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const listRequestRef = useRef(0);
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';

  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  useEffect(() => {
    if (error !== null) focusQueueReadError(errorRef.current);
  }, [error]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !isStaff) return;
    const request = ++listRequestRef.current;
    setLoading(true);
    setError(null);
    void listBackofficeWarranties(client, query)
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
        if (isCurrentQueueRequest(request, listRequestRef.current)) {
          setError(messageFrom(caught, 'Không thể tải danh sách bảo hành.'));
        }
      })
      .finally(() => {
        if (isCurrentQueueRequest(request, listRequestRef.current)) setLoading(false);
      });
    return () => {
      if (isCurrentQueueRequest(request, listRequestRef.current)) listRequestRef.current += 1;
    };
  }, [authStatus, client, filters, isStaff, pathname, query, router, searchKey]);

  function navigate(next: WarrantyFilters, page: number) {
    const params = paramsFromFilters(next, page);
    const suffix = params.toString();
    router.replace(suffix === '' ? pathname : `${pathname}?${suffix}`, { scroll: false });
  }

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(draft, 1);
  }

  const readPresentation = queueReadPresentation(loading, error, searchKey, loadedQueryKey);

  return (
    <OperationsShell breadcrumbs={[{ label: 'Bảo hành' }]}>
      <div className={styles.page}>
        <OperationsPageHeader
          description="Tra cứu thời hạn và theo dõi trạng thái bảo hành đã cấp cho từng sản phẩm."
          eyebrow="Sau mua"
          meta={
            readPresentation.updating
              ? 'Đang cập nhật danh sách…'
              : `${String(pagination.totalItems)} bảo hành`
          }
          title="Bảo hành đã cấp"
        />

        <OperationsPanel title="Tìm bảo hành">
          <form className={styles.filters} onSubmit={submit}>
            <Input
              id="warranty-search"
              label="Tìm kiếm"
              maxLength={255}
              placeholder="Mã bảo hành, đơn hàng, khách hàng hoặc sản phẩm"
              value={draft.q}
              onChange={(event) => {
                setDraft((current) => ({ ...current, q: event.target.value }));
              }}
            />
            <Select
              id="warranty-status"
              label="Trạng thái hồ sơ"
              value={draft.status}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  status: event.target.value as WarrantyFilters['status'],
                }));
              }}
            >
              <option value="">Tất cả</option>
              <option value="ACTIVE">Đang áp dụng</option>
              <option value="VOIDED">Đã vô hiệu</option>
            </Select>
            <Select
              id="warranty-validity"
              label="Thời hạn"
              value={draft.validity}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  validity: event.target.value as WarrantyFilters['validity'],
                }));
              }}
            >
              <option value="">Tất cả</option>
              <option value="VALID">Còn hiệu lực</option>
              <option value="EXPIRED">Đã hết hạn</option>
              <option value="NOT_STARTED">Chưa bắt đầu</option>
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
          </form>
        </OperationsPanel>

        {error === null ? null : (
          <InlineAlert ref={errorRef} tabIndex={-1} title="Chưa tải được bảo hành" tone="danger">
            <p>{error}</p>
            {readPresentation.retainedSnapshotNotice === null ? null : (
              <p>{readPresentation.retainedSnapshotNotice}</p>
            )}
          </InlineAlert>
        )}

        <OperationsPanel title="Danh sách bảo hành">
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
              <h2>Chưa có bảo hành phù hợp</h2>
              <p>Thử thay đổi từ khóa hoặc điều kiện lọc.</p>
            </div>
          ) : (
            <WarrantyQueueList items={items} updating={readPresentation.updating} />
          )}
          <OperationsPagination
            className={styles.pagination}
            disabled={loading}
            label="Phân trang danh sách bảo hành"
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

export function WarrantyQueueList({
  items,
  updating = false,
}: Readonly<{ items: readonly BackofficeWarrantyListItem[]; updating?: boolean }>) {
  return (
    <ul aria-busy={updating} className={styles.queueList} aria-label="Danh sách bảo hành đã cấp">
      {items.map((item) => {
        const validity = warrantyValidityPresentation(item);
        return (
          <li className={styles.queueItem} key={item.id}>
            <div className={styles.queueCell}>
              <Link href={`/backoffice/warranties/${encodeURIComponent(item.id)}`}>
                {item.warrantyCode}
              </Link>
              <span>Đơn {item.orderNumber}</span>
            </div>
            <div className={styles.queueCell}>
              <span className={styles.queueLabel}>Sản phẩm</span>
              <strong>{item.productName}</strong>
              <span>{item.variantName}</span>
            </div>
            <div className={styles.queueCell}>
              <span className={styles.queueLabel}>Khách hàng</span>
              <strong>{item.customer.name}</strong>
              <span>{item.customer.phone}</span>
            </div>
            <div className={styles.queueCell}>
              <span className={styles.queueLabel}>Thời hạn</span>
              <strong>Đến {formatWarrantyDateTime(item.endAt)}</strong>
              <span>{String(item.daysSnapshot)} ngày</span>
            </div>
            <StatusChip label={validity.label} tone={validity.tone} />
          </li>
        );
      })}
    </ul>
  );
}

function QueueSkeleton() {
  return (
    <div className={styles.loadingState} aria-label="Đang tải bảo hành" role="status">
      <div className={styles.skeletonRows}>
        <Skeleton height="4.5rem" width="100%" />
        <Skeleton height="4.5rem" width="100%" />
        <Skeleton height="4.5rem" width="100%" />
      </div>
      <span className="rp-visually-hidden">Đang tải bảo hành…</span>
    </div>
  );
}

function filtersFromParams(params: Pick<URLSearchParams, 'get'>): WarrantyFilters {
  const status = params.get('status');
  const validity = params.get('validity');
  return {
    q: params.get('q') ?? '',
    status: status === 'ACTIVE' || status === 'VOIDED' ? status : '',
    validity:
      validity === 'VALID' || validity === 'EXPIRED' || validity === 'NOT_STARTED' ? validity : '',
  };
}

function queryFromParams(params: Pick<URLSearchParams, 'get'>): BackofficeWarrantyQuery {
  const filters = filtersFromParams(params);
  const pageValue = Number(params.get('page') ?? '1');
  return {
    ...(filters.q.trim() === '' ? {} : { q: filters.q.trim() }),
    ...(filters.status === '' ? {} : { status: filters.status }),
    ...(filters.validity === '' ? {} : { validity: filters.validity }),
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
    pageSize: PAGE_SIZE,
  };
}

function paramsFromFilters(filters: WarrantyFilters, page: number): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q.trim() !== '') params.set('q', filters.q.trim());
  if (filters.status !== '') params.set('status', filters.status);
  if (filters.validity !== '') params.set('validity', filters.validity);
  if (page > 1) params.set('page', String(page));
  return params;
}

function messageFrom(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}
