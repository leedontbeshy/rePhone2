'use client';

import { HeadsetIcon, PackageIcon, ShieldCheckIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './post-purchase-navigation.module.css';

const ITEMS = [
  { href: '/orders', label: 'Đơn hàng', icon: PackageIcon },
  { href: '/warranties', label: 'Bảo hành', icon: ShieldCheckIcon },
  { href: '/after-sales', label: 'Hỗ trợ sau mua', icon: HeadsetIcon },
] as const;

export function PostPurchaseNavigation() {
  const pathname = usePathname();

  return (
    <nav className={styles.navigation} aria-label="Đơn hàng, bảo hành và hỗ trợ">
      <ul className={styles.list}>
        {ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                className={styles.link}
                href={item.href}
                aria-current={active ? 'page' : undefined}
              >
                <Icon aria-hidden="true" size={22} weight={active ? 'bold' : 'regular'} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
