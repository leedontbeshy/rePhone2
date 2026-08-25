'use client';

import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  activateCustomer,
  getCustomer,
  listCustomers,
  suspendCustomer,
  type Customer,
  type CustomerQuery,
  type Pagination,
} from '../../../lib/system-admin-api';
import { useAuth } from '../../auth-provider';
import { CatalogHeader } from '../../catalog-ui';

const PAGE_SIZE = 20;

export default function CustomersPage() {
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const isAdmin = user?.role === 'ADMIN';
  const [query, setQuery] = useState<CustomerQuery>({
    page: 1,
    pageSize: PAGE_SIZE,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | NonNullable<CustomerQuery['status']>>('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
  });
  const [selected, setSelected] = useState<Customer>();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const alertRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const result = await listCustomers(client, query);
    setCustomers(result.data);
    setPagination(result.pagination);
  }, [client, query]);

  useEffect(() => {
    if (status !== 'authenticated' || !isStaff) return;
    let active = true;
    setLoading(true);
    void load()
      .catch((caught: unknown) => {
        if (active) showError(caught);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isStaff, load, status]);

  useEffect(() => {
    if (error !== undefined) alertRef.current?.focus();
  }, [error]);

  function showError(caught: unknown) {
    setError(caught instanceof Error ? caught.message : 'Không thể hoàn tất thao tác.');
    setNotice(undefined);
  }

  async function openCustomer(id: string) {
    setBusy(true);
    setError(undefined);
    try {
      setSelected(await getCustomer(client, id));
      setReason('');
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function transition() {
    if (!isAdmin || selected === undefined || busy) return;
    const normalized = reason.trim();
    if (normalized.length < 5 || normalized.length > 500) {
      showError(new Error('Lý do cần từ 5 đến 500 ký tự.'));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const updated =
        selected.status === 'ACTIVE'
          ? await suspendCustomer(client, selected.id, normalized)
          : await activateCustomer(client, selected.id, normalized);
      setSelected(updated);
      setReason('');
      setNotice(
        updated.status === 'SUSPENDED'
          ? 'Đã tạm khóa khách hàng và thu hồi toàn bộ phiên/token.'
          : 'Đã kích hoạt lại khách hàng.',
      );
      await load();
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  }

  function applyFilters(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery((current) => {
      const base = { ...current };
      delete base.q;
      delete base.status;
      return {
        ...base,
        page: 1,
        ...(q.trim() === '' ? {} : { q: q.trim() }),
        ...(statusFilter === '' ? {} : { status: statusFilter }),
      };
    });
  }

  return (
    <>
      <CatalogHeader />
      <main className="backoffice-shell system-admin-shell">
        <header className="backoffice-page-heading">
          <div>
            <p className="eyebrow">Quản trị hệ thống</p>
            <h1>Khách hàng</h1>
            <p>Projection chỉ đọc an toàn; không hiển thị địa chỉ, session, token hoặc evidence.</p>
          </div>
        </header>
        <RoleGate status={status} isStaff={isStaff} />
        {error === undefined ? null : (
          <div ref={alertRef} tabIndex={-1} className="commerce-alert error" role="alert">
            {error}
          </div>
        )}
        {notice === undefined ? null : (
          <div className="commerce-alert success" role="status" aria-live="polite">
            {notice}
          </div>
        )}
        {status === 'authenticated' && isStaff ? (
          <div className="system-admin-grid">
            <section>
              <form className="payment-review-filters" onSubmit={applyFilters}>
                <label className="filter-wide">
                  Tìm email, tên hoặc điện thoại
                  <input
                    value={q}
                    onChange={(event) => {
                      setQ(event.target.value);
                    }}
                  />
                </label>
                <label>
                  Trạng thái
                  <select
                    value={statusFilter}
                    onChange={(event) => {
                      setStatusFilter(
                        event.target.value as '' | NonNullable<CustomerQuery['status']>,
                      );
                    }}
                  >
                    <option value="">Tất cả</option>
                    <option value="ACTIVE">Đang hoạt động</option>
                    <option value="SUSPENDED">Tạm khóa</option>
                  </select>
                </label>
                <label>
                  Sắp xếp
                  <select
                    value={query.sortBy}
                    onChange={(event) => {
                      setQuery((current) => ({
                        ...current,
                        page: 1,
                        sortBy: event.target.value as CustomerQuery['sortBy'],
                      }));
                    }}
                  >
                    <option value="createdAt">Ngày tạo</option>
                    <option value="lastLoginAt">Đăng nhập gần nhất</option>
                  </select>
                </label>
                <button className="button primary" type="submit" disabled={loading}>
                  Lọc
                </button>
              </form>
              <p className="system-result-count" aria-live="polite">
                {loading ? 'Đang tải…' : `${String(pagination.totalItems)} khách hàng`}
              </p>
              <div className="system-record-list">
                {customers.map((customer) => (
                  <button
                    className="system-record-card"
                    type="button"
                    key={customer.id}
                    disabled={busy}
                    onClick={() => void openCustomer(customer.id)}
                  >
                    <span>
                      <strong>{customer.fullName}</strong>
                      <small>{customer.email}</small>
                    </span>
                    <span>
                      <small>{customer.status}</small>
                      <small>{String(customer.orderCount)} đơn</small>
                    </span>
                  </button>
                ))}
              </div>
              <nav className="pagination" aria-label="Phân trang khách hàng">
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
            </section>
            <aside className="system-admin-panel">
              {selected === undefined ? (
                <>
                  <h2>Chi tiết khách hàng</h2>
                  <p>Chọn một khách hàng trong danh sách.</p>
                </>
              ) : (
                <>
                  <h2>{selected.fullName}</h2>
                  <dl className="system-detail-list">
                    <div>
                      <dt>Email</dt>
                      <dd>{selected.email}</dd>
                    </div>
                    <div>
                      <dt>Điện thoại</dt>
                      <dd>{selected.phone ?? 'Chưa cung cấp'}</dd>
                    </div>
                    <div>
                      <dt>Trạng thái</dt>
                      <dd>{selected.status}</dd>
                    </div>
                    <div>
                      <dt>Số đơn</dt>
                      <dd>{String(selected.orderCount)}</dd>
                    </div>
                    <div>
                      <dt>Đơn gần nhất</dt>
                      <dd>{dateTime(selected.lastOrderAt)}</dd>
                    </div>
                    <div>
                      <dt>Đăng nhập gần nhất</dt>
                      <dd>{dateTime(selected.lastLoginAt)}</dd>
                    </div>
                  </dl>
                  {isAdmin ? (
                    <section className="danger-zone warranty-command-form">
                      <label>
                        Lý do {selected.status === 'ACTIVE' ? 'tạm khóa' : 'kích hoạt'}
                        <textarea
                          value={reason}
                          minLength={5}
                          maxLength={500}
                          rows={3}
                          onChange={(event) => {
                            setReason(event.target.value);
                          }}
                        />
                      </label>
                      <button
                        className={
                          selected.status === 'ACTIVE' ? 'button danger' : 'button primary'
                        }
                        type="button"
                        disabled={busy}
                        onClick={() => void transition()}
                      >
                        {selected.status === 'ACTIVE'
                          ? 'Tạm khóa và thu hồi phiên'
                          : 'Kích hoạt lại'}
                      </button>
                    </section>
                  ) : (
                    <p>EMPLOYEE có quyền xem an toàn; chỉ ADMIN được đổi trạng thái.</p>
                  )}
                </>
              )}
            </aside>
          </div>
        ) : null}
      </main>
    </>
  );
}

function RoleGate({ status, isStaff }: { status: string; isStaff: boolean }) {
  if (status === 'loading') return <div className="status">Đang kiểm tra phiên…</div>;
  if (status === 'anonymous')
    return <div className="commerce-alert error">Cần đăng nhập nhân viên.</div>;
  return isStaff ? null : (
    <div className="commerce-alert error">Bạn không có quyền xem khách hàng.</div>
  );
}

function dateTime(value: string | null | undefined): string {
  if (value === null || value === undefined) return 'Chưa có';
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? value
    : new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(timestamp);
}
