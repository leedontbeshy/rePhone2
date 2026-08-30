'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/app/auth-provider';
import { BackofficeShell, type ShellBreadcrumb } from '@/components/shells';
import { Button, InlineAlert, Link, Skeleton } from '@/components/ui';
import { canAccessBackofficeNavigation } from '../backoffice-navigation';
import {
  canAccessSystemAdminPath,
  systemNavigationOverflowState,
  systemAdminAccessForPath,
  systemAdminNavigationForRole,
} from './system-admin-navigation';
import styles from './system-admin-shell.module.css';

export interface SystemAdminShellProps {
  readonly breadcrumbs?: readonly ShellBreadcrumb[];
  readonly children: ReactNode;
  readonly pageActions?: ReactNode;
}

export function SystemAdminShell({
  breadcrumbs = [],
  children,
  pageActions,
}: SystemAdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, logoutPending, status, user } = useAuth();
  const [logoutError, setLogoutError] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const access = systemAdminAccessForPath(pathname);
  const hasAccess = canAccessSystemAdminPath(user?.role, pathname);
  const navigationGroups = systemAdminNavigationForRole(user?.role, pathname);

  useEffect(() => {
    const shell = surfaceRef.current?.closest<HTMLElement>('[data-shell="backoffice"]');
    const navigation = shell?.querySelector<HTMLElement>(
      'aside[aria-label="Điều hướng backoffice"] nav',
    );
    if (navigation === null || navigation === undefined) return;

    navigation.dataset.systemNavigation = 'true';
    const updateOverflow = () => {
      const overflow = systemNavigationOverflowState(navigation);
      navigation.dataset.canScrollStart = String(overflow.canScrollStart);
      navigation.dataset.canScrollEnd = String(overflow.canScrollEnd);
    };
    const frame = window.requestAnimationFrame(() => {
      if (window.matchMedia('(max-width: 59.99rem)').matches) {
        navigation
          .querySelector<HTMLElement>('[aria-current="page"]')
          ?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
      }
      updateOverflow();
    });
    navigation.addEventListener('scroll', updateOverflow, { passive: true });
    const resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(navigation);
    return () => {
      window.cancelAnimationFrame(frame);
      navigation.removeEventListener('scroll', updateOverflow);
      resizeObserver.disconnect();
      delete navigation.dataset.systemNavigation;
      delete navigation.dataset.canScrollStart;
      delete navigation.dataset.canScrollEnd;
    };
  }, [pathname, user?.role]);

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
      <div className={styles.surface} ref={surfaceRef}>
        {logoutError ? (
          <InlineAlert role="alert" title="Chưa xác nhận được đăng xuất" tone="warning">
            Hãy thử lại khi kết nối ổn định.
          </InlineAlert>
        ) : null}
        {status === 'loading' ? <SystemAdminLoadingState /> : null}
        {status === 'anonymous' ? <SystemAdminLoginState /> : null}
        {status === 'authenticated' && !hasAccess ? (
          <SystemAdminForbiddenState adminOnly={access === 'admin'} />
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

function SystemAdminLoadingState() {
  return (
    <section className={styles.accessState} aria-label="Đang kiểm tra quyền truy cập" role="status">
      <Skeleton height="2rem" width="14rem" />
      <Skeleton height="1.25rem" width="min(100%, 28rem)" />
      <span className="rp-visually-hidden">Đang kiểm tra quyền truy cập…</span>
    </section>
  );
}

function SystemAdminLoginState() {
  return (
    <section className={styles.accessState}>
      <h1>Đăng nhập để quản trị hệ thống</h1>
      <p>Khu vực này dành cho nhân viên rePhone được cấp quyền.</p>
      <Link href="/login" standalone>
        Đến trang đăng nhập
      </Link>
    </section>
  );
}

function SystemAdminForbiddenState({ adminOnly }: Readonly<{ adminOnly: boolean }>) {
  return (
    <section className={styles.accessState}>
      <h1>Không thể mở khu vực này</h1>
      <p>
        {adminOnly
          ? 'Chỉ quản trị viên được mở khu vực này.'
          : 'Tài khoản hiện tại không có quyền mở đường dẫn quản trị này.'}
      </p>
      <Link href="/backoffice" standalone>
        Về tổng quan vận hành
      </Link>
    </section>
  );
}

function roleLabel(role: 'CUSTOMER' | 'EMPLOYEE' | 'ADMIN'): string {
  if (role === 'ADMIN') return 'Quản trị viên';
  if (role === 'EMPLOYEE') return 'Nhân viên';
  return 'Khách hàng';
}
