'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveGuestOrderToken } from '../../../lib/after-sales-api';
import { getCustomerWarranty, type WarrantyDetail } from '../../../lib/warranty-api';
import { useAuth } from '../../auth-provider';
import { CatalogHeader } from '../../catalog-ui';

export default function CustomerWarrantyDetailPage() {
  const params = useParams<{ warrantyCode: string }>();
  const warrantyCode = params.warrantyCode;
  const { client, status, user } = useAuth();
  const isCustomer = user?.role === 'CUSTOMER';
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [accessReady, setAccessReady] = useState(false);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [detail, setDetail] = useState<WarrantyDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | undefined>(undefined);
  const errorRef = useRef<HTMLDivElement>(null);

  const loadWarranty = useCallback(async () => {
    const next = await getCustomerWarranty(client, warrantyCode, tokenRef.current);
    setDetail(next);
    setError(null);
  }, [client, warrantyCode]);

  useEffect(() => {
    const publicOrderNumber = new URLSearchParams(window.location.search).get('orderNumber');
    tokenRef.current = resolveGuestOrderToken(publicOrderNumber, sessionStorage);
    setOrderNumber(publicOrderNumber);
    setAccessReady(true);
  }, []);

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (!accessReady || status === 'loading' || isStaff) return;
    if (status === 'anonymous' && tokenRef.current === undefined) return;
    let active = true;
    setLoading(true);
    void loadWarranty()
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Không thể mở bảo hành này.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessReady, isStaff, loadWarranty, status]);

  const guestMissingCredential =
    accessReady && status === 'anonymous' && tokenRef.current === undefined;
  const backHref = isCustomer
    ? '/warranties'
    : orderNumber === null
      ? '/'
      : `/orders/${encodeURIComponent(orderNumber)}`;

  return (
    <>
      <CatalogHeader />
      <main className="catalog-shell warranty-shell">
        <div className="breadcrumbs">
          <Link href={backHref}>{isCustomer ? 'Bảo hành' : 'Đơn hàng'}</Link>
          <span>/</span>
          <span>{detail?.warrantyCode ?? warrantyCode}</span>
        </div>

        {status === 'loading' || !accessReady || loading ? (
          <div className="status">Đang tải chi tiết bảo hành…</div>
        ) : null}
        {guestMissingCredential ? (
          <section className="empty-state">
            <h1>Không thể xác minh đơn hàng</h1>
            <p>Hãy mở bảo hành từ chi tiết đơn hàng hoặc đăng nhập để tiếp tục.</p>
            {orderNumber === null ? (
              <Link className="button primary" href="/login">
                Đăng nhập khách hàng
              </Link>
            ) : (
              <Link className="button primary" href={`/orders/${encodeURIComponent(orderNumber)}`}>
                Mở đơn hàng
              </Link>
            )}
          </section>
        ) : null}
        {isStaff ? (
          <div className="commerce-alert error" role="alert">
            Tài khoản nhân viên không thể mở trang bảo hành khách hàng.
          </div>
        ) : null}
        {error === null ? null : (
          <div ref={errorRef} tabIndex={-1} className="commerce-alert error" role="alert">
            <span>{error}</span>
            <button className="button" type="button" onClick={() => void loadWarranty()}>
              Tải lại
            </button>
          </div>
        )}

        {detail === null ? null : (
          <article className="warranty-detail-card">
            <header className="warranty-detail-heading">
              <div>
                <p className="eyebrow">{detail.orderNumber}</p>
                <h1>{detail.productName}</h1>
                <p>{detail.variantName}</p>
              </div>
              <span
                className={`warranty-badge ${detail.isValid ? 'valid' : detail.status === 'VOIDED' ? 'voided' : 'expired'}`}
              >
                {validityLabel(detail)}
              </span>
            </header>
            <code className="warranty-code">{detail.warrantyCode}</code>
            <dl className="warranty-detail-specs">
              <Spec label="Mã sản phẩm" value={detail.sku} />
              <Spec label="Thiết bị" value={detail.inventoryCode ?? 'Theo đơn hàng'} />
              <Spec label="Mã nhận diện" value={maskedSuffix(detail.maskedIdentifierSuffix)} />
              <Spec label="Thời hạn" value={`${String(detail.daysSnapshot)} ngày`} />
              <Spec label="Bắt đầu" value={dateTime(detail.startAt)} />
              <Spec label="Kết thúc" value={dateTime(detail.endAt)} />
            </dl>
            <section className="warranty-terms">
              <h2>Điều khoản đã lưu</h2>
              <p>{detail.termsSnapshot}</p>
            </section>
          </article>
        )}
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

function validityLabel(detail: WarrantyDetail): string {
  if (detail.status === 'VOIDED') return 'Đã vô hiệu';
  if (detail.isValid) return 'Còn hiệu lực';
  if (detail.isExpired) return 'Đã hết hạn';
  return 'Chưa hiệu lực';
}

function maskedSuffix(value: string | null | undefined): string {
  return value === null || value === undefined ? 'Không áp dụng' : `•••• ${value}`;
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
