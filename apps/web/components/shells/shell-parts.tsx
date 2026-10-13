import Link from 'next/link';
import type { ReactNode } from 'react';
import { joinClassNames, navigationAccessibleLabel } from './shell-utils';
import type { ShellBrand, ShellNavigationItem } from './shell.types';
import styles from './shells.module.css';

export const DEFAULT_MAIN_ID = 'main-content';

export function SkipLink({ targetId }: Readonly<{ targetId: string }>) {
  return (
    <a className={styles.skipLink} href={`#${targetId}`} tabIndex={0}>
      Chuyển đến nội dung chính
    </a>
  );
}

export function Wordmark({ brand }: Readonly<{ brand?: ShellBrand | undefined }>) {
  const label = brand?.label ?? 'rePhone';

  return (
    <Link
      className={styles.wordmark}
      href={brand?.href ?? '/'}
      prefetch={false}
      aria-label={`${label} — Trang chủ`}
    >
      {label}
    </Link>
  );
}

export function NavigationList({
  items,
  className,
  renderIcon,
}: Readonly<{
  items: readonly ShellNavigationItem[];
  className?: string | undefined;
  /** The owning surface supplies icons so text navigation does not load them. */
  renderIcon?: (name: NonNullable<ShellNavigationItem['icon']>) => ReactNode;
}>) {
  return (
    <ul className={joinClassNames(styles.navigationList, className)}>
      {items.map((item) => {
        const content = (
          <>
            {item.icon === undefined || renderIcon === undefined ? null : (
              <span className={styles.navigationIcon} aria-hidden="true">
                {renderIcon(item.icon)}
              </span>
            )}
            <span className={styles.navigationLabel}>{item.label}</span>
            {item.badgeCount === undefined ? null : (
              <span
                className={joinClassNames(
                  styles.navigationBadge,
                  item.badgeTone === 'danger' ? styles.navigationBadgeDanger : undefined,
                )}
                aria-hidden="true"
                title={`${String(item.badgeCount)} ${item.badgeLabel ?? 'mục'}`}
              >
                {item.badgeTone === 'danger' && item.badgeCount > 99 ? '99+' : item.badgeCount}
              </span>
            )}
          </>
        );

        return (
          <li
            className={item.isSeparated ? styles.navigationItemSeparated : undefined}
            key={`${item.href}:${item.label}`}
          >
            {item.isDisabled ? (
              <span className={styles.navigationLink} aria-disabled="true">
                {content}
              </span>
            ) : (
              <Link
                className={styles.navigationLink}
                href={item.href}
                prefetch={false}
                aria-current={item.isCurrent ? 'page' : undefined}
                aria-label={navigationAccessibleLabel(item)}
              >
                {content}
              </Link>
            )}
          </li>
        );
      })}
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
