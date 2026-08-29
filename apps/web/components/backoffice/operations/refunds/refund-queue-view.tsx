'use client';

import { ArrowRightIcon, ClockCountdownIcon } from '@phosphor-icons/react/ssr';
import NextLink from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { useAuth } from '@/app/auth-provider';
import {
  BackofficeDataBoard,
  BackofficeFilterToolbar,
  BackofficePagination,
} from '@/components/backoffice/catalog-voucher-primitives';
import { Button, InlineAlert, Input, Select, Skeleton, StatusChip } from '@/components/ui';
import { listBackofficeRefunds, type RefundListItem, type RefundListQuery } from '@/lib/refund-api';
import { OperationsPageHeader } from '../operations-primitives';
import { OperationsShell } from '../operations-shell';
import {
  REFUND_DEFAULT_QUERY,
  refundDateTime,
  refundMethodLabel,
  refundMoney,
  refundQueryFromSearch,
  refundQueryHref,
  refundRequesterTypeLabel,
  refundStatusPresentation,
} from './refund-presenter';
import styles from './refunds.module.css';

interface RefundFilterDraft {
  readonly createdFrom: string;
  readonly createdTo: string;
  readonly method: NonNullable<RefundListQuery['method']>;
  readonly orderNumber: string;
  readonly sortBy: RefundListQuery['sortBy'];
  readonly sortOrder: RefundListQuery['sortOrder'];
  readonly status: NonNullable<RefundListQuery['status']>;
}

export function RefundQueueView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const query = useMemo(() => refundQueryFromSearch(new URLSearchParams(searchKey)), [searchKey]);
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [draft, setDraft] = useState<RefundFilterDraft>(() => draftFromQuery(query));
  const [refunds, setRefunds] = useState<RefundListItem[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(draftFromQuery(query));
  }, [query]);

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (status !== 'authenticated' || !isStaff) return;
    let active = true;
    setLoading(true);
    setError(null);
    void listBackofficeRefunds(client, query)
      .then((result) => {
        if (!active) return;
        setRefunds(result.data);
        setPagination(result.pagination);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'Không thể tải danh sách hoàn tiền.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, isStaff, query, refreshKey, status]);

  function applyFilters(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    router.replace(refundQueryHref(queryFromDraft(draft), 1), { scroll: false });
  }

  function resetFilters() {
    router.replace(refundQueryHref(REFUND_DEFAULT_QUERY), { scroll: false });
  }

  return (
    <OperationsShell
      breadcrumbs={[{ href: '/backoffice', label: 'Tổng quan' }, { label: 'Hoàn tiền' }]}
    >
      <OperationsPageHeader
        description="Theo dõi từng yêu cầu và xác nhận đúng phương thức hoàn tiền."
        eyebrow="Tài chính"
        meta={
          <span className={styles.queueMeta}>
            <ClockCountdownIcon aria-hidden="true" size={18} />
            Ưu tiên yêu cầu cũ nhất
          </span>
        }
        title="Hoàn tiền"
      />

      <BackofficeFilterToolbar
        actions={
          <>
            <Button loading={loading} loadingLabel="Đang cập nhật" type="submit">
              Áp dụng
            </Button>
            <Button disabled={loading} type="button" variant="secondary" onClick={resetFilters}>
              Đặt lại
            </Button>
          </>
        }
        summary={`${String(pagination.totalItems)} yêu cầu hoàn tiền`}
        onSubmit={applyFilters}
      >
        <Select
          id="refund-status"
          label="Trạng thái"
          value={draft.status}
          onChange={(event) => {
            setDraft({ ...draft, status: event.target.value as RefundFilterDraft['status'] });
          }}
        >
          <option value="">Tất cả</option>
          <option value="REQUESTED">Chờ xử lý</option>
          <option value="PROCESSING">Đang xử lý</option>
          <option value="COMPLETED">Đã hoàn tiền</option>
          <option value="REJECTED">Đã từ chối</option>
          <option value="CANCELLED">Đã hủy</option>
        </Select>
        <Select
          id="refund-method"
          label="Phương thức"
          value={draft.method}
          onChange={(event) => {
            setDraft({ ...draft, method: event.target.value as RefundFilterDraft['method'] });
          }}
        >
          <option value="">Tất cả</option>
          <option value="BANK_TRANSFER">Chuyển khoản</option>
          <option value="CASH">Tiền mặt</option>
          <option value="OTHER">Phương thức khác</option>
        </Select>
        <Input
          id="refund-order-number"
          label="Mã đơn"
          maxLength={64}
          placeholder="Nhập mã đơn"
          value={draft.orderNumber}
          onChange={(event) => {
            setDraft({ ...draft, orderNumber: event.target.value });
          }}
        />
        <Input
          id="refund-created-from"
          label="Tạo từ"
          type="datetime-local"
          value={draft.createdFrom}
          onChange={(event) => {
            setDraft({ ...draft, createdFrom: event.target.value });
          }}
        />
        <Input
          id="refund-created-to"
          label="Tạo đến"
          type="datetime-local"
          value={draft.createdTo}
          onChange={(event) => {
            setDraft({ ...draft, createdTo: event.target.value });
          }}
        />
        <Select
          id="refund-sort"
          label="Sắp xếp"
          value={`${draft.sortBy}:${draft.sortOrder}`}
          onChange={(event) => {
            const [sortBy, sortOrder] = event.target.value.split(':') as [
              RefundListQuery['sortBy'],
              RefundListQuery['sortOrder'],
            ];
            setDraft({ ...draft, sortBy, sortOrder });
          }}
        >
          <option value="createdAt:asc">Yêu cầu cũ nhất</option>
          <option value="createdAt:desc">Yêu cầu mới nhất</option>
          <option value="processingAt:asc">Nhận xử lý sớm nhất</option>
          <option value="processingAt:desc">Nhận xử lý gần nhất</option>
          <option value="amount:desc">Số tiền cao nhất</option>
          <option value="amount:asc">Số tiền thấp nhất</option>
        </Select>
      </BackofficeFilterToolbar>

      {error === null ? null : (
        <InlineAlert ref={errorRef} tabIndex={-1} title="Chưa tải được danh sách" tone="danger">
          <p>{error}</p>
          <Button
            size="compact"
            variant="secondary"
            onClick={() => {
              setRefreshKey((value) => value + 1);
            }}
          >
            Thử lại
          </Button>
        </InlineAlert>
      )}

      {loading && refunds.length === 0 ? (
        <RefundQueueSkeleton />
      ) : (
        <RefundQueueTable loading={loading} refunds={refunds} />
      )}

      <BackofficePagination
        buildHref={(page) => refundQueryHref(query, page)}
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
      />
    </OperationsShell>
  );
}

export function RefundQueueTable({
  loading = false,
  refunds,
}: Readonly<{ loading?: boolean; refunds: readonly RefundListItem[] }>) {
  return (
    <BackofficeDataBoard
      ariaLabel="Danh sách hoàn tiền"
      columns={refundColumns}
      emptyDescription="Hãy thay đổi bộ lọc hoặc kiểm tra lại sau."
      emptyTitle="Không có yêu cầu hoàn tiền phù hợp"
      getRowKey={(refund) => refund.id}
      loading={loading}
      rows={refunds}
    />
  );
}

const refundColumns = [
  {
    key: 'order',
    label: 'Đơn hàng',
    mobileRole: 'primary' as const,
    render: (refund: RefundListItem) => (
      <span className={styles.primaryCell}>
        <strong>{refund.orderNumber}</strong>
        <small>
          {refund.requester?.fullName ?? refundRequesterTypeLabel(refund.requestedByType)}
        </small>
      </span>
    ),
  },
  {
    key: 'method',
    label: 'Phương thức',
    render: (refund: RefundListItem) => refundMethodLabel(refund.method),
  },
  {
    align: 'end' as const,
    key: 'amount',
    label: 'Số tiền hoàn',
    render: (refund: RefundListItem) => <strong>{refundMoney(refund.amount)}</strong>,
  },
  {
    key: 'created',
    label: 'Thời điểm tạo',
    render: (refund: RefundListItem) => refundDateTime(refund.createdAt),
  },
  {
    key: 'status',
    label: 'Trạng thái',
    render: (refund: RefundListItem) => {
      const presentation = refundStatusPresentation(refund.status);
      return <StatusChip label={presentation.label} tone={presentation.tone} />;
    },
  },
  {
    align: 'end' as const,
    key: 'action',
    label: 'Thao tác',
    mobileRole: 'action' as const,
    render: (refund: RefundListItem) => (
      <NextLink className={styles.rowAction} href={`/backoffice/refunds/${refund.id}`}>
        Mở hồ sơ
        <ArrowRightIcon aria-hidden="true" size={18} />
      </NextLink>
    ),
  },
] as const;

function RefundQueueSkeleton() {
  return (
    <section className={styles.queueSkeleton} aria-label="Đang tải danh sách" role="status">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index}>
          <Skeleton height="1.1rem" width="28%" />
          <Skeleton height="1.1rem" width="16%" />
          <Skeleton height="1.1rem" width="20%" />
          <Skeleton height="1.1rem" width="14%" />
        </div>
      ))}
      <span className="rp-visually-hidden">Đang tải danh sách hoàn tiền…</span>
    </section>
  );
}

function draftFromQuery(query: RefundListQuery): RefundFilterDraft {
  return {
    status: query.status ?? '',
    method: query.method ?? '',
    orderNumber: query.orderNumber ?? '',
    createdFrom: localDateTime(query.createdFrom),
    createdTo: localDateTime(query.createdTo),
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  };
}

function queryFromDraft(draft: RefundFilterDraft): RefundListQuery {
  const createdFrom = isoDate(draft.createdFrom);
  const createdTo = isoDate(draft.createdTo);
  return {
    status: draft.status,
    method: draft.method,
    ...(draft.orderNumber.trim().length === 0
      ? {}
      : { orderNumber: draft.orderNumber.trim().toUpperCase() }),
    ...(createdFrom === undefined ? {} : { createdFrom }),
    ...(createdTo === undefined ? {} : { createdTo }),
    page: 1,
    pageSize: 20,
    sortBy: draft.sortBy,
    sortOrder: draft.sortOrder,
  };
}

function isoDate(value: string): string | undefined {
  if (value.length === 0) return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function localDateTime(value: string | undefined): string {
  if (value === undefined || Number.isNaN(Date.parse(value))) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
