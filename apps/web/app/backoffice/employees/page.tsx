'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  createEmployee,
  disableEmployee,
  enableEmployee,
  getEmployee,
  listEmployees,
  resendInvitation,
  updateEmployee,
  type Employee,
  type EmployeeQuery,
  type Pagination,
} from '../../../lib/system-admin-api';
import { useAuth } from '../../auth-provider';
import { CatalogHeader } from '../../catalog-ui';

const PAGE_SIZE = 20;
const EMPTY_DRAFT = { email: '', fullName: '', phone: '', employeeCode: '', hiredAt: '' };

export default function EmployeesPage() {
  const { client, status, user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [query, setQuery] = useState<EmployeeQuery>({
    page: 1,
    pageSize: PAGE_SIZE,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | NonNullable<EmployeeQuery['status']>>('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
  });
  const [selected, setSelected] = useState<Employee>();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const alertRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const result = await listEmployees(client, query);
    setEmployees(result.data);
    setPagination(result.pagination);
  }, [client, query]);

  useEffect(() => {
    if (status !== 'authenticated' || !isAdmin) return;
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
  }, [isAdmin, load, status]);

  useEffect(() => {
    if (error !== undefined) alertRef.current?.focus();
  }, [error]);

  function showError(caught: unknown) {
    setError(caught instanceof Error ? caught.message : 'Không thể hoàn tất thao tác.');
    setNotice(undefined);
  }

  async function selectEmployee(id: string) {
    setBusy(`detail:${id}`);
    setError(undefined);
    try {
      const employee = await getEmployee(client, id);
      setSelected(employee);
      setDraft({
        email: employee.email,
        fullName: employee.fullName,
        phone: employee.phone ?? '',
        employeeCode: employee.employeeCode,
        hiredAt: employee.hiredAt ?? '',
      });
      setReason('');
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(undefined);
    }
  }

  async function submitEmployee(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy !== undefined) return;
    const fullName = draft.fullName.trim();
    const employeeCode = draft.employeeCode.trim().toUpperCase();
    if (fullName === '' || employeeCode === '') {
      showError(new Error('Họ tên và mã nhân viên là bắt buộc.'));
      return;
    }
    setBusy(selected === undefined ? 'create' : 'update');
    setError(undefined);
    try {
      if (selected === undefined) {
        const created = await createEmployee(client, {
          email: draft.email.trim().toLowerCase(),
          fullName,
          employeeCode,
          ...(draft.phone.trim() === '' ? {} : { phone: draft.phone.trim() }),
          ...(draft.hiredAt === '' ? {} : { hiredAt: draft.hiredAt }),
        });
        setNotice(
          created.deliveryStatus === 'SENT'
            ? 'Đã tạo nhân viên và gửi lời mời.'
            : 'Đã tạo nhân viên; email lỗi, có thể dùng “Gửi lại lời mời”.',
        );
      } else {
        await updateEmployee(client, selected.id, {
          fullName,
          employeeCode,
          phone: draft.phone.trim() === '' ? null : draft.phone.trim(),
          hiredAt: draft.hiredAt === '' ? null : draft.hiredAt,
        });
        setNotice('Đã cập nhật hồ sơ nhân viên.');
      }
      clearSelection();
      await load();
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(undefined);
    }
  }

  async function runAction(action: 'resend' | 'disable' | 'enable') {
    if (selected === undefined || busy !== undefined) return;
    if (action !== 'resend' && (reason.trim().length < 5 || reason.trim().length > 500)) {
      showError(new Error('Lý do cần từ 5 đến 500 ký tự.'));
      return;
    }
    setBusy(action);
    setError(undefined);
    try {
      if (action === 'resend') {
        const delivery = await resendInvitation(client, selected.id);
        setNotice(
          delivery === 'SENT' ? 'Đã gửi lại lời mời.' : 'Đã thay token nhưng gửi email thất bại.',
        );
      } else if (action === 'disable') {
        await disableEmployee(client, selected.id, reason.trim());
        setNotice('Đã vô hiệu nhân viên và thu hồi toàn bộ phiên/token.');
      } else {
        await enableEmployee(client, selected.id, reason.trim());
        setNotice('Đã kích hoạt lại nhân viên.');
      }
      clearSelection();
      await load();
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(undefined);
    }
  }

  function clearSelection() {
    setSelected(undefined);
    setDraft(EMPTY_DRAFT);
    setReason('');
  }

  return (
    <>
      <CatalogHeader />
      <main className="backoffice-shell system-admin-shell">
        <header className="backoffice-page-heading">
          <div>
            <p className="eyebrow">Quản trị hệ thống</p>
            <h1>Nhân viên</h1>
            <p>Tạo tài khoản bằng lời mời; ADMIN không nhập hoặc biết mật khẩu nhân viên.</p>
          </div>
          <Link className="button" href="/backoffice/audit-logs">
            Audit log
          </Link>
        </header>
        <AdminGate status={status} isAdmin={isAdmin} />
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
        {status === 'authenticated' && isAdmin ? (
          <div className="system-admin-grid">
            <section>
              <form
                className="payment-review-filters"
                onSubmit={(event) => {
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
                }}
              >
                <label className="filter-wide">
                  Tìm email, tên, mã hoặc điện thoại
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
                        event.target.value as '' | NonNullable<EmployeeQuery['status']>,
                      );
                    }}
                  >
                    <option value="">Tất cả</option>
                    <option value="PENDING_VERIFICATION">Chờ nhận lời mời</option>
                    <option value="ACTIVE">Đang hoạt động</option>
                    <option value="DISABLED">Đã vô hiệu</option>
                  </select>
                </label>
                <button className="button primary" type="submit" disabled={loading}>
                  Lọc
                </button>
              </form>
              <p className="system-result-count" aria-live="polite">
                {loading ? 'Đang tải…' : `${String(pagination.totalItems)} nhân viên`}
              </p>
              <div className="system-record-list">
                {employees.map((employee) => (
                  <button
                    className="system-record-card"
                    type="button"
                    key={employee.id}
                    disabled={busy !== undefined}
                    onClick={() => void selectEmployee(employee.id)}
                  >
                    <span>
                      <strong>{employee.fullName}</strong>
                      <small>{employee.email}</small>
                    </span>
                    <span>
                      <code>{employee.employeeCode}</code>
                      <small>{employee.status}</small>
                    </span>
                  </button>
                ))}
              </div>
              <PaginationControls
                pagination={pagination}
                loading={loading}
                onPage={(page) => {
                  setQuery((current) => ({ ...current, page }));
                }}
              />
            </section>
            <aside className="system-admin-panel">
              <h2>{selected === undefined ? 'Mời nhân viên' : `Sửa ${selected.employeeCode}`}</h2>
              <form
                className="warranty-command-form"
                onSubmit={(event) => void submitEmployee(event)}
              >
                <label>
                  Email
                  <input
                    type="email"
                    value={draft.email}
                    required
                    disabled={selected !== undefined || busy !== undefined}
                    onChange={(event) => {
                      setDraft((current) => ({ ...current, email: event.target.value }));
                    }}
                  />
                </label>
                <label>
                  Họ tên
                  <input
                    value={draft.fullName}
                    required
                    maxLength={255}
                    disabled={busy !== undefined}
                    onChange={(event) => {
                      setDraft((current) => ({ ...current, fullName: event.target.value }));
                    }}
                  />
                </label>
                <label>
                  Mã nhân viên
                  <input
                    value={draft.employeeCode}
                    required
                    maxLength={64}
                    disabled={busy !== undefined}
                    onChange={(event) => {
                      setDraft((current) => ({
                        ...current,
                        employeeCode: event.target.value.toUpperCase(),
                      }));
                    }}
                  />
                </label>
                <label>
                  Điện thoại
                  <input
                    value={draft.phone}
                    maxLength={32}
                    disabled={busy !== undefined}
                    onChange={(event) => {
                      setDraft((current) => ({ ...current, phone: event.target.value }));
                    }}
                  />
                </label>
                <label>
                  Ngày vào làm
                  <input
                    type="date"
                    value={draft.hiredAt}
                    disabled={busy !== undefined}
                    onChange={(event) => {
                      setDraft((current) => ({ ...current, hiredAt: event.target.value }));
                    }}
                  />
                </label>
                <div className="warranty-row-actions">
                  <button className="button primary" type="submit" disabled={busy !== undefined}>
                    {selected === undefined ? 'Tạo và gửi lời mời' : 'Lưu hồ sơ'}
                  </button>
                  {selected === undefined ? null : (
                    <button
                      className="button"
                      type="button"
                      onClick={clearSelection}
                      disabled={busy !== undefined}
                    >
                      Đóng
                    </button>
                  )}
                </div>
              </form>
              {selected === undefined ? null : (
                <section className="danger-zone warranty-command-form">
                  <h3>Vòng đời tài khoản</h3>
                  <p>
                    Trạng thái hiện tại: <strong>{selected.status}</strong>
                  </p>
                  {selected.status === 'PENDING_VERIFICATION' ? (
                    <button
                      className="button"
                      type="button"
                      disabled={busy !== undefined}
                      onClick={() => void runAction('resend')}
                    >
                      Gửi lại lời mời
                    </button>
                  ) : null}
                  <label>
                    Lý do đổi trạng thái
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
                  {selected.status === 'DISABLED' ? (
                    <button
                      className="button primary"
                      type="button"
                      disabled={busy !== undefined}
                      onClick={() => void runAction('enable')}
                    >
                      Kích hoạt lại
                    </button>
                  ) : (
                    <button
                      className="button danger"
                      type="button"
                      disabled={busy !== undefined}
                      onClick={() => void runAction('disable')}
                    >
                      Vô hiệu và thu hồi phiên
                    </button>
                  )}
                </section>
              )}
            </aside>
          </div>
        ) : null}
      </main>
    </>
  );
}

function AdminGate({ status, isAdmin }: { status: string; isAdmin: boolean }) {
  if (status === 'loading') return <div className="status">Đang kiểm tra phiên…</div>;
  if (status === 'anonymous')
    return <div className="commerce-alert error">Cần đăng nhập ADMIN.</div>;
  return isAdmin ? null : (
    <div className="commerce-alert error">Chỉ ADMIN được quản lý nhân viên.</div>
  );
}

function PaginationControls({
  pagination,
  loading,
  onPage,
}: {
  pagination: Pagination;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <nav className="pagination" aria-label="Phân trang nhân viên">
      <button
        className="button"
        type="button"
        disabled={loading || pagination.page <= 1}
        onClick={() => {
          onPage(pagination.page - 1);
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
          onPage(pagination.page + 1);
        }}
      >
        Trang sau
      </button>
    </nav>
  );
}
