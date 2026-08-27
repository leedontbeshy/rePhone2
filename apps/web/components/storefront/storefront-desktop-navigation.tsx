'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useAuth } from '@/app/auth-provider';
import { NavigationList, type ShellNavigationItem } from '@/components/shells';
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
    <Suspense
      fallback={<DesktopNavigationList pathname={pathname} customerItems={customerItems} />}
    >
      <QueryAwareDesktopNavigation pathname={pathname} customerItems={customerItems} />
    </Suspense>
  );
}

function QueryAwareDesktopNavigation({
  pathname,
  customerItems,
}: Readonly<{ pathname: string; customerItems: readonly ShellNavigationItem[] }>) {
  const searchParams = useSearchParams();
  return (
    <DesktopNavigationList
      pathname={pathname}
      currentSearch={searchParams.toString()}
      customerItems={customerItems}
    />
  );
}

function DesktopNavigationList({
  pathname,
  currentSearch = '',
  customerItems,
}: Readonly<{
  pathname: string;
  currentSearch?: string;
  customerItems: readonly ShellNavigationItem[];
}>) {
  const items = STOREFRONT_NAVIGATION.map((item) => ({
    ...item,
    isCurrent: isStorefrontNavigationCurrent(item.href, pathname, currentSearch),
  }));

  return <NavigationList className={styles.navigation} items={[...items, ...customerItems]} />;
}
