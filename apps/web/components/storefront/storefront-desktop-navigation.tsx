'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useAuth } from '@/app/auth-provider';
import { NavigationList } from '@/components/shells';
import {
  customerNavigationForSession,
  isStorefrontNavigationCurrent,
  STOREFRONT_NAVIGATION,
} from './storefront-navigation';
import styles from './storefront-desktop-navigation.module.css';

export function StorefrontDesktopNavigation() {
  const pathname = usePathname();
  const { status, user } = useAuth();
  const customerItems = customerNavigationForSession(status, user?.role).map((item) => ({
    ...item,
    isCurrent: isStorefrontNavigationCurrent(item.href, pathname),
  }));

  return (
    <div className={styles.navigationGroups}>
      <div className={styles.catalogGroup}>
        <Suspense fallback={<DesktopNavigationList pathname={pathname} />}>
          <QueryAwareDesktopNavigation pathname={pathname} />
        </Suspense>
      </div>
      {customerItems.length === 0 ? null : (
        <NavigationList className={styles.customerNavigation} items={customerItems} />
      )}
    </div>
  );
}

function QueryAwareDesktopNavigation({ pathname }: Readonly<{ pathname: string }>) {
  const searchParams = useSearchParams();
  return <DesktopNavigationList pathname={pathname} currentSearch={searchParams.toString()} />;
}

function DesktopNavigationList({
  pathname,
  currentSearch = '',
}: Readonly<{ pathname: string; currentSearch?: string }>) {
  const items = STOREFRONT_NAVIGATION.map((item) => ({
    ...item,
    isCurrent: isStorefrontNavigationCurrent(item.href, pathname, currentSearch),
  }));

  return <NavigationList items={items} />;
}
