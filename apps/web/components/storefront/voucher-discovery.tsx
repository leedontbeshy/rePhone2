'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import type { PublicVoucher, PublicVoucherListResponse } from '@/lib/public-voucher-api';
import { Price, StatusChip } from '@/components/ui';
import styles from './voucher-discovery.module.css';

interface VoucherDiscoveryProps {
  readonly initialResponse: PublicVoucherListResponse | null;
  readonly page: number;
}

export function VoucherDiscovery({ initialResponse, page }: VoucherDiscoveryProps) {
  const { client, status, user } = useAuth();
  const [response, setResponse] = useState(initialResponse);
  const [loading, setLoading] = useState(initialResponse === null);
  const [error, setError] = useState(initialResponse === null);

  const load = useCallback(async () => {
    if (status === 'loading') return;
    setLoading(true);
    const result = await client.GET('/api/v1/vouchers', {
      params: { query: { page, pageSize: 12 } },
    });
    if (result.data === undefined) {
      setError(true);
      setLoading(false);
      return;
    }
    setResponse(result.data);
    setError(false);
    setLoading(false);
  }, [client, page, status, user?.id]);

  useEffect(() => {
    if (status === 'authenticated') void load();
    if (status === 'anonymous' && initialResponse === null) void load();
  }, [initialResponse, load, status]);

  const vouchers = response?.data ?? [];
  const pagination = response?.meta.pagination;
  const isCustomer = status === 'authenticated' && user?.role === 'CUSTOMER';

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p>Ưu đãi hiện hành</p>
        <h1>Voucher rõ điều kiện, kiểm tra lại khi checkout.</h1>
        <span>
          Khám phá mã đang hoạt động. Khả năng áp dụng cuối cùng phụ thuộc giỏ hàng và điều kiện tại
          thời điểm checkout.
        </span>
      </header>

      {isCustomer ? (
        <aside className={styles.accountNote}>
          Bạn đang thấy cả voucher công khai và voucher dành cho tài khoản.
        </aside>
      ) : status === 'anonymous' ? (
        <aside className={styles.accountNote}>
          <span>Đăng nhập để xem thêm ưu đãi dành cho tài khoản.</span>
          <Link href="/login">Đăng nhập</Link>
        </aside>
      ) : null}

      {loading && response === null ? (
        <section className={styles.state} role="status">
          <h2>Đang tải voucher</h2>
          <p>Danh sách ưu đãi sẽ xuất hiện trong giây lát.</p>
        </section>
      ) : null}

      {error ? (
        <section className={styles.state} role="alert">
          <h2>Chưa tải được voucher</h2>
          <p>Bạn có thể thử lại mà không ảnh hưởng đến giỏ hàng.</p>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              void load();
            }}
          >
            {loading ? 'Đang tải lại' : 'Tải lại'}
          </button>
        </section>
      ) : null}

      {!loading && !error && vouchers.length === 0 ? (
        <section className={styles.state}>
          <h2>Chưa có voucher phù hợp</h2>
          <p>Hãy quay lại sau hoặc tiếp tục xem các máy đang bán.</p>
          <Link href="/products">Xem catalog</Link>
        </section>
      ) : null}

      {vouchers.length > 0 ? (
        <section className={styles.grid} aria-label="Voucher hiện hành" aria-busy={loading}>
          {vouchers.map((voucher) => (
            <VoucherCard key={voucher.code} voucher={voucher} />
          ))}
        </section>
      ) : null}

      {pagination !== undefined && pagination.totalPages > 1 ? (
        <nav className={styles.pagination} aria-label="Phân trang voucher">
          {pagination.page > 1 ? (
            <Link href={`/vouchers?page=${String(pagination.page - 1)}`}>Trang trước</Link>
          ) : (
            <span />
          )}
          <span>
            Trang {String(pagination.page)}/{String(pagination.totalPages)}
          </span>
          {pagination.page < pagination.totalPages ? (
            <Link href={`/vouchers?page=${String(pagination.page + 1)}`}>Trang sau</Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

function VoucherCard({ voucher }: Readonly<{ voucher: PublicVoucher }>) {
  return (
    <article className={styles.card}>
      <div className={styles.cardTop}>
        <StatusChip
          label={voucher.visibility === 'PUBLIC' ? 'Công khai' : 'Dành cho tài khoản'}
          tone={voucher.visibility === 'PUBLIC' ? 'neutral' : 'info'}
        />
        <code>{voucher.code}</code>
      </div>
      <div>
        <h2>{voucher.name}</h2>
        {voucher.description === null || voucher.description === undefined ? null : (
          <p>{voucher.description}</p>
        )}
      </div>
      <p className={styles.discount}>{discountLabel(voucher)}</p>
      <dl>
        <div>
          <dt>Đơn tối thiểu</dt>
          <dd>
            <Price amount={voucher.minimumOrderAmount} />
          </dd>
        </div>
        <div>
          <dt>Phạm vi</dt>
          <dd>{voucher.scopeSummary}</dd>
        </div>
        <div>
          <dt>Hiệu lực đến</dt>
          <dd>
            <time dateTime={voucher.endsAt}>{formatDate(voucher.endsAt)}</time>
          </dd>
        </div>
      </dl>
    </article>
  );
}

function discountLabel(voucher: PublicVoucher): string {
  if (voucher.discountType === 'FIXED') {
    return `Giảm ${new Intl.NumberFormat('vi-VN').format(BigInt(voucher.discountValue))} ₫`;
  }
  const cap =
    voucher.maxDiscountAmount === null || voucher.maxDiscountAmount === undefined
      ? ''
      : ` · tối đa ${new Intl.NumberFormat('vi-VN').format(BigInt(voucher.maxDiscountAmount))} ₫`;
  return `Giảm ${voucher.discountValue}%${cap}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}
