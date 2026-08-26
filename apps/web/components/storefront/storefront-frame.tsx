import Link from 'next/link';
import type { ReactNode } from 'react';
import { StorefrontShell } from '@/components/shells';
import { MobileNavigation } from './mobile-navigation';
import { StorefrontDesktopNavigation } from './storefront-desktop-navigation';
import { StorefrontHeaderActions } from './storefront-header-actions';
import styles from './storefront-frame.module.css';

export function StorefrontFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <StorefrontShell
      primaryNavigation={<StorefrontDesktopNavigation />}
      headerActions={<StorefrontHeaderActions />}
      mobileNavigation={<MobileNavigation />}
      mainClassName={styles.main ?? ''}
      footer={<StorefrontFooter />}
    >
      {children}
    </StorefrontShell>
  );
}

function StorefrontFooter() {
  return (
    <div className={styles.footerInner}>
      <div>
        <Link className={styles.footerBrand} href="/">
          rePhone
        </Link>
        <p>iPhone cũ với thông tin của từng máy được trình bày rõ ràng.</p>
      </div>
      <nav aria-label="Điều hướng cuối trang">
        <Link href="/products?productType=IPHONE">iPhone</Link>
        <Link href="/products?productType=ACCESSORY">Phụ kiện</Link>
        <Link href="/vouchers">Voucher</Link>
        <Link href="/store">Cửa hàng</Link>
      </nav>
    </div>
  );
}
