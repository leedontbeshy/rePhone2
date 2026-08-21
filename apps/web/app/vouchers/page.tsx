'use client';

import type { components } from '@rephone/api-client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth-provider';
import { CatalogHeader, formatMoney } from '../catalog-ui';

type PublicVoucher = components['schemas']['PublicVoucherDto'];

export default function VouchersPage() {
  const { client, status, user } = useAuth();
  const [vouchers, setVouchers] = useState<PublicVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (status === 'loading') return;
    setLoading(true);
    const result = await client.GET('/api/v1/vouchers', {
      params: { query: { page: 1, pageSize: 100 } },
    });
    if (result.data === undefined) {
      setError('Không thể tải danh sách voucher.');
      setLoading(false);
      return;
    }
    setVouchers(result.data.data);
    setError(null);
    setLoading(false);
  }, [client, status, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <CatalogHeader />
      <main className="catalog-shell commerce-shell">
        <div className="commerce-heading">
          <p className="eyebrow">Ưu đãi hiện hành</p>
          <h1>Voucher</h1>
          <p>
            Đây là danh sách khám phá. Voucher sẽ được kiểm tra và áp dụng chính xác tại checkout ở
            Slice 06.
          </p>
        </div>
        {status === 'authenticated' && user?.role === 'CUSTOMER' ? (
          <div className="commerce-alert account-voucher-note">
            Bạn đang thấy cả voucher công khai và voucher dành riêng cho tài khoản.
          </div>
        ) : null}
        {loading ? <div className="empty-state">Đang tải voucher…</div> : null}
        {error === null ? null : (
          <div className="commerce-alert error" role="alert">
            <span>{error}</span>
            <button className="button" type="button" onClick={() => void load()}>
              Tải lại
            </button>
          </div>
        )}
        {!loading && vouchers.length === 0 ? (
          <section className="empty-state">
            <h2>Chưa có voucher phù hợp</h2>
            <p>Hãy quay lại sau hoặc đăng nhập để xem ưu đãi tài khoản.</p>
            {status === 'anonymous' ? (
              <Link className="button primary" href="/login">
                Đăng nhập
              </Link>
            ) : null}
          </section>
        ) : null}
        {vouchers.length > 0 ? (
          <section className="voucher-grid" aria-label="Voucher hiện hành">
            {vouchers.map((voucher) => (
              <article className="voucher-card" key={voucher.code}>
                <div className="voucher-card-top">
                  <span>{voucher.visibility === 'PUBLIC' ? 'Công khai' : 'Tài khoản'}</span>
                  <strong>{voucher.code}</strong>
                </div>
                <h2>{voucher.name}</h2>
                <p>{voucher.description ?? 'Ưu đãi dành cho đơn hàng phù hợp.'}</p>
                <div className="voucher-value">{discountLabel(voucher)}</div>
                <dl>
                  <div>
                    <dt>Đơn tối thiểu</dt>
                    <dd>{formatMoney(voucher.minimumOrderAmount)} ₫</dd>
                  </div>
                  <div>
                    <dt>Phạm vi</dt>
                    <dd>{voucher.scopeSummary}</dd>
                  </div>
                  <div>
                    <dt>Hết hạn</dt>
                    <dd>{new Intl.DateTimeFormat('vi-VN').format(new Date(voucher.endsAt))}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </section>
        ) : null}
      </main>
    </>
  );
}

function discountLabel(voucher: PublicVoucher): string {
  if (voucher.discountType === 'FIXED') return `Giảm ${formatMoney(voucher.discountValue)} ₫`;
  const cap = voucher.maxDiscountAmount
    ? ` · tối đa ${formatMoney(voucher.maxDiscountAmount)} ₫`
    : '';
  return `Giảm ${voucher.discountValue}%${cap}`;
}
