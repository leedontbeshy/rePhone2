'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  listBackofficeAfterSales,
  type AfterSalesListItem,
  type AfterSalesListQuery,
} from '../../../lib/after-sales-backoffice-api';
import { useAuth } from '../../auth-provider';
import { CatalogHeader } from '../../catalog-ui';

interface FilterDraft {
  q: string;
  type: NonNullable<AfterSalesListQuery['type']>;
  status: NonNullable<AfterSalesListQuery['status']>;
  assignedToId: string;
  createdFrom: string;
  createdTo: string;
  sortBy: AfterSalesListQuery['sortBy'];
  sortOrder: AfterSalesListQuery['sortOrder'];
}

const PAGE_SIZE = 20;
const DEFAULT_FILTERS: FilterDraft = {
  q: '',
  type: '',
  status: '',
  assignedToId: '',
  createdFrom: '',
  createdTo: '',
  sortBy: 'requestedAt',
  sortOrder: 'desc',
};

export default function BackofficeAfterSalesPage() {
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [draft, setDraft] = useState<FilterDraft>(DEFAULT_FILTERS);
  const [query, setQuery] = useState<AfterSalesListQuery>(() => queryFromDraft(DEFAULT_FILTERS, 1));
  const [cases, setCases] = useState<AfterSalesListItem[]>([]);
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
    void listBackofficeAfterSales(client, query)
      .then((result) => {
        if (!active) return;
        setCases(result.data);
        setPagination(result.pagination);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'Không thể tải hàng chờ hậu mãi.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, isStaff, query, status]);

  const submitFilters = (event: SyntheticEvent<HTMLFormElement>) => {
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
            <h1>Hậu mãi</h1>
            <p>Tiếp nhận, kiểm định và chốt phương án bảo hành, trả hàng hoặc đổi hàng.</p>
          </div>
          <Link className="button" href="/backoffice/warranties">
            Bảo hành
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
            Bạn không có quyền mở hàng chờ hậu mãi.
          </div>
        ) : null}

        {status === 'authenticated' && isStaff ? (
          <>
            <form className="payment-review-filters" onSubmit={submitFilters}>
              <label className="filter-wide">
                Tìm kiếm
                <input
                  value={draft.q}
                  maxLength={255}
                  placeholder="Mã hồ sơ, đơn hàng, bảo hành hoặc khách hàng"
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, q: event.target.value }));
                  }}
                />
              </label>
              <label>
                Loại yêu cầu
                <select
                  value={draft.type}
                  onChange={(event) => {
                    setDraft((current) => ({
                      ...current,
                      type: event.target.value as FilterDraft['type'],
                    }));
                  }}
                >
                  <option value="">Tất cả</option>
                  <option value="WARRANTY">Bảo hành</option>
                  <option value="RETURN">Trả hàng</option>
                  <option value="EXCHANGE">Đổi hàng</option>
                </select>
              </label>
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
                  <option value="REQUESTED">Mới yêu cầu</option>
                  <option value="RECEIVED">Đã tiếp nhận</option>
                  <option value="INSPECTING">Đang kiểm định</option>
                  <option value="APPROVED">Đã duyệt</option>
                  <option value="REJECTED">Từ chối</option>
                  <option value="RESOLVED">Đã xử lý</option>
                  <option value="CANCELLED">Đã hủy</option>
                </select>
              </label>
              <label>
                Nhân viên phụ trách (UUID)
                <input
                  value={draft.assignedToId}
                  placeholder="Để trống nếu không lọc"
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, assignedToId: event.target.value }));
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
                  <option value="requestedAt">Thời điểm yêu cầu</option>
                  <option value="createdAt">Thời điểm tạo</option>
                  <option value="updatedAt">Lần cập nhật cuối</option>
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
                  <option value="desc">Mới nhất</option>
                  <option value="asc">Cũ nhất</option>
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
              <strong>{loading ? 'Đang tải…' : `${String(pagination.totalItems)} hồ sơ`}</strong>
              <span>
                Trang {pagination.page}/{Math.max(1, pagination.totalPages)}
              </span>
            </div>

            {!loading && cases.length === 0 ? (
              <section className="empty-state">
                <h2>Không có hồ sơ phù hợp</h2>
                <p>Hãy đổi bộ lọc hoặc quay lại sau.</p>
              </section>
            ) : null}

            <section className="payment-queue" aria-label="Hàng chờ hậu mãi">
              {cases.map((record) => (
                <AfterSalesCard key={record.id} record={record} />
              ))}
            </section>

            <nav className="pagination" aria-label="Phân trang hậu mãi">
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

function AfterSalesCard({ record }: { record: AfterSalesListItem }) {
  return (
    <Link className="payment-queue-card" href={`/backoffice/after-sales/${record.id}`}>
      <div className="payment-queue-primary">
        <span>{record.requestNumber}</span>
        <strong>{record.orderItem.productName}</strong>
        <small>
          {record.orderItem.orderNumber} · {record.customer.name}
        </small>
        <small>{record.issueDescription}</small>
      </div>
      <div className="payment-queue-meta">
        <span className={`payment-status-badge ${record.status.toLowerCase()}`}>
          {statusLabel(record.status)}
        </span>
        <strong>{typeLabel(record.type)}</strong>
        <small>{record.assignedTo?.fullName ?? 'Chưa phân công'}</small>
        <small>{record.attachmentCount} tệp</small>
        <time>{dateTime(record.requestedAt)}</time>
      </div>
    </Link>
  );
}

function queryFromDraft(draft: FilterDraft, page: number): AfterSalesListQuery {
  const createdFrom = isoDate(draft.createdFrom);
  const createdTo = isoDate(draft.createdTo);
  return {
    ...(draft.q.trim() === '' ? {} : { q: draft.q.trim() }),
    type: draft.type,
    status: draft.status,
    ...(draft.assignedToId.trim() === '' ? {} : { assignedToId: draft.assignedToId.trim() }),
    ...(createdFrom === undefined ? {} : { createdFrom }),
    ...(createdTo === undefined ? {} : { createdTo }),
    page,
    pageSize: PAGE_SIZE,
    sortBy: draft.sortBy,
    sortOrder: draft.sortOrder,
  };
}

function isoDate(value: string): string | undefined {
  if (value === '') return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function typeLabel(value: string): string {
  if (value === 'WARRANTY') return 'Bảo hành';
  if (value === 'RETURN') return 'Trả hàng';
  if (value === 'EXCHANGE') return 'Đổi hàng';
  return value;
}

function statusLabel(value: string): string {
  if (value === 'REQUESTED') return 'Mới yêu cầu';
  if (value === 'RECEIVED') return 'Đã tiếp nhận';
  if (value === 'INSPECTING') return 'Đang kiểm định';
  if (value === 'APPROVED') return 'Đã duyệt';
  if (value === 'REJECTED') return 'Từ chối';
  if (value === 'RESOLVED') return 'Đã xử lý';
  if (value === 'CANCELLED') return 'Đã hủy';
  return value;
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
