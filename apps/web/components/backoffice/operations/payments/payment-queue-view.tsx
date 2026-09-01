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
import {
  listBackofficePayments,
  type PaymentListQuery,
  type PaymentQueueItem,
} from '@/lib/payment-api';
import { OperationsPageHeader } from '../operations-primitives';
import {
  focusQueueReadError,
  isCurrentQueueRequest,
  queuePageWithinTotal,
  queueReadPresentation,
} from '../queue-read-model';
import { OperationsShell } from '../operations-shell';
import {
  PAYMENT_DEFAULT_QUERY,
  paymentDateTime,
  paymentMethodLabel,
  paymentPurposeLabel,
  paymentQueryFromSearch,
  paymentQueryHref,
  paymentStatusPresentation,
} from './payment-presenter';
import styles from './payments.module.css';

interface PaymentFilterDraft {
  readonly method: NonNullable<PaymentListQuery['method']>;
  readonly orderNumber: string;
  readonly purpose: NonNullable<PaymentListQuery['purpose']>;
  readonly reviewOverdue: '' | 'true' | 'false';
  readonly sortBy: PaymentListQuery['sortBy'];
  readonly sortOrder: PaymentListQuery['sortOrder'];
  readonly status: NonNullable<PaymentListQuery['status']>;
  readonly submittedFrom: string;
  readonly submittedTo: string;
}

export function PaymentQueueView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const query = useMemo(() => paymentQueryFromSearch(new URLSearchParams(searchKey)), [searchKey]);
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [draft, setDraft] = useState<PaymentFilterDraft>(() => draftFromQuery(query));
  const [payments, setPayments] = useState<PaymentQueueItem[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const errorRef = useRef<HTMLDivElement>(null);
  const listRequestRef = useRef(0);

  useEffect(() => {
    setDraft(draftFromQuery(query));
  }, [query]);

  useEffect(() => {
    if (error !== null) focusQueueReadError(errorRef.current);
  }, [error]);

  useEffect(() => {
    if (status !== 'authenticated' || !isStaff) return;
    const request = ++listRequestRef.current;
    setLoading(true);
    setError(null);
    void listBackofficePayments(client, query)
      .then((result) => {
        if (!isCurrentQueueRequest(request, listRequestRef.current)) return;
        const authoritativePage = queuePageWithinTotal(query.page, result.pagination.totalPages);
        if (authoritativePage !== query.page) {
          router.replace(paymentQueryHref(query, authoritativePage), { scroll: false });
          return;
        }
        setPayments(result.data);
        setPagination(result.pagination);
        setLoadedQueryKey(searchKey);
      })
      .catch((caught: unknown) => {
        if (!isCurrentQueueRequest(request, listRequestRef.current)) return;
        setError(caught instanceof Error ? caught.message : 'Không thể tải danh sách thanh toán.');
      })
      .finally(() => {
        if (isCurrentQueueRequest(request, listRequestRef.current)) setLoading(false);
      });
    return () => {
      if (isCurrentQueueRequest(request, listRequestRef.current)) listRequestRef.current += 1;
    };
  }, [client, isStaff, query, refreshKey, router, searchKey, status]);

  function applyFilters(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    router.replace(paymentQueryHref(queryFromDraft(draft), 1), { scroll: false });
  }

  function resetFilters() {
    router.replace(paymentQueryHref(PAYMENT_DEFAULT_QUERY), { scroll: false });
  }

  const readPresentation = queueReadPresentation(loading, error, searchKey, loadedQueryKey);

  return (
    <OperationsShell
      breadcrumbs={[{ href: '/backoffice', label: 'Tổng quan' }, { label: 'Duyệt thanh toán' }]}
    >
      <OperationsPageHeader
        description="Kiểm tra minh chứng và xác nhận đúng số tiền khách đã chuyển."
        eyebrow="Tài chính"
        meta={
          <span className={styles.queueMeta}>
            <ClockCountdownIcon aria-hidden="true" size={18} />
            Ưu tiên khoản chờ lâu nhất
          </span>
        }
        title="Duyệt thanh toán"
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
        summary={`${String(pagination.totalItems)} khoản thanh toán`}
        onSubmit={applyFilters}
      >
        <Select
          id="payment-status"
          label="Trạng thái"
          value={draft.status}
          onChange={(event) => {
            setDraft({ ...draft, status: event.target.value as PaymentFilterDraft['status'] });
          }}
        >
          <option value="">Tất cả</option>
          <option value="UNDER_REVIEW">Chờ kiểm tra</option>
          <option value="AWAITING_PROOF">Chờ minh chứng</option>
          <option value="VERIFIED">Đã xác nhận</option>
          <option value="REJECTED">Đã từ chối</option>
          <option value="EXPIRED">Đã hết hạn</option>
          <option value="CANCELLED">Đã hủy</option>
        </Select>
        <Select
          id="payment-purpose"
          label="Nội dung thu"
          value={draft.purpose}
          onChange={(event) => {
            setDraft({ ...draft, purpose: event.target.value as PaymentFilterDraft['purpose'] });
          }}
        >
          <option value="">Tất cả</option>
          <option value="DEPOSIT">Đặt cọc</option>
          <option value="BALANCE">Phần còn lại</option>
          <option value="FULL_PAYMENT">Thanh toán toàn bộ</option>
        </Select>
        <Select
          id="payment-method"
          label="Phương thức"
          value={draft.method}
          onChange={(event) => {
            setDraft({ ...draft, method: event.target.value as PaymentFilterDraft['method'] });
          }}
        >
          <option value="">Tất cả</option>
          <option value="BANK_TRANSFER">Chuyển khoản</option>
          <option value="CASH">Tiền mặt</option>
          <option value="COD">Khi nhận hàng</option>
          <option value="OTHER">Khác</option>
        </Select>
        <Select
          id="payment-overdue"
          label="Thời hạn kiểm tra"
          value={draft.reviewOverdue}
          onChange={(event) => {
            setDraft({
              ...draft,
              reviewOverdue: event.target.value as PaymentFilterDraft['reviewOverdue'],
            });
          }}
        >
          <option value="">Tất cả</option>
          <option value="true">Đã quá hạn</option>
          <option value="false">Còn trong hạn</option>
        </Select>
        <Input
          id="payment-order-number"
          label="Mã đơn"
          maxLength={64}
          placeholder="Nhập mã đơn"
          value={draft.orderNumber}
          onChange={(event) => {
            setDraft({ ...draft, orderNumber: event.target.value });
          }}
        />
        <Input
          id="payment-submitted-from"
          label="Nộp từ"
          type="datetime-local"
          value={draft.submittedFrom}
          onChange={(event) => {
            setDraft({ ...draft, submittedFrom: event.target.value });
          }}
        />
        <Input
          id="payment-submitted-to"
          label="Nộp đến"
          type="datetime-local"
          value={draft.submittedTo}
          onChange={(event) => {
            setDraft({ ...draft, submittedTo: event.target.value });
          }}
        />
        <Select
          id="payment-sort"
          label="Sắp xếp"
          value={`${draft.sortBy}:${draft.sortOrder}`}
          onChange={(event) => {
            const [sortBy, sortOrder] = event.target.value.split(':') as [
              PaymentListQuery['sortBy'],
              PaymentListQuery['sortOrder'],
            ];
            setDraft({ ...draft, sortBy, sortOrder });
          }}
        >
          <option value="submittedAt:asc">Nộp lâu nhất trước</option>
          <option value="submittedAt:desc">Nộp mới nhất trước</option>
          <option value="expectedAmount:desc">Số tiền cao nhất</option>
          <option value="expectedAmount:asc">Số tiền thấp nhất</option>
        </Select>
      </BackofficeFilterToolbar>

      {error === null ? null : (
        <InlineAlert ref={errorRef} tabIndex={-1} title="Chưa tải được danh sách" tone="danger">
          <p>{error}</p>
          {readPresentation.retainedSnapshotNotice === null ? null : (
            <p>{readPresentation.retainedSnapshotNotice}</p>
          )}
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

      {readPresentation.initialLoading ? (
        <PaymentQueueSkeleton />
      ) : (
        <PaymentQueueTable loading={loading} payments={payments} />
      )}

      <BackofficePagination
        buildHref={(page) => paymentQueryHref(query, page)}
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
      />
    </OperationsShell>
  );
}

export function PaymentQueueTable({
  loading = false,
  payments,
}: Readonly<{ loading?: boolean; payments: readonly PaymentQueueItem[] }>) {
  return (
    <BackofficeDataBoard
      ariaLabel="Danh sách thanh toán"
      columns={paymentColumns}
      emptyDescription="Hãy thay đổi bộ lọc hoặc kiểm tra lại sau."
      emptyTitle="Không có khoản thanh toán phù hợp"
      getRowKey={(payment) => payment.id}
      loading={loading}
      rows={payments}
    />
  );
}

const paymentColumns = [
  {
    key: 'order',
    label: 'Đơn hàng',
    mobileRole: 'primary' as const,
    render: (payment: PaymentQueueItem) => (
      <span className={styles.primaryCell}>
        <strong>{payment.orderNumber || 'Chưa có mã đơn'}</strong>
        <small>{payment.contactName ?? 'Khách hàng'}</small>
      </span>
    ),
  },
  {
    key: 'purpose',
    label: 'Nội dung thu',
    render: (payment: PaymentQueueItem) => (
      <span className={styles.secondaryCell}>
        <strong>{paymentPurposeLabel(payment.purpose)}</strong>
        <small>{paymentMethodLabel(payment.method)}</small>
      </span>
    ),
  },
  {
    align: 'end' as const,
    key: 'amount',
    label: 'Số tiền dự kiến',
    render: (payment: PaymentQueueItem) => <strong>{money(payment.expectedAmount)}</strong>,
  },
  {
    key: 'submitted',
    label: 'Thời điểm nộp',
    render: (payment: PaymentQueueItem) =>
      paymentDateTime(payment.submittedAt ?? payment.createdAt),
  },
  {
    key: 'status',
    label: 'Trạng thái',
    render: (payment: PaymentQueueItem) => {
      const presentation = paymentStatusPresentation(payment.status);
      return (
        <span className={styles.statusCell}>
          <StatusChip label={presentation.label} tone={presentation.tone} />
          {payment.reviewOverdue ? <small>Đã quá hạn kiểm tra</small> : null}
        </span>
      );
    },
  },
  {
    align: 'end' as const,
    key: 'action',
    label: 'Thao tác',
    mobileRole: 'action' as const,
    render: (payment: PaymentQueueItem) => (
      <NextLink className={styles.rowAction} href={`/backoffice/payments/${payment.id}`}>
        Mở hồ sơ
        <ArrowRightIcon aria-hidden="true" size={18} />
      </NextLink>
    ),
  },
] as const;

function PaymentQueueSkeleton() {
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
      <span className="rp-visually-hidden">Đang tải danh sách thanh toán…</span>
    </section>
  );
}

function draftFromQuery(query: PaymentListQuery): PaymentFilterDraft {
  return {
    status: query.status ?? '',
    purpose: query.purpose ?? '',
    method: query.method ?? '',
    reviewOverdue: query.reviewOverdue === undefined ? '' : query.reviewOverdue ? 'true' : 'false',
    orderNumber: query.orderNumber ?? '',
    submittedFrom: localDateTime(query.submittedFrom),
    submittedTo: localDateTime(query.submittedTo),
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  };
}

function queryFromDraft(draft: PaymentFilterDraft): PaymentListQuery {
  const submittedFrom = isoDate(draft.submittedFrom);
  const submittedTo = isoDate(draft.submittedTo);
  return {
    status: draft.status,
    purpose: draft.purpose,
    method: draft.method,
    ...(draft.reviewOverdue === '' ? {} : { reviewOverdue: draft.reviewOverdue === 'true' }),
    ...(draft.orderNumber.trim().length === 0 ? {} : { orderNumber: draft.orderNumber.trim() }),
    ...(submittedFrom === undefined ? {} : { submittedFrom }),
    ...(submittedTo === undefined ? {} : { submittedTo }),
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

function money(value: string): string {
  const amount = Number(value);
  return `${Number.isFinite(amount) ? amount.toLocaleString('vi-VN') : '0'} đ`;
}
