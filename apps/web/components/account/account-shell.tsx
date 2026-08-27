'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useAuth } from '@/app/auth-provider';
import { CustomerShell } from '@/components/shells';
import { MobileNavigation } from '@/components/storefront/mobile-navigation';
import { StorefrontDesktopNavigation } from '@/components/storefront/storefront-desktop-navigation';
import { StorefrontHeaderActions } from '@/components/storefront/storefront-header-actions';
import { Button, InlineAlert, Link } from '@/components/ui';
import styles from './account.module.css';

export function AccountShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, logoutPending, status, user } = useAuth();
  const [logoutError, setLogoutError] = useState(false);
  const customerNavigation = [
    { href: '/account', label: 'Hồ sơ', isCurrent: pathname === '/account' },
    ...(status === 'authenticated' && user?.role === 'CUSTOMER'
      ? [
          {
            href: '/account/addresses',
            label: 'Địa chỉ',
            isCurrent: pathname === '/account/addresses',
          },
        ]
      : []),
    {
      href: '/account/security',
      label: 'Bảo mật',
      isCurrent: pathname === '/account/security',
    },
  ];

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
    <CustomerShell
      customerNavigation={customerNavigation}
      primaryNavigation={<StorefrontDesktopNavigation />}
      headerActions={<StorefrontHeaderActions />}
      mobileNavigation={<MobileNavigation />}
    >
      <div className={styles.accountSurface}>
        {status === 'authenticated' || logoutPending || logoutError ? (
          <div className={styles.sessionControls}>
            {logoutError ? (
              <InlineAlert
                className={styles.sessionError ?? ''}
                tone="warning"
                role="alert"
                title="Chưa xác nhận được đăng xuất"
              >
                Bạn đã được đăng xuất trên thiết bị này, nhưng rePhone chưa xác nhận được. Hãy thử
                lại khi kết nối ổn định.
                <div className={styles.sessionErrorActions}>
                  <AccountLogoutAction pending={logoutPending} onLogout={signOut} retry />
                  <Link href="/login" standalone>
                    Về trang đăng nhập
                  </Link>
                </div>
              </InlineAlert>
            ) : (
              <AccountLogoutAction pending={logoutPending} onLogout={signOut} />
            )}
          </div>
        ) : null}
        {children}
      </div>
    </CustomerShell>
  );
}

export function AccountLogoutAction({
  pending,
  retry = false,
  onLogout,
}: Readonly<{ pending: boolean; retry?: boolean; onLogout: () => Promise<void> }>) {
  return (
    <Button
      type="button"
      variant="secondary"
      loading={pending}
      loadingLabel="Đang đăng xuất"
      onClick={() => {
        void onLogout();
      }}
    >
      {retry ? 'Thử đăng xuất lại' : 'Đăng xuất'}
    </Button>
  );
}
