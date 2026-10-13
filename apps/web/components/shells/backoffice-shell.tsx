'use client';

import Link from 'next/link';
import { ListIcon, StorefrontIcon, UserIcon, XIcon } from '@phosphor-icons/react/ssr';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useModalDialogLifecycle } from '@/components/ui/modal-dialog-lifecycle';
import { useBackofficePendingTasks } from '@/components/backoffice/backoffice-pending-tasks';
import { withPendingTaskBadges } from '@/components/backoffice/backoffice-task-badges';
import { DEFAULT_MAIN_ID, MainLandmark, NavigationList, SkipLink, Wordmark } from './shell-parts';
import { joinClassNames } from './shell-utils';
import type { BackofficeNavigationGroup, SharedShellProps } from './shell.types';
import { scrollOffsetForVisibleTarget } from './backoffice-shell-scroll';
import { renderBackofficeNavigationIcon } from './backoffice-navigation-icon';
import styles from './backoffice-shell.module.css';

const SIDEBAR_SCROLL_STORAGE_KEY = 'rephone:backoffice-sidebar-scroll-top';
const MOBILE_NAVIGATION_QUERY = '(max-width: 959.98px)';

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
  const pendingTasks = useBackofficePendingTasks();
  const navigationWithBadges = withPendingTaskBadges(navigationGroups, pendingTasks);
  const sidebarRef = useRef<HTMLElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const navigationId = useId();
  const drawerId = `${navigationId}-drawer`;
  const drawerTitleId = `${navigationId}-title`;
  const isMobile = useSyncExternalStore(
    subscribeToMobileNavigation,
    mobileNavigationSnapshot,
    () => false,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { closeDialog, dialogRef, onDialogClose } = useModalDialogLifecycle(isMobile && drawerOpen);
  const currentNavigationHref = navigationGroups
    .flatMap((group) => group.items)
    .find((item) => item.isCurrent)?.href;

  const closeDrawer = useCallback(() => {
    closeDialog();
    setDrawerOpen(false);
  }, [closeDialog]);

  useEffect(() => {
    if (isMobile && drawerOpen) drawerCloseRef.current?.focus({ preventScroll: true });
  }, [drawerOpen, isMobile]);

  useEffect(() => {
    if (!isMobile) closeDrawer();
  }, [closeDrawer, isMobile]);

  useEffect(() => {
    if (!isMobile || !drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen, isMobile]);

  useLayoutEffect(() => {
    const sidebar = sidebarRef.current;
    const navigation = navigationRef.current;
    if (sidebar === null || navigation === null || (isMobile && !drawerOpen)) return;

    const keepCurrentNavigationVisible = () => {
      const current = navigation.querySelector<HTMLElement>('[aria-current="page"]');
      if (current === null || sidebar.clientHeight === 0) return;
      if (sidebar.scrollHeight <= sidebar.clientHeight) return;
      const currentRect = current.getBoundingClientRect();
      const sidebarRect = sidebar.getBoundingClientRect();
      sidebar.scrollTop = scrollOffsetForVisibleTarget({
        currentOffset: sidebar.scrollTop,
        scrollSize: sidebar.scrollHeight,
        targetEnd: currentRect.bottom - sidebarRect.top,
        targetSize: currentRect.height,
        targetStart: currentRect.top - sidebarRect.top,
        viewportSize: sidebar.clientHeight,
      });
    };

    sidebar.scrollTop = readStoredSidebarScrollTop();
    keepCurrentNavigationVisible();
    const rememberSidebarPosition = () => {
      storeSidebarScrollTop(sidebar.scrollTop);
    };
    const resizeObserver = new ResizeObserver(keepCurrentNavigationVisible);
    resizeObserver.observe(navigation);
    resizeObserver.observe(sidebar);
    sidebar.addEventListener('scroll', rememberSidebarPosition, { passive: true });
    return () => {
      rememberSidebarPosition();
      sidebar.removeEventListener('scroll', rememberSidebarPosition);
      resizeObserver.disconnect();
    };
  }, [currentNavigationHref, drawerOpen, isMobile]);

  function keepDrawerFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  function selectNavigation(event: MouseEvent<HTMLElement>) {
    if (isMobile && event.target instanceof Element && event.target.closest('a[href]') !== null) {
      closeDrawer();
    }
  }

  const sidebar = (
    <aside
      ref={sidebarRef}
      className={joinClassNames(
        styles.backofficeSidebar,
        showNavigationGroupLabels ? styles.sidebarWithLabels : undefined,
      )}
      aria-label="Điều hướng backoffice"
    >
      <nav aria-label="Các khu vực vận hành" ref={navigationRef} onClick={selectNavigation}>
        {navigationWithBadges.map((group, index) => {
          const groupId = `${navigationId}-group-${String(index)}`;
          return (
            <section aria-labelledby={groupId} className={styles.navigationGroup} key={group.label}>
              <h2 className={styles.navigationGroupLabel} id={groupId}>
                {group.label}
              </h2>
              <NavigationList
                items={group.items}
                className={styles.navigationList}
                renderIcon={renderBackofficeNavigationIcon}
              />
            </section>
          );
        })}
      </nav>
    </aside>
  );

  return (
    <div className={joinClassNames('rp-surface', styles.backofficeShell)} data-shell="backoffice">
      <SkipLink targetId={mainId} />
      <div className={styles.backofficeBrandPanel}>
        <button
          aria-controls={drawerId}
          aria-expanded={drawerOpen}
          aria-label="Mở điều hướng vận hành"
          className={styles.menuButton}
          type="button"
          onClick={() => {
            setDrawerOpen(true);
          }}
        >
          <ListIcon aria-hidden="true" size={24} />
        </button>
        <div className={styles.backofficeBrand}>
          <Wordmark brand={brand} />
          <span className={styles.backofficeLabel}>Vận hành</span>
        </div>
      </div>
      <header className={styles.backofficeTopbar}>
        <div className={styles.topbarContext}>
          <Link
            aria-label={contextLabel}
            className={styles.contextLink}
            href={contextHref}
            prefetch={false}
          >
            <StorefrontIcon aria-hidden="true" size={21} />
            <span>{contextLabel}</span>
          </Link>
          {actorSummary === undefined ? null : (
            <div className={styles.actorSummary}>
              <UserIcon aria-hidden="true" size={22} />
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
      {isMobile ? (
        <dialog
          aria-labelledby={drawerTitleId}
          className={styles.drawer}
          id={drawerId}
          ref={dialogRef}
          onKeyDown={keepDrawerFocus}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeDrawer();
          }}
          onClose={() => {
            onDialogClose();
            setDrawerOpen(false);
          }}
        >
          <div className={styles.drawerPanel}>
            <header className={styles.drawerHeader}>
              <div>
                <Wordmark brand={brand} />
                <h2 id={drawerTitleId}>Điều hướng vận hành</h2>
              </div>
              <button
                aria-label="Đóng điều hướng vận hành"
                className={styles.drawerClose}
                ref={drawerCloseRef}
                type="button"
                onClick={closeDrawer}
              >
                <XIcon aria-hidden="true" size={23} />
              </button>
            </header>
            {sidebar}
            {actorSummary === undefined ? null : (
              <div className={styles.drawerActor}>
                <UserIcon aria-hidden="true" size={22} />
                {actorSummary}
              </div>
            )}
          </div>
        </dialog>
      ) : (
        sidebar
      )}
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
                      prefetch={false}
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

function subscribeToMobileNavigation(onChange: () => void): () => void {
  const query = window.matchMedia(MOBILE_NAVIGATION_QUERY);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}

function mobileNavigationSnapshot(): boolean {
  return window.matchMedia(MOBILE_NAVIGATION_QUERY).matches;
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
