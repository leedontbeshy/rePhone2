'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  listCustomerAfterSalesRequests,
  type AfterSalesListItem,
  type AfterSalesPage,
  type AfterSalesStatus,
  type AfterSalesType,
} from '../../lib/after-sales-api';
import { useAuth } from '../auth-provider';
import { CatalogHeader } from '../catalog-ui';

const PAGE_SIZE = 10;
const EMPTY_PAGE: AfterSalesPage['pagination'] = {
  page: 1,
  pageSize: PAGE_SIZE,
  totalItems: 0,
  totalPages: 0,
};

export default function CustomerAfterSalesPage() {
  const { client, status, user } = useAuth();
  const isCustomer = user?.role === 'CUSTOMER';
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [items, setItems] = useState<AfterSalesListItem[]>([]);
  const [pagination, setPagination] = useState(EMPTY_PAGE);
  const [typeFilter, setTypeFilter] = useState<AfterSalesType | ''>('');
  const [statusFilter, setStatusFilter] = useState<AfterSalesStatus | ''>('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (status !== 'authenticated' || !isCustomer) return;
    let active = true;
    setLoading(true);
    setError(null);
    void listCustomerAfterSalesRequests(client, {
      type: typeFilter,
      status: statusFilter,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        if (!active) return;
        setItems(result.data);
        setPagination(result.pagination);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(errorMessage(caught, 'Không thể tải yêu cầu hậu mãi.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, isCustomer, page, reloadKey, status, statusFilter, typeFilter]);

  return (
    <>
      <CatalogHeader />
      <main className="catalog-shell warranty-shell">
        <header className="warranty-page-heading">
          <div>
            <p className="eyebrow">Chăm sóc sau mua</p>
            <h1>Yêu cầu hậu mãi</h1>
            <p>Theo dõi yêu cầu bảo hành, đổi hoặc trả sản phẩm.</p>
          </div>
          <Link className="button" href="/orders">
            Chọn sản phẩm từ đơn hàng
          </Link>
        </header>

        {status === 'loading' ? <div className="status">Đang kiểm tra quyền truy cập…</div> : null}
        {isStaff ? (
          <div className="commerce-alert error" role="alert">
            Tài khoản nhân viên sử dụng cổng hậu mãi backoffice.
          </div>
        ) : null}
        {status === 'anonymous' ? (
          <section className="empty-state">
            <h2>Danh sách chỉ dành cho khách hàng đã đăng nhập</h2>
            <p>Khách mua không cần tài khoản vẫn có thể mở từng case từ liên kết guest đã nhận.</p>
            <Link className="button primary" href="/login">
              Đăng nhập khách hàng
            </Link>
          </section>
        ) : null}
        {error === null ? null : (
          <div ref={errorRef} tabIndex={-1} className="commerce-alert error" role="alert">
            <span>{error}</span>
            <button
              className="button"
              type="button"
              onClick={() => {
                setReloadKey((current) => current + 1);
              }}
            >
              Tải lại danh sách
            </button>
          </div>
        )}

        {status === 'authenticated' && isCustomer ? (
          <>
            <div className="catalog-filters" aria-label="Bộ lọc yêu cầu hậu mãi">
              <label>
                Loại
                <select
                  value={typeFilter}
                  disabled={loading}
                  onChange={(event) => {
                    setTypeFilter(event.target.value as AfterSalesType | '');
                    setPage(1);
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
                  value={statusFilter}
                  disabled={loading}
                  onChange={(event) => {
                    setStatusFilter(event.target.value as AfterSalesStatus | '');
                    setPage(1);
                  }}
                >
                  <option value="">Tất cả</option>
                  <option value="REQUESTED">Đã yêu cầu</option>
                  <option value="RECEIVED">Đã tiếp nhận</option>
                  <option value="INSPECTING">Đang kiểm tra</option>
                  <option value="APPROVED">Đã duyệt</option>
                  <option value="REJECTED">Bị từ chối</option>
                  <option value="RESOLVED">Đã giải quyết</option>
                  <option value="CANCELLED">Đã hủy</option>
                </select>
              </label>
            </div>
            <div className="warranty-list-summary" aria-live="polite">
              {loading ? 'Đang tải…' : `${String(pagination.totalItems)} yêu cầu`}
            </div>
            {!loading && error === null && items.length === 0 ? (
              <section className="empty-state">
                <h2>Chưa có yêu cầu hậu mãi</h2>
                <p>Mở một đơn đã hoàn tất để tạo yêu cầu cho từng sản phẩm.</p>
              </section>
            ) : null}
            <section className="warranty-card-grid" aria-label="Danh sách yêu cầu hậu mãi">
              {items.map((item) => (
                <Link
                  className="warranty-card"
                  href={`/after-sales/${encodeURIComponent(item.requestNumber)}?orderNumber=${encodeURIComponent(item.orderItem.orderNumber)}`}
                  key={item.requestNumber}
                >
                  <div className="warranty-card-heading">
                    <strong>{item.orderItem.productName}</strong>
                    <span className="warranty-badge">{statusLabel(item.status)}</span>
                  </div>
                  <span>{item.orderItem.variantName}</span>
                  <code>{item.requestNumber}</code>
                  <p>{item.issueDescription}</p>
                  <small>
                    {typeLabel(item.type)} · {dateTime(item.requestedAt)}
                  </small>
                </Link>
              ))}
            </section>
            <nav className="pagination" aria-label="Phân trang yêu cầu hậu mãi">
              <button
                className="button"
                type="button"
                disabled={loading || page <= 1}
                onClick={() => {
                  setPage((current) => current - 1);
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
                disabled={loading || page >= pagination.totalPages}
                onClick={() => {
                  setPage((current) => current + 1);
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

function typeLabel(type: AfterSalesType): string {
  if (type === 'WARRANTY') return 'Bảo hành';
  if (type === 'RETURN') return 'Trả hàng';
  return 'Đổi hàng';
}

function statusLabel(status: AfterSalesStatus): string {
  if (status === 'REQUESTED') return 'Đã yêu cầu';
  if (status === 'RECEIVED') return 'Đã tiếp nhận';
  if (status === 'INSPECTING') return 'Đang kiểm tra';
  if (status === 'APPROVED') return 'Đã duyệt';
  if (status === 'REJECTED') return 'Bị từ chối';
  if (status === 'RESOLVED') return 'Đã giải quyết';
  return 'Đã hủy';
}

function dateTime(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? value
    : new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(timestamp);
}

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}
