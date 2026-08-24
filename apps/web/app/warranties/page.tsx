'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  listCustomerWarranties,
  type Pagination,
  type WarrantyListItem,
} from '../../lib/warranty-api';
import { useAuth } from '../auth-provider';
import { CatalogHeader } from '../catalog-ui';

const PAGE_SIZE = 12;

export default function CustomerWarrantiesPage() {
  const { client, status, user } = useAuth();
  const isCustomer = user?.role === 'CUSTOMER';
  const [warranties, setWarranties] = useState<WarrantyListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
  });
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
    void listCustomerWarranties(client, { page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (!active) return;
        setWarranties(result.data);
        setPagination(result.pagination);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'Không thể tải bảo hành.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, isCustomer, page, reloadKey, status]);

  return (
    <>
      <CatalogHeader />
      <main className="catalog-shell warranty-shell">
        <header className="warranty-page-heading">
          <div>
            <p className="eyebrow">Tài khoản</p>
            <h1>Bảo hành của tôi</h1>
            <p>Tra cứu thời hạn và điều khoản đã được snapshot khi nhận hàng.</p>
          </div>
          <Link className="button" href="/orders">
            Đơn hàng
          </Link>
        </header>

        {status === 'loading' ? <div className="status">Đang kiểm tra phiên đăng nhập…</div> : null}
        {status === 'anonymous' ? (
          <section className="empty-state">
            <h2>Cần đăng nhập khách hàng</h2>
            <p>Đăng nhập để xem các bảo hành đã phát hành cho đơn của bạn.</p>
            <Link className="button primary" href="/login">
              Đăng nhập
            </Link>
          </section>
        ) : null}
        {status === 'authenticated' && !isCustomer ? (
          <div className="commerce-alert error" role="alert">
            Tài khoản nhân viên không có danh sách bảo hành khách hàng.
          </div>
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
              Thử lại
            </button>
          </div>
        )}

        {status === 'authenticated' && isCustomer ? (
          <>
            <div className="warranty-list-summary" aria-live="polite">
              {loading ? 'Đang tải…' : `${String(pagination.totalItems)} bảo hành`}
            </div>
            {!loading && error === null && warranties.length === 0 ? (
              <section className="empty-state">
                <h2>Chưa có bảo hành</h2>
                <p>Bảo hành sẽ xuất hiện sau khi đơn đủ điều kiện được hoàn tất.</p>
              </section>
            ) : null}
            <section className="warranty-card-grid" aria-label="Danh sách bảo hành">
              {warranties.map((warranty) => (
                <Link
                  className="warranty-card"
                  href={`/warranties/${encodeURIComponent(warranty.warrantyCode)}`}
                  key={warranty.warrantyCode}
                >
                  <div className="warranty-card-heading">
                    <strong>{warranty.productName}</strong>
                    <WarrantyBadge warranty={warranty} />
                  </div>
                  <span>{warranty.variantName}</span>
                  <code>{warranty.warrantyCode}</code>
                  <dl className="warranty-specs">
                    <Spec label="Thiết bị" value={warranty.inventoryCode ?? 'Theo đơn hàng'} />
                    <Spec label="Hiệu lực từ" value={dateTime(warranty.startAt)} />
                    <Spec label="Đến trước" value={dateTime(warranty.endAt)} />
                  </dl>
                </Link>
              ))}
            </section>
            <nav className="pagination" aria-label="Phân trang bảo hành">
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

function WarrantyBadge({ warranty }: { warranty: WarrantyListItem }) {
  const tone = warranty.isValid ? 'valid' : warranty.status === 'VOIDED' ? 'voided' : 'expired';
  const label = warranty.isValid
    ? 'Còn hiệu lực'
    : warranty.status === 'VOIDED'
      ? 'Đã vô hiệu'
      : warranty.isExpired
        ? 'Đã hết hạn'
        : 'Chưa hiệu lực';
  return <span className={`warranty-badge ${tone}`}>{label}</span>;
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
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
