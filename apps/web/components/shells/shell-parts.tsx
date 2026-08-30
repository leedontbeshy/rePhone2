import {
  ArrowCounterClockwiseIcon,
  ArrowsLeftRightIcon,
  CreditCardIcon,
  CubeIcon,
  DeviceMobileIcon,
  FileTextIcon,
  HeadsetIcon,
  HouseIcon,
  MapPinIcon,
  PackageIcon,
  PlusIcon,
  ScanIcon,
  ShoppingBagIcon,
  ShieldCheckIcon,
  TagIcon,
  TicketIcon,
} from '@phosphor-icons/react/ssr';
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
      {items.map((item) => {
        const content = (
          <>
            {item.icon === undefined ? null : (
              <span className={styles.navigationIcon} aria-hidden="true">
                <NavigationIcon name={item.icon} />
              </span>
            )}
            <span className={styles.navigationLabel}>{item.label}</span>
            {item.badgeCount === undefined ? null : (
              <span className={styles.navigationBadge} aria-hidden="true">
                {item.badgeCount}
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

function NavigationIcon({ name }: Readonly<{ name: NonNullable<ShellNavigationItem['icon']> }>) {
  const iconProps = { size: 22, weight: 'regular' as const };

  if (name === 'overview') return <HouseIcon {...iconProps} />;
  if (name === 'catalog') return <TagIcon {...iconProps} />;
  if (name === 'inventory') return <CubeIcon {...iconProps} />;
  if (name === 'orders') return <ShoppingBagIcon {...iconProps} />;
  if (name === 'vouchers') return <TicketIcon {...iconProps} />;
  if (name === 'devices') return <DeviceMobileIcon {...iconProps} />;
  if (name === 'intake') return <PlusIcon {...iconProps} />;
  if (name === 'lookup') return <ScanIcon {...iconProps} />;
  if (name === 'stock') return <PackageIcon {...iconProps} />;
  if (name === 'movements') return <ArrowsLeftRightIcon {...iconProps} />;
  if (name === 'payments') return <CreditCardIcon {...iconProps} />;
  if (name === 'refunds') return <ArrowCounterClockwiseIcon {...iconProps} />;
  if (name === 'after-sales') return <HeadsetIcon {...iconProps} />;
  if (name === 'warranties') return <ShieldCheckIcon {...iconProps} />;
  if (name === 'warranty-policies') return <FileTextIcon {...iconProps} />;
  return <MapPinIcon {...iconProps} />;
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
