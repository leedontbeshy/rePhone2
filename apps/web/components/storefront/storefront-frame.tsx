import type { ReactNode } from 'react';
import { StorefrontShell } from '@/components/shells/storefront-shell';
import { MobileNavigation } from './mobile-navigation';
import { StorefrontDesktopNavigation } from './storefront-desktop-navigation';
import { StorefrontFooter } from './storefront-footer';
import { StorefrontHeaderActions } from './storefront-header-actions';
import { StorefrontSearch } from './storefront-search';
import styles from './storefront-frame.module.css';

export function StorefrontFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <StorefrontShell
      primaryNavigation={<StorefrontDesktopNavigation />}
      headerActions={<StorefrontHeaderActions />}
      mobileSearch={<StorefrontSearch id="header-mobile-storefront-search" variant="compact" />}
      mobileNavigation={<MobileNavigation />}
      mainClassName={styles.main ?? ''}
      footer={<StorefrontFooter />}
    >
      {children}
    </StorefrontShell>
  );
}
