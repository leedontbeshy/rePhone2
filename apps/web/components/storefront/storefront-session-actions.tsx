'use client';

import { ShoppingCartSimpleIcon, UserCircleIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useAuth } from '@/app/auth-provider';
import { useCommerce } from '@/app/commerce-provider';
import styles from './storefront-header-actions.module.css';

export function StorefrontSessionActions() {
  const { status, user } = useAuth();
  const { totalQuantity } = useCommerce();
  const storefrontActor = status !== 'authenticated' || user?.role === 'CUSTOMER';
  const sessionAction =
    status === 'anonymous'
      ? { href: '/login', label: 'Tài khoản' }
      : user?.role === 'CUSTOMER'
        ? { href: '/account', label: 'Tài khoản' }
        : { href: '/backoffice/orders', label: 'Quản trị' };

  return (
    <>
      {status === 'loading' ? (
        <span className={styles.sessionLoading} aria-label="Đang tải tài khoản" />
      ) : (
        <Link className={styles.sessionAction} href={sessionAction.href}>
          <UserCircleIcon aria-hidden="true" size={22} weight="regular" />
          <span>{sessionAction.label}</span>
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
