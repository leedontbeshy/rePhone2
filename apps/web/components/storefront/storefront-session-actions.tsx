'use client';

import {
  CaretDownIcon,
  HeartIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  ShoppingCartSimpleIcon,
  UserCircleIcon,
  UserGearIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { useCommerce } from '@/app/commerce-provider';
import { CUSTOMER_ACCOUNT_MENU, isStorefrontNavigationCurrent } from './storefront-navigation';
import styles from './storefront-header-actions.module.css';

export function StorefrontSessionActions() {
  const { status, user } = useAuth();
  const { totalQuantity } = useCommerce();
  const storefrontActor = status !== 'authenticated' || user?.role === 'CUSTOMER';

  return (
    <>
      {status === 'loading' ? (
        <span className={styles.sessionLoading} aria-label="Đang tải tài khoản" />
      ) : user?.role === 'CUSTOMER' ? (
        <CustomerAccountMenu />
      ) : (
        <Link
          className={styles.sessionAction}
          href={status === 'anonymous' ? '/login' : '/backoffice'}
        >
          <UserCircleIcon aria-hidden="true" size={22} weight="regular" />
          <span>{status === 'anonymous' ? 'Tài khoản' : 'Quản trị'}</span>
        </Link>
      )}

      {storefrontActor ? (
        <Link
          className={styles.cartAction}
          href="/cart"
          aria-label={`Giỏ hàng, ${String(totalQuantity)} sản phẩm`}
        >
          <ShoppingCartSimpleIcon aria-hidden="true" size={22} weight="regular" />
          <span className={styles.desktopCartLabel}>Giỏ hàng</span>
          <span className={styles.mobileCartLabel}>Giỏ</span>
          <span className={styles.cartBadge} aria-hidden="true">
            {totalQuantity}
          </span>
        </Link>
      ) : null}
    </>
  );
}

function CustomerAccountMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const menuRootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRootRef} className={styles.accountMenu}>
      <button
        ref={triggerRef}
        className={styles.sessionAction}
        type="button"
        aria-controls={menuId}
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return;
          event.preventDefault();
          setOpen(true);
          requestAnimationFrame(() => {
            firstLinkRef.current?.focus();
          });
        }}
      >
        <UserCircleIcon aria-hidden="true" size={22} weight="regular" />
        <span>Tài khoản</span>
        <CaretDownIcon
          className={styles.accountMenuCaret}
          aria-hidden="true"
          size={14}
          weight="bold"
        />
      </button>

      {open ? (
        <nav id={menuId} className={styles.accountMenuPanel} aria-label="Tùy chọn tài khoản">
          <ul className={styles.accountMenuList}>
            {CUSTOMER_ACCOUNT_MENU.map((item, index) => {
              const isCurrent = isStorefrontNavigationCurrent(item.href, pathname);
              return (
                <li key={item.href}>
                  <Link
                    ref={index === 0 ? firstLinkRef : undefined}
                    className={styles.accountMenuLink}
                    href={item.href}
                    aria-current={isCurrent ? 'page' : undefined}
                    onClick={() => {
                      setOpen(false);
                    }}
                  >
                    <AccountMenuItemIcon href={item.href} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}

function AccountMenuItemIcon({ href }: Readonly<{ href: string }>) {
  const iconProps = { 'aria-hidden': true, size: 20, weight: 'regular' } as const;
  if (href === '/warranties') return <ShieldCheckIcon {...iconProps} />;
  if (href === '/wishlist') return <HeartIcon {...iconProps} />;
  if (href === '/orders') return <ReceiptIcon {...iconProps} />;
  return <UserGearIcon {...iconProps} />;
}
