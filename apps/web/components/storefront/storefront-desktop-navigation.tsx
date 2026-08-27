'use client';

import { usePathname } from 'next/navigation';
import { NavigationList } from '@/components/shells';
import { STOREFRONT_NAVIGATION } from './storefront-navigation';

export function StorefrontDesktopNavigation() {
  const pathname = usePathname();
  const items = STOREFRONT_NAVIGATION.map((item) => ({
    ...item,
    isCurrent: isCurrentPath(item.href, pathname),
  }));

  return <NavigationList items={items} />;
}

function isCurrentPath(href: string, pathname: string): boolean {
  const queryIndex = href.indexOf('?');
  const targetPath = queryIndex === -1 ? href : href.slice(0, queryIndex);
  if (targetPath === '/') return pathname === '/';
  if (targetPath === '/products') return false;
  return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}
