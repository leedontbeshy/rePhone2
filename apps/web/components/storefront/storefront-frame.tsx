import { Suspense, type ReactNode } from 'react';
import { StorefrontShell } from '@/components/shells';
import { getStorefrontFooterConfig } from '@/lib/storefront-footer-config';
import { MobileNavigation } from './mobile-navigation';
import { StorefrontDesktopNavigation } from './storefront-desktop-navigation';
import { StorefrontFooter } from './storefront-footer';
import { StorefrontFooterData } from './storefront-footer-data';
import { StorefrontHeaderActions } from './storefront-header-actions';
import styles from './storefront-frame.module.css';

export function StorefrontFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <StorefrontShell
      primaryNavigation={<StorefrontDesktopNavigation />}
      headerActions={<StorefrontHeaderActions />}
      mobileNavigation={<MobileNavigation />}
      mainClassName={styles.main ?? ''}
      footer={
        <Suspense fallback={<StorefrontFooter config={getStorefrontFooterConfig()} store={null} />}>
          <StorefrontFooterData />
        </Suspense>
      }
    >
      {children}
    </StorefrontShell>
  );
}
