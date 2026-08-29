'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useAuth } from '@/app/auth-provider';
import { BackofficeShell, type ShellBreadcrumb } from '@/components/shells';
import { Button, InlineAlert, Link, Skeleton } from '@/components/ui';
import { canAccessBackofficeNavigation } from './backoffice-navigation';
import {
  canAccessCatalogVoucherPath,
  catalogVoucherAccessForPath,
  catalogVoucherNavigationForRole,
} from './catalog-voucher-navigation';
import styles from './catalog-voucher.module.css';

export interface CatalogVoucherShellProps {
  readonly breadcrumbs?: readonly ShellBreadcrumb[];
  readonly children: ReactNode;
  readonly pageActions?: ReactNode;
}

export function CatalogVoucherShell({
  breadcrumbs = [],
  children,
  pageActions,
}: CatalogVoucherShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, logoutPending, status, user } = useAuth();
  const [logoutError, setLogoutError] = useState(false);
  const navigationGroups = catalogVoucherNavigationForRole(user?.role, pathname);
  const hasAccess = canAccessCatalogVoucherPath(user?.role, pathname);
  const requiredAccess = catalogVoucherAccessForPath(pathname);

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
      showNavigationGroupLabels={canAccessBackofficeNavigation(user?.role)}
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
          <InlineAlert
            className={styles.sessionNotice ?? ''}
            role="alert"
            title="Chưa xác nhận được đăng xuất"
            tone="warning"
          >
            Hãy thử lại khi kết nối ổn định.
          </InlineAlert>
        ) : null}
        {status === 'loading' ? <CatalogVoucherLoadingState /> : null}
        {status === 'anonymous' ? <CatalogVoucherLoginState /> : null}
        {status === 'authenticated' && !hasAccess ? (
          <CatalogVoucherForbiddenState adminOnly={requiredAccess === 'admin'} />
        ) : null}
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

function CatalogVoucherLoadingState() {
  return (
    <section className={styles.accessState} aria-label="Đang kiểm tra quyền truy cập" role="status">
      <Skeleton height="2rem" width="14rem" />
      <Skeleton height="1.25rem" width="min(100%, 28rem)" />
      <span className="rp-visually-hidden">Đang kiểm tra quyền truy cập…</span>
    </section>
  );
}

function CatalogVoucherLoginState() {
  return (
    <section className={styles.accessState}>
      <h1>Đăng nhập để quản lý danh mục</h1>
      <p>Khu vực này dành cho nhân viên rePhone.</p>
      <Link href="/login" standalone>
        Đến trang đăng nhập
      </Link>
    </section>
  );
}

function CatalogVoucherForbiddenState({ adminOnly }: Readonly<{ adminOnly: boolean }>) {
  return (
    <section className={styles.accessState}>
      <h1>Không thể mở khu vực này</h1>
      <p>
        {adminOnly
          ? 'Chỉ quản trị viên được quản lý mã ưu đãi.'
          : 'Tài khoản hiện tại không có quyền quản lý danh mục.'}
      </p>
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
