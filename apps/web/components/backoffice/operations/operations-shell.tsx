'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useAuth } from '@/app/auth-provider';
import { BackofficeShell, type ShellBreadcrumb } from '@/components/shells';
import { Button, InlineAlert, Link, Skeleton } from '@/components/ui';
import { canAccessOperationsWorkspace, operationsNavigationForRole } from './operations-navigation';
import styles from './operations.module.css';

export interface OperationsShellProps {
  readonly breadcrumbs?: readonly ShellBreadcrumb[];
  readonly children: ReactNode;
  readonly pageActions?: ReactNode;
}

export function OperationsShell({ breadcrumbs = [], children, pageActions }: OperationsShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, logoutPending, status, user } = useAuth();
  const [logoutError, setLogoutError] = useState(false);
  const hasAccess = canAccessOperationsWorkspace(user?.role);
  const navigationGroups = operationsNavigationForRole(user?.role, pathname);

  async function signOut() {
    setLogoutError(false);
    try {
      await logout();
      router.replace('/login');
      router.refresh();
    } catch {
      setLogoutError(true);
    }
  }

  return (
    <BackofficeShell
      actorSummary={
        status === 'authenticated' && user !== null ? (
          <span className={styles.actor}>
            <strong>{user.fullName}</strong>
            <span>{roleLabel(user.role)}</span>
          </span>
        ) : undefined
      }
      breadcrumbs={breadcrumbs}
      navigationGroups={navigationGroups}
      showNavigationGroupLabels={hasAccess}
      topbarActions={
        status === 'authenticated' ? (
          <Button
            loading={logoutPending}
            loadingLabel="Đang đăng xuất"
            size="compact"
            variant="secondary"
            onClick={() => {
              void signOut();
            }}
          >
            Đăng xuất
          </Button>
        ) : undefined
      }
    >
      <div className={styles.surface}>
        {logoutError ? (
          <InlineAlert role="alert" title="Chưa xác nhận được đăng xuất" tone="warning">
            Hãy thử lại khi kết nối ổn định.
          </InlineAlert>
        ) : null}
        {status === 'loading' ? <OperationsLoadingState /> : null}
        {status === 'anonymous' ? <OperationsLoginState /> : null}
        {status === 'authenticated' && !hasAccess ? <OperationsForbiddenState /> : null}
        {status === 'authenticated' && hasAccess ? (
          <>
            {pageActions}
            {children}
          </>
        ) : null}
      </div>
    </BackofficeShell>
  );
}

function OperationsLoadingState() {
  return (
    <section className={styles.accessState} aria-label="Đang kiểm tra quyền truy cập" role="status">
      <Skeleton height="2rem" width="14rem" />
      <Skeleton height="1.25rem" width="min(100%, 28rem)" />
      <span className="rp-visually-hidden">Đang kiểm tra quyền truy cập…</span>
    </section>
  );
}

function OperationsLoginState() {
  return (
    <section className={styles.accessState}>
      <h1>Đăng nhập để mở khu vực vận hành</h1>
      <p>Khu vực này dành cho nhân viên rePhone.</p>
      <Link href="/login" standalone>
        Đến trang đăng nhập
      </Link>
    </section>
  );
}

function OperationsForbiddenState() {
  return (
    <section className={styles.accessState}>
      <h1>Không thể mở khu vực này</h1>
      <p>Tài khoản hiện tại không có quyền xử lý nghiệp vụ vận hành.</p>
      <Link href="/" standalone>
        Về cửa hàng
      </Link>
    </section>
  );
}

function roleLabel(role: 'CUSTOMER' | 'EMPLOYEE' | 'ADMIN'): string {
  if (role === 'ADMIN') return 'Quản trị viên';
  if (role === 'EMPLOYEE') return 'Nhân viên';
  return 'Khách hàng';
}
