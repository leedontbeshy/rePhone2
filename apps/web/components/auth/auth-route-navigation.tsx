'use client';

import { usePathname } from 'next/navigation';
import { AuthSwitchLink } from './auth-switch-link';
import styles from './auth.module.css';

export function AuthRouteNavigation() {
  const pathname = usePathname();
  if (pathname !== '/login' && pathname !== '/register') return null;

  return (
    <nav className={styles.routeNavigation} aria-label="Đăng nhập hoặc tạo tài khoản">
      <AuthSwitchLink
        destination="/login"
        current={pathname === '/login'}
        className={styles.routeLink}
      >
        Đăng nhập
      </AuthSwitchLink>
      <AuthSwitchLink
        destination="/register"
        current={pathname === '/register'}
        className={styles.routeLink}
      >
        Đăng ký
      </AuthSwitchLink>
    </nav>
  );
}
