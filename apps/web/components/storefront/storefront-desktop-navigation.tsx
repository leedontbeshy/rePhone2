'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { NavigationList } from '@/components/shells/shell-parts';
import { isStorefrontNavigationCurrent, STOREFRONT_NAVIGATION } from './storefront-navigation';
import styles from './storefront-desktop-navigation.module.css';

export function StorefrontDesktopNavigation() {
  const pathname = usePathname();

  return (
    <Suspense fallback={<DesktopNavigationList pathname={pathname} />}>
      <QueryAwareDesktopNavigation pathname={pathname} />
    </Suspense>
  );
}

function QueryAwareDesktopNavigation({ pathname }: Readonly<{ pathname: string }>) {
  const searchParams = useSearchParams();
  return <DesktopNavigationList pathname={pathname} currentSearch={searchParams.toString()} />;
}

function DesktopNavigationList({
  pathname,
  currentSearch = '',
}: Readonly<{
  pathname: string;
  currentSearch?: string;
}>) {
  const items = STOREFRONT_NAVIGATION.map((item) => ({
    ...item,
    isCurrent: isStorefrontNavigationCurrent(item.href, pathname, currentSearch),
  }));

  return <NavigationList className={styles.navigation} items={items} />;
}
