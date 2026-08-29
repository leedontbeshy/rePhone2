'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { useCommerce } from '@/app/commerce-provider';
import {
  customerNavigationForSession,
  isStorefrontNavigationCurrent,
  STOREFRONT_NAVIGATION,
} from './storefront-navigation';
import styles from './mobile-navigation.module.css';

export function MobileNavigation() {
  const pathname = usePathname();
  const { status, user } = useAuth();
  const { totalQuantity } = useCommerce();
  const customerNavigation = customerNavigationForSession(status, user?.role);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeNavigation = () => {
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = panelRef.current;
    const getFocusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled])',
        ) ?? [],
      );
    getFocusable()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!panel?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        className={styles.trigger}
        type="button"
        aria-controls="storefront-mobile-navigation"
        aria-expanded={open}
        aria-label="Mở danh mục"
        onClick={() => {
          setOpen(true);
        }}
      >
        Danh mục
      </button>
      {open ? (
        <div
          className={styles.overlay}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <div
            ref={panelRef}
            id="storefront-mobile-navigation"
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="storefront-mobile-navigation-title"
          >
            <div className={styles.panelHeader}>
              <strong id="storefront-mobile-navigation-title">Danh mục</strong>
              <button className={styles.closeButton} type="button" onClick={closeNavigation}>
                Đóng
              </button>
            </div>

            <form className={styles.search} action="/products" method="get" role="search">
              <label htmlFor="mobile-storefront-search">Tìm iPhone hoặc phụ kiện</label>
              <div>
                <input
                  id="mobile-storefront-search"
                  name="q"
                  type="search"
                  maxLength={100}
                  placeholder="Nhập tên sản phẩm"
                />
                <button type="submit">Tìm</button>
              </div>
            </form>

            <nav aria-label="Danh mục sản phẩm">
              <Suspense
                fallback={
                  <MobileNavigationLinks pathname={pathname} onNavigate={closeNavigation} />
                }
              >
                <QueryAwareMobileNavigationLinks pathname={pathname} onNavigate={closeNavigation} />
              </Suspense>
            </nav>

            {customerNavigation.length === 0 ? null : (
              <nav className={styles.customerNavigation} aria-label="Lối tắt tài khoản">
                <ul className={styles.navigationList}>
                  {customerNavigation.map((item) => {
                    const isCurrent = isStorefrontNavigationCurrent(item.href, pathname);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={isCurrent ? 'page' : undefined}
                          onClick={closeNavigation}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            )}

            <div className={styles.sessionLinks} role="group" aria-label="Tài khoản và giỏ hàng">
              {status === 'loading' ? (
                <span role="status">Đang tải tài khoản…</span>
              ) : status === 'anonymous' ? (
                <Link href="/login" onClick={closeNavigation}>
                  Đăng nhập
                </Link>
              ) : user?.role === 'CUSTOMER' ? (
                <Link href="/account" onClick={closeNavigation}>
                  Tài khoản của bạn
                </Link>
              ) : (
                <Link href="/backoffice" onClick={closeNavigation}>
                  Mở trang quản trị
                </Link>
              )}
              {status !== 'authenticated' || user?.role === 'CUSTOMER' ? (
                <Link href="/cart" onClick={closeNavigation}>
                  Giỏ hàng · {totalQuantity}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function QueryAwareMobileNavigationLinks({
  pathname,
  onNavigate,
}: Readonly<{ pathname: string; onNavigate: () => void }>) {
  const searchParams = useSearchParams();
  return (
    <MobileNavigationLinks
      pathname={pathname}
      currentSearch={searchParams.toString()}
      onNavigate={onNavigate}
    />
  );
}

function MobileNavigationLinks({
  pathname,
  currentSearch = '',
  onNavigate,
}: Readonly<{ pathname: string; currentSearch?: string; onNavigate: () => void }>) {
  return (
    <ul className={styles.navigationList}>
      {STOREFRONT_NAVIGATION.map((item) => {
        const isCurrent = isStorefrontNavigationCurrent(item.href, pathname, currentSearch);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isCurrent ? 'page' : undefined}
              onClick={onNavigate}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
