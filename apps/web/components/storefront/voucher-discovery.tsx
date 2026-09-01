'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import type { PublicVoucher, PublicVoucherListResponse } from '@/lib/public-voucher-api';
import { Price, StatusChip } from '@/components/ui';
import styles from './voucher-discovery.module.css';

interface VoucherDiscoveryProps {
  readonly initialResponse: PublicVoucherListResponse | null;
  readonly page: number;
}

interface VoucherResponseState {
  readonly ownerId: string | null;
  readonly page: number;
  readonly response: PublicVoucherListResponse | null;
}

export function VoucherDiscovery({ initialResponse, page }: VoucherDiscoveryProps) {
  const { client, status, user } = useAuth();
  const [responseState, setResponseState] = useState<VoucherResponseState>({
    ownerId: null,
    page,
    response: initialResponse,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialResponse === null);
  const requestGeneration = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const customerId = status === 'authenticated' && user?.role === 'CUSTOMER' ? user.id : null;

  const load = useCallback(async () => {
    if (status === 'loading') return false;
    const generation = ++requestGeneration.current;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    const ownerId = status === 'authenticated' && user?.role === 'CUSTOMER' ? user.id : null;
    setError(false);
    setLoading(true);
    try {
      const result = await client.GET('/api/v1/vouchers', {
        params: { query: { page, pageSize: 12 } },
        signal: controller.signal,
      });
      if (requestGeneration.current !== generation || controller.signal.aborted) return true;
      if (result.data === undefined) {
        setError(true);
        return true;
      }
      setResponseState({ ownerId, page, response: result.data });
      setError(false);
    } catch (caught) {
      if (
        requestGeneration.current === generation &&
        !controller.signal.aborted &&
        !isAbortError(caught)
      ) {
        setError(true);
      }
    } finally {
      if (requestGeneration.current === generation) {
        if (activeController.current === controller) activeController.current = null;
        setLoading(false);
      }
    }
    return true;
  }, [client, page, status, user?.id, user?.role]);

  useEffect(() => {
    requestGeneration.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    setResponseState({ ownerId: null, page, response: initialResponse });
    setError(initialResponse === null);
    setLoading(false);
  }, [initialResponse, page]);

  useEffect(() => {
    requestGeneration.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    setLoading(false);
    if (status === 'anonymous') setError(initialResponse === null);
  }, [initialResponse, status, user?.id]);

  useEffect(() => {
    if (status === 'authenticated') void load();
    if (status === 'anonymous' && initialResponse === null) void load();
  }, [initialResponse, load, status]);

  useEffect(
    () => () => {
      requestGeneration.current += 1;
      activeController.current?.abort();
    },
    [],
  );

  const response = voucherResponseForSession(responseState, {
    customerId,
    initialResponse,
    page,
  });
  const effectiveError = voucherErrorForPage({
    error,
    initialResponse,
    page,
    responsePage: responseState.page,
  });
  const vouchers = response?.data ?? [];
  const pagination = response?.meta.pagination;
  const isCustomer = status === 'authenticated' && user?.role === 'CUSTOMER';
  const accountResponseReady =
    isCustomer && responseState.ownerId === customerId && responseState.page === page;
  const view = voucherDiscoveryView({
    error: effectiveError,
    hasResponse: response !== null,
    loading,
  });
  const reloadHref = page > 1 ? '/vouchers?page=' + String(page) : '/vouchers';

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p>Ưu đãi hiện hành</p>
        <h1>Mã ưu đãi rõ điều kiện, dễ kiểm tra.</h1>
        <span>
          Khám phá các mã đang hoạt động. Khả năng áp dụng cuối cùng phụ thuộc vào giỏ hàng khi bạn
          xác nhận đơn.
        </span>
      </header>

      {isCustomer ? (
        <aside className={styles.accountNote}>
          {voucherAccountNote({ accountResponseReady, error: effectiveError })}
        </aside>
      ) : status === 'anonymous' ? (
        <aside className={styles.accountNote}>
          <span>Đăng nhập để xem thêm ưu đãi dành cho tài khoản.</span>
          <Link href="/login">Đăng nhập</Link>
        </aside>
      ) : null}

      {view === 'loading' ? (
        <section className={styles.state} role="status">
          <h2>Đang tải ưu đãi</h2>
          <p>Danh sách ưu đãi sẽ xuất hiện trong giây lát.</p>
        </section>
      ) : null}

      {view === 'error' ? (
        <section className={styles.state} role="alert">
          <h2>Chưa tải được ưu đãi</h2>
          <p>Bạn có thể thử lại mà không ảnh hưởng đến giỏ hàng.</p>
          <Link
            href={reloadHref}
            onClick={(event) => {
              if (!canRetryVouchersInPlace(status)) return;
              event.preventDefault();
              void load();
            }}
          >
            Tải lại
          </Link>
        </section>
      ) : null}

      {view === 'ready' && vouchers.length === 0 ? (
        <section className={styles.state}>
          <h2>Chưa có ưu đãi phù hợp</h2>
          <p>Hãy quay lại sau hoặc tiếp tục xem các máy đang bán.</p>
          <Link href="/products">Xem danh mục sản phẩm</Link>
        </section>
      ) : null}

      {vouchers.length > 0 ? (
        <section className={styles.grid} aria-label="Ưu đãi hiện hành" aria-busy={loading}>
          {vouchers.map((voucher) => (
            <VoucherCard key={voucher.code} voucher={voucher} />
          ))}
        </section>
      ) : null}

      {pagination !== undefined && pagination.totalPages > 1 ? (
        <nav className={styles.pagination} aria-label="Phân trang ưu đãi">
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

export function canRetryVouchersInPlace(status: 'anonymous' | 'authenticated' | 'loading') {
  return status !== 'loading';
}

export function voucherResponseForSession(
  state: VoucherResponseState,
  current: Readonly<{
    customerId: string | null;
    initialResponse: PublicVoucherListResponse | null;
    page: number;
  }>,
): PublicVoucherListResponse | null {
  if (state.page !== current.page) return current.initialResponse;
  if (state.ownerId !== null && state.ownerId !== current.customerId) {
    return current.initialResponse;
  }
  return state.response;
}

export function voucherErrorForPage({
  error,
  initialResponse,
  page,
  responsePage,
}: Readonly<{
  error: boolean;
  initialResponse: PublicVoucherListResponse | null;
  page: number;
  responsePage: number;
}>): boolean {
  return error || (responsePage !== page && initialResponse === null);
}

export function voucherAccountNote({
  accountResponseReady,
  error,
}: Readonly<{ accountResponseReady: boolean; error: boolean }>): string {
  if (accountResponseReady) {
    return 'Danh sách đã bao gồm ưu đãi dành riêng cho tài khoản nếu có.';
  }
  if (error) {
    return 'Chưa kiểm tra được ưu đãi riêng của tài khoản; các ưu đãi công khai vẫn được giữ lại.';
  }
  return 'Đang kiểm tra thêm ưu đãi dành riêng cho tài khoản.';
}

export function voucherDiscoveryView({
  error,
  hasResponse,
  loading,
}: Readonly<{ error: boolean; hasResponse: boolean; loading: boolean }>):
  'error' | 'loading' | 'ready' {
  if (loading && !hasResponse) return 'loading';
  if (error) return 'error';
  return 'ready';
}

function isAbortError(value: unknown): boolean {
  return value instanceof DOMException && value.name === 'AbortError';
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
