import type { ReactNode } from 'react';
import { DEFAULT_MAIN_ID, MainLandmark, NavigationList, SkipLink, Wordmark } from './shell-parts';
import { joinClassNames } from './shell-utils';
import type { SharedShellProps, ShellNavigationItem } from './shell.types';
import styles from './shells.module.css';

interface StorefrontShellProps extends SharedShellProps {
  readonly navigation?: readonly ShellNavigationItem[];
  readonly mobileNavigation?: ReactNode;
  readonly headerActions?: ReactNode;
  readonly footer?: ReactNode;
}

export function StorefrontShell({
  children,
  brand,
  navigation = [],
  mobileNavigation,
  headerActions,
  footer,
  mainId = DEFAULT_MAIN_ID,
  mainClassName,
}: Readonly<StorefrontShellProps>) {
  return (
    <div className={joinClassNames('rp-surface', styles.storefrontShell)} data-shell="storefront">
      <SkipLink targetId={mainId} />
      <header className={styles.storefrontHeader}>
        <div className={styles.headerInner}>
          <Wordmark brand={brand} />
          {navigation.length === 0 ? null : (
            <nav className={styles.primaryNavigation} aria-label="Điều hướng chính">
              <NavigationList items={navigation} />
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
      <MainLandmark id={mainId} className={joinClassNames(styles.storefrontMain, mainClassName)}>
        {children}
      </MainLandmark>
      {footer === undefined ? null : <footer className={styles.storefrontFooter}>{footer}</footer>}
    </div>
  );
}
