'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  listBackofficePayments,
  type PaymentListQuery,
  type PaymentQueueItem,
} from '../../../lib/payment-api';
import { useAuth } from '../../auth-provider';
import { CatalogHeader, formatMoney } from '../../catalog-ui';

interface FilterDraft {
  status: NonNullable<PaymentListQuery['status']>;
  purpose: NonNullable<PaymentListQuery['purpose']>;
  method: NonNullable<PaymentListQuery['method']>;
  reviewOverdue: '' | 'true' | 'false';
  orderNumber: string;
  submittedFrom: string;
  submittedTo: string;
  sortBy: PaymentListQuery['sortBy'];
  sortOrder: PaymentListQuery['sortOrder'];
}

const DEFAULT_FILTERS: FilterDraft = {
  status: 'UNDER_REVIEW',
  purpose: '',
  method: '',
  reviewOverdue: '',
  orderNumber: '',
  submittedFrom: '',
  submittedTo: '',
  sortBy: 'submittedAt',
  sortOrder: 'asc',
};

const PAGE_SIZE = 20;

export default function BackofficePaymentsPage() {
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [draft, setDraft] = useState<FilterDraft>(DEFAULT_FILTERS);
  const [query, setQuery] = useState<PaymentListQuery>(() => queryFromDraft(DEFAULT_FILTERS, 1));
  const [payments, setPayments] = useState<PaymentQueueItem[]>([]);
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
    void listBackofficePayments(client, query)
      .then((result) => {
        if (!active) return;
        setPayments(result.data);
        setPagination(result.pagination);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'Không thể tải hàng chờ thanh toán.');
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
            <h1>Review thanh toán</h1>
            <p>Hàng chờ mặc định ưu tiên minh chứng nộp sớm nhất.</p>
          </div>
          <Link className="button" href="/backoffice/inventory/intake">
            Nhập máy
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
            Bạn không có quyền mở hàng chờ thanh toán.
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
                  <option value="UNDER_REVIEW">Đang review</option>
                  <option value="AWAITING_PROOF">Chờ minh chứng</option>
                  <option value="VERIFIED">Đã xác minh</option>
                  <option value="REJECTED">Bị từ chối</option>
                  <option value="EXPIRED">Đã hết hạn</option>
                  <option value="CANCELLED">Đã hủy</option>
                </select>
              </label>
              <label>
                Mục đích
                <select
                  value={draft.purpose}
                  onChange={(event) => {
                    setDraft((current) => ({
                      ...current,
                      purpose: event.target.value as FilterDraft['purpose'],
                    }));
                  }}
                >
                  <option value="">Tất cả</option>
                  <option value="DEPOSIT">Đặt cọc</option>
                  <option value="BALANCE">Phần còn lại</option>
                  <option value="FULL_PAYMENT">Thanh toán đủ</option>
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
                  <option value="COD">COD</option>
                  <option value="OTHER">Khác</option>
                </select>
              </label>
              <label>
                SLA review
                <select
                  value={draft.reviewOverdue}
                  onChange={(event) => {
                    setDraft((current) => ({
                      ...current,
                      reviewOverdue: event.target.value as FilterDraft['reviewOverdue'],
                    }));
                  }}
                >
                  <option value="">Tất cả</option>
                  <option value="true">Đã quá SLA</option>
                  <option value="false">Còn trong SLA</option>
                </select>
              </label>
              <label className="filter-wide">
                Mã đơn
                <input
                  value={draft.orderNumber}
                  placeholder="RPH-YYYYMMDD-…"
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, orderNumber: event.target.value }));
                  }}
                />
              </label>
              <label>
                Nộp từ
                <input
                  type="datetime-local"
                  value={draft.submittedFrom}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, submittedFrom: event.target.value }));
                  }}
                />
              </label>
              <label>
                Nộp đến
                <input
                  type="datetime-local"
                  value={draft.submittedTo}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, submittedTo: event.target.value }));
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
                  <option value="submittedAt">Thời điểm nộp</option>
                  <option value="expiresAt">Hạn nộp</option>
                  <option value="createdAt">Thời điểm tạo</option>
                  <option value="expectedAmount">Số tiền</option>
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
                  <option value="asc">Tăng dần</option>
                  <option value="desc">Giảm dần</option>
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
                {error}
              </div>
            )}
            <div className="payment-queue-summary" aria-live="polite">
              <strong>{pagination.totalItems}</strong> thanh toán
              {loading ? <span>Đang tải…</span> : null}
            </div>
            {!loading && payments.length === 0 ? (
              <section className="empty-state">
                <h2>Không có thanh toán phù hợp</h2>
                <p>Hãy đổi bộ lọc hoặc quay lại sau.</p>
              </section>
            ) : null}
            <section className="payment-queue" aria-label="Hàng chờ review thanh toán">
              {payments.map((payment) => (
                <PaymentQueueCard key={payment.id} payment={payment} />
              ))}
            </section>
            <nav className="pagination" aria-label="Phân trang thanh toán">
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

function PaymentQueueCard({ payment }: { payment: PaymentQueueItem }) {
  return (
    <Link className="payment-queue-card" href={`/backoffice/payments/${payment.id}`}>
      <div className="payment-queue-primary">
        <span>{payment.orderNumber || 'Chưa có mã đơn'}</span>
        <strong>{formatMoney(payment.expectedAmount)} ₫</strong>
        <small>
          {payment.contactName ?? 'Khách hàng'}
          {payment.contactEmail === null ? '' : ` · ${payment.contactEmail}`}
        </small>
      </div>
      <div className="payment-queue-meta">
        <span className={`payment-status-badge ${payment.status.toLowerCase()}`}>
          {statusLabel(payment.status)}
        </span>
        {payment.reviewOverdue ? <strong className="overdue-label">Quá SLA</strong> : null}
        <time>{dateTime(payment.submittedAt ?? payment.createdAt)}</time>
      </div>
    </Link>
  );
}

function queryFromDraft(draft: FilterDraft, page: number): PaymentListQuery {
  const submittedFrom = isoDate(draft.submittedFrom);
  const submittedTo = isoDate(draft.submittedTo);
  return {
    status: draft.status,
    purpose: draft.purpose,
    method: draft.method,
    ...(draft.reviewOverdue === '' ? {} : { reviewOverdue: draft.reviewOverdue === 'true' }),
    ...(draft.orderNumber.trim() === '' ? {} : { orderNumber: draft.orderNumber.trim() }),
    ...(submittedFrom === undefined ? {} : { submittedFrom }),
    ...(submittedTo === undefined ? {} : { submittedTo }),
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

function dateTime(value: string | null): string {
  if (value === null) return 'Chưa nộp';
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toLocaleString('vi-VN');
}

function statusLabel(value: string): string {
  if (value === 'UNDER_REVIEW') return 'Đang review';
  if (value === 'AWAITING_PROOF') return 'Chờ minh chứng';
  if (value === 'VERIFIED') return 'Đã xác minh';
  if (value === 'REJECTED') return 'Bị từ chối';
  if (value === 'EXPIRED') return 'Đã hết hạn';
  if (value === 'CANCELLED') return 'Đã hủy';
  return value;
}
