'use client';

import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/app/auth-provider';
import { BackofficeShell, type ShellBreadcrumb } from '@/components/shells';
import { Button, InlineAlert, Link, Skeleton } from '@/components/ui';
import { catalogVoucherNavigationForRole } from '../catalog-voucher-navigation';
import {
  canAccessInventoryWorkspace,
  canViewInventoryCost,
  inventoryNavigationForPath,
} from './inventory-navigation';
import styles from './inventory.module.css';

export interface InventoryShellProps {
  readonly adminContent?: ReactNode;
  readonly breadcrumbs?: readonly ShellBreadcrumb[];
  readonly children: ReactNode;
  readonly pageActions?: ReactNode;
}

export function InventoryShell({
  adminContent,
  breadcrumbs = [],
  children,
  pageActions,
}: InventoryShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, logoutPending, status, user } = useAuth();
  const [logoutError, setLogoutError] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const hasAccess = canAccessInventoryWorkspace(user?.role);
  const localNavigation = inventoryNavigationForPath(pathname);

  useEffect(() => {
    navigationRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
  }, [pathname]);

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
      navigationGroups={catalogVoucherNavigationForRole(user?.role, pathname)}
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
        {status === 'loading' ? <InventoryLoadingState /> : null}
        {status === 'anonymous' ? <InventoryLoginState /> : null}
        {status === 'authenticated' && !hasAccess ? <InventoryForbiddenState /> : null}
        {status === 'authenticated' && user !== null && hasAccess ? (
          <>
            <nav
              className={styles.workspaceNavigation}
              aria-label="Các mục quản lý kho"
              ref={navigationRef}
            >
              <ul>
                {localNavigation.map((item) => (
                  <li key={item.href}>
                    <NextLink aria-current={item.isCurrent ? 'page' : undefined} href={item.href}>
                      {item.label}
                    </NextLink>
                  </li>
                ))}
              </ul>
            </nav>
            {pageActions}
            <div className={styles.content}>
              {children}
              {canViewInventoryCost(user.role) ? adminContent : null}
            </div>
          </>
        ) : null}
      </div>
    </BackofficeShell>
  );
}

function InventoryLoadingState() {
  return (
    <section className={styles.accessState} aria-label="Đang kiểm tra quyền truy cập" role="status">
      <Skeleton height="2rem" width="14rem" />
      <Skeleton height="1.25rem" width="min(100%, 28rem)" />
      <span className="rp-visually-hidden">Đang kiểm tra quyền truy cập…</span>
    </section>
  );
}

function InventoryLoginState() {
  return (
    <section className={styles.accessState}>
      <h1>Đăng nhập để quản lý kho</h1>
      <p>Khu vực này dành cho nhân viên rePhone.</p>
      <Link href="/login" standalone>
        Đến trang đăng nhập
      </Link>
    </section>
  );
}

function InventoryForbiddenState() {
  return (
    <section className={styles.accessState}>
      <h1>Không thể mở khu vực này</h1>
      <p>Tài khoản hiện tại không có quyền quản lý kho hàng.</p>
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
