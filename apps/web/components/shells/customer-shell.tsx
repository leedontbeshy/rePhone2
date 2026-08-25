import type { ReactNode } from 'react';
import { DEFAULT_MAIN_ID, MainLandmark, NavigationList, SkipLink, Wordmark } from './shell-parts';
import { joinClassNames } from './shell-utils';
import type { SharedShellProps, ShellNavigationItem } from './shell.types';
import styles from './shells.module.css';

interface CustomerShellProps extends SharedShellProps {
  readonly storefrontNavigation?: readonly ShellNavigationItem[];
  readonly customerNavigation: readonly ShellNavigationItem[];
  readonly mobileNavigation?: ReactNode;
  readonly headerActions?: ReactNode;
  readonly navigationLabel?: string;
}

export function CustomerShell({
  children,
  brand,
  storefrontNavigation = [],
  customerNavigation,
  mobileNavigation,
  headerActions,
  navigationLabel = 'Tài khoản của bạn',
  mainId = DEFAULT_MAIN_ID,
  mainClassName,
}: Readonly<CustomerShellProps>) {
  return (
    <div className={joinClassNames('rp-surface', styles.customerShell)} data-shell="customer">
      <SkipLink targetId={mainId} />
      <header className={styles.storefrontHeader}>
        <div className={styles.headerInner}>
          <Wordmark brand={brand} />
          {storefrontNavigation.length === 0 ? null : (
            <nav className={styles.primaryNavigation} aria-label="Điều hướng chính">
              <NavigationList items={storefrontNavigation} />
            </nav>
          )}
          {headerActions === undefined ? null : (
            <div className={styles.headerActions} role="group" aria-label="Tài khoản và giỏ hàng">
              {headerActions}
            </div>
          )}
          {mobileNavigation === undefined ? null : (
            <div className={styles.mobileNavigation}>{mobileNavigation}</div>
          )}
        </div>
      </header>
      <div className={styles.customerLayout}>
        <aside className={styles.customerSidebar}>
          <nav aria-label={navigationLabel}>
            <NavigationList items={customerNavigation} className={styles.customerNavigationList} />
          </nav>
        </aside>
        <MainLandmark id={mainId} className={joinClassNames(styles.customerMain, mainClassName)}>
          {children}
        </MainLandmark>
      </div>
    </div>
  );
}
