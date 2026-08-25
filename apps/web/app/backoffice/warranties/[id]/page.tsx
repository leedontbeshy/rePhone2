'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  getBackofficeWarranty,
  voidWarranty,
  type BackofficeWarrantyDetail,
} from '../../../../lib/warranty-api';
import { useAuth } from '../../../auth-provider';
import { CatalogHeader } from '../../../catalog-ui';

export default function BackofficeWarrantyDetailPage() {
  const params = useParams<{ id: string }>();
  const warrantyId = params.id;
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const isAdmin = user?.role === 'ADMIN';
  const [detail, setDetail] = useState<BackofficeWarrantyDetail | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const loadWarranty = useCallback(async () => {
    const next = await getBackofficeWarranty(client, warrantyId);
    setDetail(next);
    setError(null);
  }, [client, warrantyId]);

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (status !== 'authenticated' || !isStaff) return;
    let active = true;
    setLoading(true);
    void loadWarranty()
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Không thể mở bảo hành.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isStaff, loadWarranty, status]);

  const submitVoid = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin || detail === null || busy) return;
    const normalized = reason.trim();
    if (normalized.length < 5 || normalized.length > 500) {
      setError('Lý do vô hiệu cần từ 5 đến 500 ký tự.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    void voidWarranty(client, detail.id, normalized)
      .then((next) => {
        setDetail(next);
        setReason('');
        setNotice('Đã vô hiệu bảo hành. Thao tác lặp cùng lý do sẽ không tạo side effect mới.');
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Không thể vô hiệu bảo hành.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <>
      <CatalogHeader />
      <main className="backoffice-shell warranty-admin-shell">
        <div className="breadcrumbs">
          <Link href="/backoffice/warranties">Bảo hành</Link>
          <span>/</span>
          <span>{detail?.warrantyCode ?? warrantyId}</span>
        </div>

        {status === 'loading' || loading ? <div className="status">Đang tải bảo hành…</div> : null}
        {status === 'anonymous' ? (
          <section className="empty-state">
            <h1>Cần đăng nhập nhân viên</h1>
            <Link className="button primary" href="/login">
              Đăng nhập
            </Link>
          </section>
        ) : null}
        {status === 'authenticated' && !isStaff ? (
          <div className="commerce-alert error" role="alert">
            Bạn không có quyền mở bảo hành backoffice.
          </div>
        ) : null}
        {error === null ? null : (
          <div ref={errorRef} tabIndex={-1} className="commerce-alert error" role="alert">
            <span>{error}</span>
            {isStaff ? (
              <button className="button" type="button" onClick={() => void loadWarranty()}>
                Tải lại
              </button>
            ) : null}
          </div>
        )}
        {notice === null ? null : (
          <div className="commerce-alert success" role="status" aria-live="polite">
            {notice}
          </div>
        )}

        {detail === null ? null : (
          <div className="warranty-detail-layout">
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
                  {detail.status === 'VOIDED'
                    ? 'VOIDED'
                    : detail.isValid
                      ? 'Còn hiệu lực'
                      : detail.isExpired
                        ? 'Đã hết hạn'
                        : 'Chưa hiệu lực'}
                </span>
              </header>
              <code className="warranty-code">{detail.warrantyCode}</code>
              <dl className="warranty-detail-specs">
                <Spec label="Khách hàng" value={detail.customer.name} />
                <Spec
                  label="Liên hệ"
                  value={`${detail.customer.email} · ${detail.customer.phone}`}
                />
                <Spec label="Thiết bị" value={detail.inventoryCode ?? 'Theo đơn'} />
                <Spec
                  label="Định danh"
                  value={
                    detail.maskedIdentifierSuffix == null
                      ? '—'
                      : `•••• ${detail.maskedIdentifierSuffix}`
                  }
                />
                <Spec label="SKU" value={detail.sku} />
                <Spec label="Thời hạn" value={`${String(detail.daysSnapshot)} ngày`} />
                <Spec label="Bắt đầu" value={dateTime(detail.startAt)} />
                <Spec label="Kết thúc" value={dateTime(detail.endAt)} />
                <Spec
                  label="Policy snapshot"
                  value={
                    detail.policy === null || detail.policy === undefined
                      ? 'Không gắn policy'
                      : `${detail.policy.code} · ${detail.policy.name}`
                  }
                />
              </dl>
              <section className="warranty-terms">
                <h2>Điều khoản snapshot</h2>
                <p>{detail.termsSnapshot}</p>
              </section>
              {detail.voidReason == null ? null : (
                <section className="warranty-void-history">
                  <h2>Lịch sử vô hiệu</h2>
                  <p>{detail.voidReason}</p>
                  <small>
                    {detail.voidedBy?.fullName ?? 'Hệ thống'} · {dateTime(detail.voidedAt)}
                  </small>
                </section>
              )}
            </article>

            <aside className="warranty-admin-panel">
              <h2>Thao tác</h2>
              {!isAdmin ? <p>EMPLOYEE có quyền xem; chỉ ADMIN được vô hiệu bảo hành.</p> : null}
              {isAdmin && detail.status === 'ACTIVE' ? (
                <form className="warranty-command-form danger-zone" onSubmit={submitVoid}>
                  <p>Void giữ nguyên lịch sử và không thể restore.</p>
                  <label>
                    Lý do vô hiệu
                    <textarea
                      value={reason}
                      minLength={5}
                      maxLength={500}
                      rows={5}
                      disabled={busy}
                      onChange={(event) => {
                        setReason(event.target.value);
                      }}
                    />
                  </label>
                  <button className="button danger" type="submit" disabled={busy}>
                    {busy ? 'Đang xử lý…' : 'Vô hiệu bảo hành'}
                  </button>
                </form>
              ) : null}
              {detail.status === 'VOIDED' ? <p>Bảo hành đã ở trạng thái terminal VOIDED.</p> : null}
            </aside>
          </div>
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

function dateTime(value: string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? value
    : new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(timestamp);
}
