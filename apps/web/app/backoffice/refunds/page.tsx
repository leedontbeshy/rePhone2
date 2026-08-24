'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  listBackofficeRefunds,
  type RefundListItem,
  type RefundListQuery,
} from '../../../lib/refund-api';
import { useAuth } from '../../auth-provider';
import { CatalogHeader, formatMoney } from '../../catalog-ui';

interface FilterDraft {
  status: NonNullable<RefundListQuery['status']>;
  method: NonNullable<RefundListQuery['method']>;
  orderNumber: string;
  createdFrom: string;
  createdTo: string;
  sortBy: RefundListQuery['sortBy'];
  sortOrder: RefundListQuery['sortOrder'];
}

const PAGE_SIZE = 20;
const DEFAULT_FILTERS: FilterDraft = {
  status: 'REQUESTED',
  method: '',
  orderNumber: '',
  createdFrom: '',
  createdTo: '',
  sortBy: 'createdAt',
  sortOrder: 'asc',
};

export default function BackofficeRefundsPage() {
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [draft, setDraft] = useState<FilterDraft>(DEFAULT_FILTERS);
  const [query, setQuery] = useState<RefundListQuery>(() => queryFromDraft(DEFAULT_FILTERS, 1));
  const [refunds, setRefunds] = useState<RefundListItem[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

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
        setError(caught instanceof Error ? caught.message : 'Không thể tải hàng chờ hoàn tiền.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, isStaff, query, status]);

  const applyFilters = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuery(queryFromDraft(draft, 1));
  };

  const resetFilters = () => {
    setDraft(DEFAULT_FILTERS);
    setQuery(queryFromDraft(DEFAULT_FILTERS, 1));
  };

  return (
    <>
      <CatalogHeader />
      <main className="backoffice-shell payment-review-shell">
        <header className="backoffice-page-heading">
          <div>
            <p className="eyebrow">Backoffice</p>
            <h1>Hoàn tiền</h1>
            <p>Hàng chờ mặc định ưu tiên yêu cầu được tạo sớm nhất.</p>
          </div>
          <Link className="button" href="/backoffice/orders">
            Đơn hàng
          </Link>
        </header>

        {status === 'loading' ? <div className="status">Đang kiểm tra phiên đăng nhập…</div> : null}
        {status === 'anonymous' ? (
          <section className="empty-state">
            <h2>Cần đăng nhập nhân viên</h2>
            <Link className="button primary" href="/login">
              Đăng nhập
            </Link>
          </section>
        ) : null}
        {status === 'authenticated' && !isStaff ? (
          <div className="commerce-alert error" role="alert">
            Bạn không có quyền mở hàng chờ hoàn tiền.
          </div>
        ) : null}

        {status === 'authenticated' && isStaff ? (
          <>
            <form className="payment-review-filters" onSubmit={applyFilters}>
              <label>
                Trạng thái
                <select
                  value={draft.status}
                  onChange={(event) => {
                    setDraft((current) => ({
                      ...current,
                      status: event.target.value as FilterDraft['status'],
                    }));
                  }}
                >
                  <option value="">Tất cả</option>
                  <option value="REQUESTED">Chờ xử lý</option>
                  <option value="PROCESSING">Đang xử lý</option>
                  <option value="COMPLETED">Đã hoàn tất</option>
                  <option value="REJECTED">Bị từ chối</option>
                  <option value="CANCELLED">Đã hủy</option>
                </select>
              </label>
              <label>
                Phương thức
                <select
                  value={draft.method}
                  onChange={(event) => {
                    setDraft((current) => ({
                      ...current,
                      method: event.target.value as FilterDraft['method'],
                    }));
                  }}
                >
                  <option value="">Tất cả</option>
                  <option value="BANK_TRANSFER">Chuyển khoản</option>
                  <option value="CASH">Tiền mặt</option>
                  <option value="OTHER">Legacy/khác</option>
                </select>
              </label>
              <label className="filter-wide">
                Mã đơn
                <input
                  value={draft.orderNumber}
                  maxLength={64}
                  placeholder="RPH-YYYYMMDD-…"
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, orderNumber: event.target.value }));
                  }}
                />
              </label>
              <label>
                Tạo từ
                <input
                  type="datetime-local"
                  value={draft.createdFrom}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, createdFrom: event.target.value }));
                  }}
                />
              </label>
              <label>
                Tạo đến
                <input
                  type="datetime-local"
                  value={draft.createdTo}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, createdTo: event.target.value }));
                  }}
                />
              </label>
              <label>
                Sắp xếp theo
                <select
                  value={draft.sortBy}
                  onChange={(event) => {
                    setDraft((current) => ({
                      ...current,
                      sortBy: event.target.value as FilterDraft['sortBy'],
                    }));
                  }}
                >
                  <option value="createdAt">Thời điểm tạo</option>
                  <option value="processingAt">Bắt đầu xử lý</option>
                  <option value="amount">Số tiền</option>
                </select>
              </label>
              <label>
                Thứ tự
                <select
                  value={draft.sortOrder}
                  onChange={(event) => {
                    setDraft((current) => ({
                      ...current,
                      sortOrder: event.target.value as FilterDraft['sortOrder'],
                    }));
                  }}
                >
                  <option value="asc">Cũ nhất</option>
                  <option value="desc">Mới nhất</option>
                </select>
              </label>
              <div className="filter-actions field-wide">
                <button className="button primary" type="submit" disabled={loading}>
                  Áp dụng
                </button>
                <button className="button" type="button" disabled={loading} onClick={resetFilters}>
                  Đặt lại
                </button>
              </div>
            </form>

            {error === null ? null : (
              <div ref={errorRef} tabIndex={-1} className="commerce-alert error" role="alert">
                <span>{error}</span>
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    setQuery({ ...query });
                  }}
                >
                  Thử lại
                </button>
              </div>
            )}
            <div className="payment-queue-summary" aria-live="polite">
              <strong>{loading ? 'Đang tải…' : `${String(pagination.totalItems)} yêu cầu`}</strong>
              <span>
                Trang {pagination.page}/{Math.max(1, pagination.totalPages)}
              </span>
            </div>
            {!loading && refunds.length === 0 ? (
              <section className="empty-state">
                <h2>Không có yêu cầu hoàn tiền phù hợp</h2>
                <p>Hãy đổi bộ lọc hoặc quay lại sau.</p>
              </section>
            ) : null}
            <section className="payment-queue" aria-label="Hàng chờ hoàn tiền">
              {refunds.map((refund) => (
                <RefundQueueCard key={refund.id} refund={refund} />
              ))}
            </section>
            <nav className="pagination" aria-label="Phân trang hoàn tiền">
              <button
                className="button"
                type="button"
                disabled={loading || pagination.page <= 1}
                onClick={() => {
                  setQuery((current) => ({ ...current, page: current.page - 1 }));
                }}
              >
                Trang trước
              </button>
              <span>
                Trang {pagination.page}/{Math.max(1, pagination.totalPages)}
              </span>
              <button
                className="button"
                type="button"
                disabled={loading || pagination.page >= pagination.totalPages}
                onClick={() => {
                  setQuery((current) => ({ ...current, page: current.page + 1 }));
                }}
              >
                Trang sau
              </button>
            </nav>
          </>
        ) : null}
      </main>
    </>
  );
}

function RefundQueueCard({ refund }: { refund: RefundListItem }) {
  const age = refund.status === 'REQUESTED' ? ageLabel(refund.createdAt) : null;
  return (
    <Link className="payment-queue-card" href={`/backoffice/refunds/${refund.id}`}>
      <div className="payment-queue-primary">
        <span>{refund.orderNumber}</span>
        <strong>{formatMoney(refund.amount)} ₫</strong>
        <small>
          {methodLabel(refund.method)} · {requesterLabel(refund)}
        </small>
        {refund.reason === '' ? null : <small>{refund.reason}</small>}
      </div>
      <div className="payment-queue-meta">
        <span className={`payment-status-badge ${refund.status.toLowerCase()}`}>
          {statusLabel(refund.status)}
        </span>
        {age === null ? null : <strong className="overdue-label">{age}</strong>}
        <time>{dateTime(refund.createdAt)}</time>
      </div>
    </Link>
  );
}

function queryFromDraft(draft: FilterDraft, page: number): RefundListQuery {
  const createdFrom = isoDate(draft.createdFrom);
  const createdTo = isoDate(draft.createdTo);
  return {
    status: draft.status,
    method: draft.method,
    ...(draft.orderNumber.trim() === ''
      ? {}
      : { orderNumber: draft.orderNumber.trim().toUpperCase() }),
    ...(createdFrom === undefined ? {} : { createdFrom }),
    ...(createdTo === undefined ? {} : { createdTo }),
    page,
    pageSize: PAGE_SIZE,
    sortBy: draft.sortBy,
    sortOrder: draft.sortOrder,
  };
}

function requesterLabel(refund: RefundListItem): string {
  if (refund.requester !== null) return refund.requester.fullName;
  if (refund.requesterType === 'SYSTEM') return 'Hệ thống';
  if (refund.requesterType === 'CUSTOMER') return 'Khách hàng/guest';
  return 'Nhân viên';
}

function methodLabel(value: string): string {
  if (value === 'BANK_TRANSFER') return 'Chuyển khoản';
  if (value === 'CASH') return 'Tiền mặt';
  return 'Legacy/khác';
}

function statusLabel(value: string): string {
  if (value === 'REQUESTED') return 'Chờ xử lý';
  if (value === 'PROCESSING') return 'Đang xử lý';
  if (value === 'COMPLETED') return 'Đã hoàn tất';
  if (value === 'REJECTED') return 'Bị từ chối';
  if (value === 'CANCELLED') return 'Đã hủy';
  return value;
}

function ageLabel(value: string): string | null {
  const createdAt = Date.parse(value);
  if (Number.isNaN(createdAt)) return null;
  const hours = Math.max(0, Math.floor((Date.now() - createdAt) / (60 * 60 * 1000)));
  return hours < 24 ? `Chờ ${String(hours)} giờ` : `Chờ ${String(Math.floor(hours / 24))} ngày`;
}

function isoDate(value: string): string | undefined {
  if (value === '') return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function dateTime(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? value
    : new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(timestamp);
}
