import {
  ArrowCounterClockwiseIcon,
  ArrowsLeftRightIcon,
  ClockCounterClockwiseIcon,
  CreditCardIcon,
  CubeIcon,
  DeviceMobileIcon,
  FileTextIcon,
  GearIcon,
  HeadsetIcon,
  HeartbeatIcon,
  HouseIcon,
  IdentificationBadgeIcon,
  MapPinIcon,
  PackageIcon,
  PlusIcon,
  ScanIcon,
  ShoppingBagIcon,
  ShieldCheckIcon,
  TagIcon,
  TicketIcon,
  UsersIcon,
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

type NavigationIconName = NonNullable<ShellNavigationItem['icon']>;

const NAVIGATION_ICONS = {
  overview: HouseIcon,
  catalog: TagIcon,
  inventory: CubeIcon,
  orders: ShoppingBagIcon,
  vouchers: TicketIcon,
  devices: DeviceMobileIcon,
  intake: PlusIcon,
  lookup: ScanIcon,
  stock: PackageIcon,
  movements: ArrowsLeftRightIcon,
  locations: MapPinIcon,
  payments: CreditCardIcon,
  refunds: ArrowCounterClockwiseIcon,
  'after-sales': HeadsetIcon,
  warranties: ShieldCheckIcon,
  'warranty-policies': FileTextIcon,
  employees: IdentificationBadgeIcon,
  customers: UsersIcon,
  settings: GearIcon,
  'audit-logs': ClockCounterClockwiseIcon,
  'system-health': HeartbeatIcon,
} satisfies Record<NavigationIconName, typeof HouseIcon>;

function NavigationIcon({ name }: Readonly<{ name: NavigationIconName }>) {
  const Icon = NAVIGATION_ICONS[name];
  return <Icon size={22} weight="regular" />;
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
