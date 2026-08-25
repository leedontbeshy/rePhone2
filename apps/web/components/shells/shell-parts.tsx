import Link from 'next/link';
import type { ReactNode } from 'react';
import { joinClassNames, navigationAccessibleLabel } from './shell-utils';
import type { ShellBrand, ShellNavigationItem } from './shell.types';
import styles from './shells.module.css';

export const DEFAULT_MAIN_ID = 'main-content';

export function SkipLink({ targetId }: Readonly<{ targetId: string }>) {
  return (
    <a className={styles.skipLink} href={`#${targetId}`}>
      Bỏ qua đến nội dung chính
    </a>
  );
}

export function Wordmark({ brand }: Readonly<{ brand?: ShellBrand | undefined }>) {
  const label = brand?.label ?? 'rePhone';

  return (
    <Link className={styles.wordmark} href={brand?.href ?? '/'} aria-label={`${label} — Trang chủ`}>
      {label}
    </Link>
  );
}

export function NavigationList({
  items,
  className,
}: Readonly<{
  items: readonly ShellNavigationItem[];
  className?: string | undefined;
}>) {
  return (
    <ul className={joinClassNames(styles.navigationList, className)}>
      {items.map((item) => (
        <li key={`${item.href}:${item.label}`}>
          <Link
            className={styles.navigationLink}
            href={item.href}
            aria-current={item.isCurrent ? 'page' : undefined}
            aria-label={navigationAccessibleLabel(item)}
          >
            <span>{item.label}</span>
            {item.badgeCount === undefined ? null : (
              <span className={styles.navigationBadge} aria-hidden="true">
                {item.badgeCount}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function MainLandmark({
  id,
  className,
  children,
}: Readonly<{ id: string; className?: string; children: ReactNode }>) {
  return (
    <main id={id} className={className} tabIndex={-1}>
      {children}
    </main>
  );
}
