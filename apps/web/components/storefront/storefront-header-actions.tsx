'use client';

import Link from 'next/link';
import { useAuth } from '@/app/auth-provider';
import { useCommerce } from '@/app/commerce-provider';
import styles from './storefront-header-actions.module.css';

export function StorefrontHeaderActions() {
  const { status, user } = useAuth();
  const { totalQuantity } = useCommerce();
  const storefrontActor = status !== 'authenticated' || user?.role === 'CUSTOMER';

  return (
    <div className={styles.actions}>
      <form className={styles.search} action="/products" method="get" role="search">
        <label className={styles.visuallyHidden} htmlFor="desktop-storefront-search">
          Tìm iPhone hoặc phụ kiện
        </label>
        <input
          id="desktop-storefront-search"
          name="q"
          type="search"
          maxLength={100}
          placeholder="Tìm sản phẩm"
        />
        <button type="submit">Tìm</button>
      </form>

      {status === 'loading' ? (
        <span className={styles.sessionLoading} aria-label="Đang tải phiên đăng nhập" />
      ) : status === 'anonymous' ? (
        <Link className={styles.sessionAction} href="/login">
          Đăng nhập
        </Link>
      ) : user?.role === 'CUSTOMER' ? (
        <Link className={styles.sessionAction} href="/orders">
          Đơn hàng
        </Link>
      ) : (
        <Link className={styles.sessionAction} href="/backoffice/orders">
          Backoffice
        </Link>
      )}

      {storefrontActor ? (
        <Link
          className={styles.cartAction}
          href="/cart"
          aria-label={`Giỏ hàng, ${String(totalQuantity)} sản phẩm`}
        >
          <span className={styles.desktopCartLabel}>Giỏ hàng</span>
          <span className={styles.mobileCartLabel}>Giỏ</span>
          <span className={styles.cartBadge} aria-hidden="true">
            {totalQuantity}
          </span>
        </Link>
      ) : null}
    </div>
  );
}
