'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  listBackofficeOrders,
  type BackofficeOrderListItem,
  type BackofficeOrderListQuery,
} from '../../../lib/fulfillment-api';
import { useAuth } from '../../auth-provider';
import { CatalogHeader, formatMoney } from '../../catalog-ui';

interface FilterDraft {
  q: string;
  status: Exclude<BackofficeOrderListQuery['status'], undefined>;
  fulfillmentStatus: Exclude<BackofficeOrderListQuery['fulfillmentStatus'], undefined>;
  paymentStatus: Exclude<BackofficeOrderListQuery['paymentStatus'], undefined>;
  fulfillmentType: Exclude<BackofficeOrderListQuery['fulfillmentType'], undefined>;
  pickupOverdue: '' | 'true' | 'false';
  sortBy: BackofficeOrderListQuery['sortBy'];
  sortOrder: BackofficeOrderListQuery['sortOrder'];
}

const PAGE_SIZE = 20;
const DEFAULT_FILTERS: FilterDraft = {
  q: '',
  status: '',
  fulfillmentStatus: '',
  paymentStatus: '',
  fulfillmentType: 'SHIPPING',
  pickupOverdue: '',
  sortBy: 'placedAt',
  sortOrder: 'desc',
};

export default function BackofficeOrdersPage() {
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [draft, setDraft] = useState<FilterDraft>(DEFAULT_FILTERS);
  const [query, setQuery] = useState<BackofficeOrderListQuery>(() =>
    queryFromDraft(DEFAULT_FILTERS),
  );
  const [orders, setOrders] = useState<BackofficeOrderListItem[]>([]);
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
    void listBackofficeOrders(client, query)
      .then((result) => {
        if (!active) return;
        setOrders(result.data);
        setPagination(result.pagination);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'Không thể tải danh sách đơn hàng.');
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
    setQuery(queryFromDraft(draft));
  };

  const resetFilters = () => {
    setDraft(DEFAULT_FILTERS);
    setQuery(queryFromDraft(DEFAULT_FILTERS));
  };

  return (
    <>
      <CatalogHeader />
      <main className="backoffice-shell fulfillment-shell">
        <header className="backoffice-page-heading">
          <div>
            <p className="eyebrow">Backoffice</p>
            <h1>Vận hành đơn hàng</h1>
            <p>Chuẩn bị pickup hoặc theo dõi bàn giao, COD và hàng hoàn của đơn shipping.</p>
          </div>
          <Link className="button" href="/backoffice/payments">
            Review cọc
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
            Bạn không có quyền vận hành đơn hàng.
          </div>
        ) : null}

        {status === 'authenticated' && isStaff ? (
          <>
            <form className="fulfillment-filters" onSubmit={applyFilters}>
              <label className="filter-wide">
                Tìm đơn hoặc khách hàng
                <input
                  value={draft.q}
                  maxLength={100}
                  placeholder="Mã đơn, tên, email hoặc số điện thoại"
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, q: event.target.value }));
                  }}
                />
              </label>
              <label>
                Hình thức nhận hàng
                <select
                  value={draft.fulfillmentType}
                  onChange={(event) => {
                    const fulfillmentType = event.target.value as FilterDraft['fulfillmentType'];
                    setDraft((current) => ({
                      ...current,
                      fulfillmentType,
                      pickupOverdue: fulfillmentType === 'SHIPPING' ? '' : current.pickupOverdue,
                      sortBy:
                        fulfillmentType === 'SHIPPING' && current.sortBy === 'pickupHoldUntil'
                          ? 'placedAt'
                          : current.sortBy,
                    }));
                  }}
                >
                  <option value="">Tất cả</option>
                  <option value="PICKUP">Nhận tại cửa hàng</option>
                  <option value="SHIPPING">Giao hàng</option>
                </select>
              </label>
              <label>
                Trạng thái đơn
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
                  {['PLACED', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Giao nhận
                <select
                  value={draft.fulfillmentStatus}
                  onChange={(event) => {
                    setDraft((current) => ({
                      ...current,
                      fulfillmentStatus: event.target.value as FilterDraft['fulfillmentStatus'],
                    }));
                  }}
                >
                  <option value="">Tất cả</option>
                  {[
                    'PENDING',
                    'PREPARING',
                    'READY',
                    'IN_TRANSIT',
                    'COMPLETED',
                    'FAILED',
                    'RETURNED',
                    'CANCELLED',
                  ].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Thanh toán
                <select
                  value={draft.paymentStatus}
                  onChange={(event) => {
                    setDraft((current) => ({
                      ...current,
                      paymentStatus: event.target.value as FilterDraft['paymentStatus'],
                    }));
                  }}
                >
                  <option value="">Tất cả</option>
                  {['UNPAID', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].map(
                    (value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Deadline pickup
                <select
                  value={draft.pickupOverdue}
                  disabled={draft.fulfillmentType === 'SHIPPING'}
                  onChange={(event) => {
                    setDraft((current) => ({
                      ...current,
                      pickupOverdue: event.target.value as FilterDraft['pickupOverdue'],
                    }));
                  }}
                >
                  <option value="">Tất cả</option>
                  <option value="true">Đã quá hạn</option>
                  <option value="false">Còn hạn</option>
                </select>
              </label>
              <label>
                Sắp xếp
                <select
                  value={draft.sortBy}
                  onChange={(event) => {
                    setDraft((current) => ({
                      ...current,
                      sortBy: event.target.value as FilterDraft['sortBy'],
                    }));
                  }}
                >
                  <option value="placedAt">Thời gian đặt</option>
                  <option value="updatedAt">Cập nhật gần nhất</option>
                  <option value="grandTotal">Tổng tiền</option>
                  {draft.fulfillmentType === 'SHIPPING' ? null : (
                    <option value="pickupHoldUntil">Hạn giữ hàng</option>
                  )}
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
              <div className="filter-actions">
                <button className="button primary" type="submit" disabled={loading}>
                  Áp dụng
                </button>
                <button className="button" type="button" onClick={resetFilters} disabled={loading}>
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
              <strong>{loading ? 'Đang tải…' : `${String(pagination.totalItems)} đơn hàng`}</strong>
              <span>
                Trang {pagination.page}/{Math.max(pagination.totalPages, 1)}
              </span>
            </div>
            {!loading && orders.length === 0 ? (
              <section className="empty-state">
                <h2>Không có đơn phù hợp</h2>
                <p>Thử thay đổi bộ lọc hoặc tạo một checkout phù hợp.</p>
              </section>
            ) : null}
            <section className="fulfillment-queue" aria-label="Danh sách đơn hàng backoffice">
              {orders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </section>
            <div className="pagination-actions">
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
            </div>
          </>
        ) : null}
      </main>
    </>
  );
}

function OrderCard({ order }: { order: BackofficeOrderListItem }) {
  return (
    <Link className="fulfillment-order-card" href={`/backoffice/orders/${order.id}`}>
      <div className="fulfillment-order-primary">
        <span>{order.orderNumber}</span>
        <strong>{order.firstItemName}</strong>
        <small>
          {order.contactName}
          {order.contactEmail === null ? '' : ` · ${order.contactEmail}`}
        </small>
        <small>{order.totalItemQuantity} sản phẩm</small>
      </div>
      <div className="fulfillment-order-finance">
        <strong>{formatMoney(order.grandTotal)} ₫</strong>
        <span>Còn thu {formatMoney(order.balanceDue)} ₫</span>
        {order.fulfillmentType === 'PICKUP' ? (
          <>
            <time>
              Giữ đến {order.pickupHoldUntil === null ? '—' : dateTime(order.pickupHoldUntil)}
            </time>
            {order.pickupOverdue ? <strong className="overdue-label">Đã quá hạn</strong> : null}
          </>
        ) : (
          <span>
            Giao hàng
            {order.location === null ? '' : ` · ${order.location.code}`}
          </span>
        )}
      </div>
      <div className="fulfillment-order-statuses">
        <span>{order.status}</span>
        <span>{order.fulfillmentStatus}</span>
        <span>{order.paymentStatus}</span>
      </div>
    </Link>
  );
}

function queryFromDraft(draft: FilterDraft): BackofficeOrderListQuery {
  return {
    ...(draft.q.trim() === '' ? {} : { q: draft.q.trim() }),
    status: draft.status,
    fulfillmentStatus: draft.fulfillmentStatus,
    paymentStatus: draft.paymentStatus,
    fulfillmentType: draft.fulfillmentType,
    ...(draft.pickupOverdue === '' ? {} : { pickupOverdue: draft.pickupOverdue === 'true' }),
    page: 1,
    pageSize: PAGE_SIZE,
    sortBy: draft.sortBy,
    sortOrder: draft.sortOrder,
  };
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
