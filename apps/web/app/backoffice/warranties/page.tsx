'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  listBackofficeWarranties,
  type BackofficeWarrantyListItem,
  type BackofficeWarrantyQuery,
  type Pagination,
} from '../../../lib/warranty-api';
import { useAuth } from '../../auth-provider';
import { CatalogHeader } from '../../catalog-ui';

const PAGE_SIZE = 20;

interface FilterDraft {
  q: string;
  status: NonNullable<BackofficeWarrantyQuery['status']>;
  validity: NonNullable<BackofficeWarrantyQuery['validity']>;
  customerId: string;
}

const DEFAULT_FILTERS: FilterDraft = { q: '', status: '', validity: '', customerId: '' };

export default function BackofficeWarrantiesPage() {
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [draft, setDraft] = useState(DEFAULT_FILTERS);
  const [query, setQuery] = useState<BackofficeWarrantyQuery>(() => queryFrom(DEFAULT_FILTERS, 1));
  const [warranties, setWarranties] = useState<BackofficeWarrantyListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const loadWarranties = useCallback(async () => {
    const result = await listBackofficeWarranties(client, query);
    setWarranties(result.data);
    setPagination(result.pagination);
    setError(null);
  }, [client, query]);

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (status !== 'authenticated' || !isStaff) return;
    let active = true;
    setLoading(true);
    void loadWarranties()
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Không thể tải danh sách bảo hành.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isStaff, loadWarranties, status]);

  const applyFilters = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuery(queryFrom(draft, 1));
  };

  return (
    <>
      <CatalogHeader />
      <main className="backoffice-shell warranty-admin-shell">
        <header className="backoffice-page-heading">
          <div>
            <p className="eyebrow">Backoffice · Warranty</p>
            <h1>Bảo hành đã phát hành</h1>
            <p>Tra cứu snapshot theo đơn, thời hạn hiệu lực và trạng thái void.</p>
          </div>
          <Link className="button" href="/backoffice/warranty-policies">
            Chính sách
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
            Bạn không có quyền tra cứu bảo hành.
          </div>
        ) : null}
        {error === null ? null : (
          <div ref={errorRef} tabIndex={-1} className="commerce-alert error" role="alert">
            <span>{error}</span>
            <button className="button" type="button" onClick={() => void loadWarranties()}>
              Tải lại
            </button>
          </div>
        )}

        {status === 'authenticated' && isStaff ? (
          <>
            <form className="payment-review-filters warranty-filters" onSubmit={applyFilters}>
              <label className="filter-wide">
                Tìm mã bảo hành, đơn, khách hàng
                <input
                  value={draft.q}
                  maxLength={255}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, q: event.target.value }));
                  }}
                />
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
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="VOIDED">VOIDED</option>
                </select>
              </label>
              <label>
                Hiệu lực
                <select
                  value={draft.validity}
                  onChange={(event) => {
                    setDraft((current) => ({
                      ...current,
                      validity: event.target.value as FilterDraft['validity'],
                    }));
                  }}
                >
                  <option value="">Tất cả</option>
                  <option value="VALID">Còn hiệu lực</option>
                  <option value="EXPIRED">Đã hết hạn</option>
                  <option value="NOT_STARTED">Chưa hiệu lực</option>
                </select>
              </label>
              <label>
                Customer UUID
                <input
                  value={draft.customerId}
                  placeholder="Tùy chọn"
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, customerId: event.target.value }));
                  }}
                />
              </label>
              <button className="button primary" type="submit" disabled={loading}>
                Lọc
              </button>
              <button
                className="button"
                type="button"
                disabled={loading}
                onClick={() => {
                  setDraft(DEFAULT_FILTERS);
                  setQuery(queryFrom(DEFAULT_FILTERS, 1));
                }}
              >
                Đặt lại
              </button>
            </form>

            <div className="warranty-list-summary" aria-live="polite">
              {loading ? 'Đang tải…' : `${String(pagination.totalItems)} bảo hành`}
            </div>
            {!loading && warranties.length === 0 ? (
              <section className="empty-state">
                <h2>Không có bảo hành phù hợp</h2>
              </section>
            ) : null}
            <section className="warranty-record-list" aria-label="Danh sách bảo hành backoffice">
              {warranties.map((warranty) => (
                <Link
                  className="warranty-record-card"
                  href={`/backoffice/warranties/${warranty.id}`}
                  key={warranty.id}
                >
                  <div>
                    <div className="warranty-card-heading">
                      <code>{warranty.warrantyCode}</code>
                      <span className={`warranty-badge ${badgeTone(warranty)}`}>
                        {validityLabel(warranty)}
                      </span>
                    </div>
                    <strong>
                      {warranty.productName} · {warranty.variantName}
                    </strong>
                    <span>
                      {warranty.orderNumber} · {warranty.customer.name}
                    </span>
                    <small>
                      {warranty.customer.email} · {warranty.customer.phone}
                    </small>
                  </div>
                  <dl className="warranty-record-meta">
                    <Spec label="Thiết bị" value={warranty.inventoryCode ?? 'Theo đơn'} />
                    <Spec label="Bắt đầu" value={dateTime(warranty.startAt)} />
                    <Spec label="Kết thúc" value={dateTime(warranty.endAt)} />
                  </dl>
                </Link>
              ))}
            </section>
            <nav className="pagination" aria-label="Phân trang bảo hành backoffice">
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

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function queryFrom(draft: FilterDraft, page: number): BackofficeWarrantyQuery {
  return {
    page,
    pageSize: PAGE_SIZE,
    ...(draft.q.trim() === '' ? {} : { q: draft.q.trim() }),
    status: draft.status,
    validity: draft.validity,
    ...(draft.customerId.trim() === '' ? {} : { customerId: draft.customerId.trim() }),
  };
}

function badgeTone(warranty: BackofficeWarrantyListItem): string {
  return warranty.isValid ? 'valid' : warranty.status === 'VOIDED' ? 'voided' : 'expired';
}

function validityLabel(warranty: BackofficeWarrantyListItem): string {
  if (warranty.status === 'VOIDED') return 'VOIDED';
  if (warranty.isValid) return 'Còn hiệu lực';
  if (warranty.isExpired) return 'Đã hết hạn';
  return 'Chưa hiệu lực';
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
