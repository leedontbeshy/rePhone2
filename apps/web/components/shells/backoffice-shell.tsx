'use client';

import Link from 'next/link';
import { StorefrontIcon, UserIcon } from '@phosphor-icons/react/ssr';
import { useEffect, useRef, type ReactNode } from 'react';
import { DEFAULT_MAIN_ID, MainLandmark, NavigationList, SkipLink, Wordmark } from './shell-parts';
import { joinClassNames } from './shell-utils';
import type { BackofficeNavigationGroup, SharedShellProps } from './shell.types';
import styles from './shells.module.css';

export interface ShellBreadcrumb {
  readonly href?: string;
  readonly label: string;
}

interface BackofficeShellProps extends SharedShellProps {
  readonly navigationGroups: readonly BackofficeNavigationGroup[];
  readonly actorSummary?: ReactNode;
  readonly topbarActions?: ReactNode;
  readonly breadcrumbs?: readonly ShellBreadcrumb[];
  readonly contextHref?: string;
  readonly contextLabel?: string;
  readonly showNavigationGroupLabels?: boolean;
}

export function BackofficeShell({
  children,
  brand,
  navigationGroups,
  actorSummary,
  topbarActions,
  breadcrumbs = [],
  contextHref = '/',
  contextLabel = 'Về cửa hàng',
  showNavigationGroupLabels = false,
  mainId = DEFAULT_MAIN_ID,
  mainClassName,
}: Readonly<BackofficeShellProps>) {
  const navigationRef = useRef<HTMLElement>(null);
  const currentNavigationHref = navigationGroups
    .flatMap((group) => group.items)
    .find((item) => item.isCurrent)?.href;

  useEffect(() => {
    const navigation = navigationRef.current;
    const current = navigation?.querySelector<HTMLElement>('[aria-current="page"]');
    if (
      navigation === null ||
      current === null ||
      current === undefined ||
      navigation.scrollWidth <= navigation.clientWidth
    )
      return;
    const navigationRect = navigation.getBoundingClientRect();
    const currentRect = current.getBoundingClientRect();
    const targetLeft =
      navigation.scrollLeft +
      currentRect.left -
      navigationRect.left -
      (navigationRect.width - currentRect.width) / 2;
    navigation.scrollTo({
      behavior: 'auto',
      left: Math.max(0, Math.min(targetLeft, navigation.scrollWidth - navigation.clientWidth)),
    });
  }, [currentNavigationHref]);

  return (
    <div className={joinClassNames('rp-surface', styles.backofficeShell)} data-shell="backoffice">
      <SkipLink targetId={mainId} />
      <div className={styles.backofficeBrandPanel}>
        <div className={styles.backofficeBrand}>
          <Wordmark brand={brand} />
          <span className={styles.backofficeLabel}>Vận hành</span>
        </div>
      </div>
      <header className={styles.backofficeTopbar}>
        <div className={styles.topbarContext}>
          <Link className={styles.contextLink} href={contextHref}>
            <StorefrontIcon aria-hidden="true" size={22} />
            <span>{contextLabel}</span>
          </Link>
          {actorSummary === undefined ? null : (
            <div className={styles.actorSummary}>
              <UserIcon aria-hidden="true" size={24} />
              {actorSummary}
            </div>
          )}
          {topbarActions === undefined ? null : (
            <div className={styles.topbarActions} role="group" aria-label="Thao tác phiên làm việc">
              {topbarActions}
            </div>
          )}
        </div>
      </header>
      <aside
        className={joinClassNames(
          styles.backofficeSidebar,
          showNavigationGroupLabels ? styles.backofficeSidebarWithLabels : undefined,
        )}
        aria-label="Điều hướng backoffice"
      >
        <nav aria-label="Các khu vực vận hành" ref={navigationRef}>
          {navigationGroups.map((group) => (
            <section className={styles.navigationGroup} key={group.label}>
              <h2 className={styles.navigationGroupLabel}>{group.label}</h2>
              <NavigationList items={group.items} className={styles.backofficeNavigationList} />
            </section>
          ))}
        </nav>
      </aside>
      <div className={styles.backofficeContent}>
        {breadcrumbs.length === 0 ? null : (
          <nav className={styles.breadcrumbs} aria-label="Đường dẫn">
            <ol>
              {breadcrumbs.map((breadcrumb, index) => (
                <li key={`${breadcrumb.href ?? 'current'}:${breadcrumb.label}`}>
                  {breadcrumb.href === undefined ? (
                    <span aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}>
                      {breadcrumb.label}
                    </span>
                  ) : (
                    <Link
                      aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}
                      href={breadcrumb.href}
                    >
                      {breadcrumb.label}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <MainLandmark id={mainId} className={joinClassNames(styles.backofficeMain, mainClassName)}>
          {children}
        </MainLandmark>
      </div>
    </div>
  );
}
