import type { ReactNode } from 'react';
import { DEFAULT_MAIN_ID, MainLandmark, NavigationList, SkipLink, Wordmark } from './shell-parts';
import { joinClassNames } from './shell-utils';
import type { SharedShellProps, ShellNavigationItem } from './shell.types';
import styles from './shells.module.css';

interface CustomerShellProps extends SharedShellProps {
  readonly storefrontNavigation?: readonly ShellNavigationItem[];
  readonly primaryNavigation?: ReactNode;
  readonly customerNavigation: readonly ShellNavigationItem[];
  readonly mobileNavigation?: ReactNode;
  readonly headerActions?: ReactNode;
  readonly mobileSearch?: ReactNode;
  readonly navigationLabel?: string;
}

export function CustomerShell({
  children,
  brand,
  storefrontNavigation = [],
  primaryNavigation,
  customerNavigation,
  mobileNavigation,
  headerActions,
  mobileSearch,
  navigationLabel = 'Tài khoản của bạn',
  mainId = DEFAULT_MAIN_ID,
  mainClassName,
}: Readonly<CustomerShellProps>) {
  return (
    <div className={joinClassNames('rp-surface', styles.customerShell)} data-shell="customer">
      <SkipLink targetId={mainId} />
      <header className={styles.storefrontHeader}>
        <div className={styles.headerPrimaryRow}>
          <div className={styles.headerInner}>
            <Wordmark brand={brand} />
            {headerActions === undefined ? null : (
              <div
                className={styles.headerActions}
                role="group"
                aria-label="Tìm kiếm, tài khoản và giỏ hàng"
              >
                {headerActions}
              </div>
            )}
            {mobileNavigation === undefined ? null : (
              <div className={styles.mobileNavigation}>{mobileNavigation}</div>
            )}
          </div>
        </div>
        {mobileSearch === undefined ? null : (
          <div className={styles.mobileSearch}>{mobileSearch}</div>
        )}
        {storefrontNavigation.length === 0 && primaryNavigation === undefined ? null : (
          <div className={styles.categoryRow}>
            <nav className={styles.primaryNavigation} aria-label="Điều hướng chính">
              {primaryNavigation ?? <NavigationList items={storefrontNavigation} />}
            </nav>
          </div>
        )}
      </header>
      <div className={styles.customerLayout}>
        <aside className={styles.customerSidebar}>
          <p className={styles.customerNavigationLabel}>{navigationLabel}</p>
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
