'use client';

import Link from 'next/link';
import { StorefrontIcon, UserIcon } from '@phosphor-icons/react/ssr';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { DEFAULT_MAIN_ID, MainLandmark, NavigationList, SkipLink, Wordmark } from './shell-parts';
import { joinClassNames } from './shell-utils';
import type { BackofficeNavigationGroup, SharedShellProps } from './shell.types';
import { centeredScrollOffset, scrollOffsetForVisibleTarget } from './backoffice-shell-scroll';
import styles from './shells.module.css';

const SIDEBAR_SCROLL_STORAGE_KEY = 'rephone:backoffice-sidebar-scroll-top';

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
  const sidebarRef = useRef<HTMLElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const currentNavigationHref = navigationGroups
    .flatMap((group) => group.items)
    .find((item) => item.isCurrent)?.href;

  useLayoutEffect(() => {
    const sidebar = sidebarRef.current;
    const navigation = navigationRef.current;
    if (sidebar === null || navigation === null) return;

    const centerCurrentNavigation = () => {
      const current = navigation.querySelector<HTMLElement>('[aria-current="page"]');
      if (current === null) return;
      const currentRect = current.getBoundingClientRect();

      if (sidebar.scrollHeight > sidebar.clientHeight) {
        const sidebarRect = sidebar.getBoundingClientRect();
        sidebar.scrollTop = scrollOffsetForVisibleTarget({
          currentOffset: sidebar.scrollTop,
          scrollSize: sidebar.scrollHeight,
          targetEnd: currentRect.bottom - sidebarRect.top,
          targetSize: currentRect.height,
          targetStart: currentRect.top - sidebarRect.top,
          viewportSize: sidebar.clientHeight,
        });
      }

      if (navigation.scrollWidth > navigation.clientWidth) {
        const navigationRect = navigation.getBoundingClientRect();
        navigation.scrollLeft = centeredScrollOffset({
          currentOffset: navigation.scrollLeft,
          scrollSize: navigation.scrollWidth,
          targetSize: currentRect.width,
          targetStart: currentRect.left - navigationRect.left,
          viewportSize: navigation.clientWidth,
        });
      }
    };

    sidebar.scrollTop = readStoredSidebarScrollTop();
    centerCurrentNavigation();
    const rememberSidebarPosition = () => {
      storeSidebarScrollTop(sidebar.scrollTop);
    };
    const resizeObserver = new ResizeObserver(centerCurrentNavigation);
    resizeObserver.observe(navigation);
    resizeObserver.observe(sidebar);
    sidebar.addEventListener('scroll', rememberSidebarPosition, { passive: true });
    return () => {
      rememberSidebarPosition();
      sidebar.removeEventListener('scroll', rememberSidebarPosition);
      resizeObserver.disconnect();
    };
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
          <Link aria-label={contextLabel} className={styles.contextLink} href={contextHref}>
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
        ref={sidebarRef}
        className={joinClassNames(
          styles.backofficeSidebar,
          showNavigationGroupLabels ? styles.backofficeSidebarWithLabels : undefined,
        )}
        aria-label="Điều hướng backoffice"
      >
        <nav aria-label="Các khu vực vận hành" ref={navigationRef}>
          {navigationGroups.map((group, index) => (
            <section
              aria-labelledby={`backoffice-navigation-group-${String(index)}`}
              className={styles.navigationGroup}
              key={group.label}
            >
              <h2
                className={styles.navigationGroupLabel}
                id={`backoffice-navigation-group-${String(index)}`}
              >
                {group.label}
              </h2>
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

function readStoredSidebarScrollTop(): number {
  try {
    const value = Number(window.sessionStorage.getItem(SIDEBAR_SCROLL_STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function storeSidebarScrollTop(scrollTop: number): void {
  try {
    window.sessionStorage.setItem(SIDEBAR_SCROLL_STORAGE_KEY, String(Math.max(0, scrollTop)));
  } catch {
    // Navigation remains usable when session storage is unavailable.
  }
}
