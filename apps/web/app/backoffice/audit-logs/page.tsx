'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  listAuditLogs,
  type AuditLogListItem,
  type AuditQuery,
  type Pagination,
} from '../../../lib/system-admin-api';
import { useAuth } from '../../auth-provider';
import { CatalogHeader } from '../../catalog-ui';

const PAGE_SIZE = 20;

export default function AuditLogsPage() {
  const { client, status, user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [query, setQuery] = useState<AuditQuery>({
    page: 1,
    pageSize: PAGE_SIZE,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
  const [draft, setDraft] = useState({
    action: '',
    actorType: '',
    resourceType: '',
    requestId: '',
    createdFrom: '',
    createdTo: '',
  });
  const [logs, setLogs] = useState<AuditLogListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status !== 'authenticated' || !isAdmin) return;
    let active = true;
    setLoading(true);
    setError(undefined);
    void listAuditLogs(client, query)
      .then((result) => {
        if (!active) return;
        setLogs(result.data);
        setPagination(result.pagination);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Không thể tải audit log.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, isAdmin, query, status]);

  useEffect(() => {
    if (error !== undefined) alertRef.current?.focus();
  }, [error]);

  function apply(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const from = toIso(draft.createdFrom);
    const to = toIso(draft.createdTo);
    setQuery({
      page: 1,
      pageSize: PAGE_SIZE,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      ...(draft.action.trim() === '' ? {} : { action: draft.action.trim() }),
      ...(draft.actorType === ''
        ? {}
        : { actorType: draft.actorType as NonNullable<AuditQuery['actorType']> }),
      ...(draft.resourceType.trim() === '' ? {} : { resourceType: draft.resourceType.trim() }),
      ...(draft.requestId.trim() === '' ? {} : { requestId: draft.requestId.trim() }),
      ...(from === undefined ? {} : { createdFrom: from }),
      ...(to === undefined ? {} : { createdTo: to }),
    });
  }

  return (
    <>
      <CatalogHeader />
      <main className="backoffice-shell system-admin-shell">
        <header className="backoffice-page-heading">
          <div>
            <p className="eyebrow">Quản trị hệ thống</p>
            <h1>Audit log</h1>
            <p>Lịch sử append-only; dữ liệu nhạy cảm được lọc lại ở cả write và read boundary.</p>
          </div>
        </header>
        <AdminGate status={status} isAdmin={isAdmin} />
        {error === undefined ? null : (
          <div ref={alertRef} tabIndex={-1} className="commerce-alert error" role="alert">
            {error}
          </div>
        )}
        {status === 'authenticated' && isAdmin ? (
          <>
            <form className="payment-review-filters" onSubmit={apply}>
              <label className="filter-wide">
                Action exact hoặc prefix `.*`
                <input
                  value={draft.action}
                  placeholder="employee.*"
                  maxLength={255}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, action: event.target.value }));
                  }}
                />
              </label>
              <label>
                Actor
                <select
                  value={draft.actorType}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, actorType: event.target.value }));
                  }}
                >
                  <option value="">Tất cả</option>
                  <option value="USER">USER</option>
                  <option value="GUEST">GUEST</option>
                  <option value="SYSTEM">SYSTEM</option>
                </select>
              </label>
              <label>
                Resource type
                <input
                  value={draft.resourceType}
                  maxLength={255}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, resourceType: event.target.value }));
                  }}
                />
              </label>
              <label>
                Request ID
                <input
                  value={draft.requestId}
                  maxLength={64}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, requestId: event.target.value }));
                  }}
                />
              </label>
              <label>
                Từ
                <input
                  type="datetime-local"
                  value={draft.createdFrom}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, createdFrom: event.target.value }));
                  }}
                />
              </label>
              <label>
                Đến
                <input
                  type="datetime-local"
                  value={draft.createdTo}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, createdTo: event.target.value }));
                  }}
                />
              </label>
              <button className="button primary" type="submit" disabled={loading}>
                Lọc
              </button>
            </form>
            <p className="system-result-count" aria-live="polite">
              {loading ? 'Đang tải…' : `${String(pagination.totalItems)} bản ghi`}
            </p>
            <section className="audit-log-list" aria-label="Audit logs">
              {logs.map((log) => (
                <Link
                  className="audit-log-row"
                  href={`/backoffice/audit-logs/${log.id}`}
                  key={log.id}
                >
                  <span>
                    <strong>{log.action}</strong>
                    <small>
                      {log.resourceType} · {log.resourceId ?? 'n/a'}
                    </small>
                  </span>
                  <span>
                    <small>{log.actor?.fullName ?? log.actorType}</small>
                    <time>{dateTime(log.createdAt)}</time>
                  </span>
                </Link>
              ))}
            </section>
            {!loading && logs.length === 0 ? (
              <section className="empty-state">
                <h2>Không có bản ghi phù hợp</h2>
              </section>
            ) : null}
            <nav className="pagination" aria-label="Phân trang audit log">
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

function AdminGate({ status, isAdmin }: { status: string; isAdmin: boolean }) {
  if (status === 'loading') return <div className="status">Đang kiểm tra phiên…</div>;
  if (status === 'anonymous')
    return <div className="commerce-alert error">Cần đăng nhập ADMIN.</div>;
  return isAdmin ? null : <div className="commerce-alert error">Chỉ ADMIN được đọc audit log.</div>;
}

function toIso(value: string): string | undefined {
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
