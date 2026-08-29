'use client';

import { LockKeyIcon } from '@phosphor-icons/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '@/app/auth-provider';
import { Button, Link, Skeleton } from '@/components/ui';
import styles from './backoffice-access-gate.module.css';

export interface BackofficeAccessGateProps {
  readonly children: ReactNode;
}

export function BackofficeAccessGate({ children }: BackofficeAccessGateProps) {
  const { retrySessionCheck, sessionCheckFailed, status, user } = useAuth();

  if (status === 'loading') return <BackofficeAccessLoading />;
  if (sessionCheckFailed) {
    return (
      <BackofficeAccessUnavailable
        onRetry={() => {
          void retrySessionCheck();
        }}
      />
    );
  }
  if (status === 'anonymous') return <BackofficeAccessDenied audience="anonymous" />;

  // Fail closed if the authentication state is ever incomplete.
  if (user === null) {
    return (
      <BackofficeAccessUnavailable
        onRetry={() => {
          void retrySessionCheck();
        }}
      />
    );
  }
  if (user.role !== 'EMPLOYEE' && user.role !== 'ADMIN') {
    return <BackofficeAccessDenied audience="customer" />;
  }

  return (
    <>
      <span className="rp-visually-hidden" role="status">
        Đã xác nhận quyền truy cập.
      </span>
      {children}
    </>
  );
}

function AccessScreen({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className={`rp-surface ${styles.screen ?? ''}`}>
      <header className={styles.header}>
        <Link aria-label="rePhone — Trang chủ" className={styles.wordmark} href="/">
          rePhone
        </Link>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}

function BackofficeAccessLoading() {
  return (
    <AccessScreen>
      <section
        aria-label="Đang kiểm tra quyền truy cập"
        aria-live="polite"
        className={styles.card}
        role="status"
      >
        <div className={styles.loadingIcon} aria-hidden="true" />
        <div className={styles.loadingLines} aria-hidden="true">
          <Skeleton height="2rem" width="min(100%, 18rem)" />
          <Skeleton height="1.25rem" width="min(100%, 25rem)" />
          <Skeleton height="1.25rem" width="min(82%, 20rem)" />
        </div>
        <span className="rp-visually-hidden">Đang kiểm tra quyền truy cập…</span>
      </section>
    </AccessScreen>
  );
}

function BackofficeAccessDenied({ audience }: Readonly<{ audience: 'anonymous' | 'customer' }>) {
  const anonymous = audience === 'anonymous';
  const titleRef = useAccessOutcomeFocus();

  return (
    <AccessScreen>
      <section aria-labelledby="backoffice-access-title" className={styles.card}>
        <span aria-hidden="true" className={styles.icon}>
          <LockKeyIcon size={32} weight="bold" />
        </span>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Khu vực vận hành</p>
          <h1 id="backoffice-access-title" ref={titleRef} tabIndex={-1}>
            Không có quyền truy cập
          </h1>
          <p>
            {anonymous
              ? 'Khu vực này chỉ dành cho nhân viên rePhone. Hãy đăng nhập bằng tài khoản được cấp quyền.'
              : 'Tài khoản khách hàng không có quyền truy cập khu vực dành cho nhân viên rePhone.'}
          </p>
        </div>
        <div aria-label="Lựa chọn tiếp theo" className={styles.actions} role="group">
          {anonymous ? (
            <Link className={styles.primaryAction} href="/login">
              Đăng nhập
            </Link>
          ) : (
            <Link className={styles.primaryAction} href="/account">
              Quản lý tài khoản
            </Link>
          )}
          <Link className={styles.secondaryAction} href="/">
            Về cửa hàng
          </Link>
        </div>
      </section>
    </AccessScreen>
  );
}

function BackofficeAccessUnavailable({ onRetry }: Readonly<{ onRetry: () => void }>) {
  const titleRef = useAccessOutcomeFocus();

  return (
    <AccessScreen>
      <section aria-labelledby="backoffice-access-title" className={styles.card}>
        <span aria-hidden="true" className={styles.icon}>
          <LockKeyIcon size={32} weight="bold" />
        </span>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Khu vực vận hành</p>
          <h1 id="backoffice-access-title" ref={titleRef} tabIndex={-1}>
            Chưa thể kiểm tra quyền truy cập
          </h1>
          <p>Nội dung vận hành đang được bảo vệ. Hãy tải lại trang khi kết nối ổn định.</p>
        </div>
        <div aria-label="Lựa chọn tiếp theo" className={styles.actions} role="group">
          <Button onClick={onRetry}>Thử lại</Button>
          <Link className={styles.secondaryAction} href="/">
            Về cửa hàng
          </Link>
        </div>
      </section>
    </AccessScreen>
  );
}

function useAccessOutcomeFocus() {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  return titleRef;
}
