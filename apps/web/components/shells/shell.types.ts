import type { ReactNode } from 'react';

export interface ShellNavigationItem {
  readonly href: string;
  readonly label: string;
  readonly isCurrent?: boolean;
  readonly badgeCount?: number;
  readonly icon?:
    | 'overview'
    | 'catalog'
    | 'inventory'
    | 'orders'
    | 'vouchers'
    | 'devices'
    | 'intake'
    | 'lookup'
    | 'stock'
    | 'movements'
    | 'locations'
    | 'payments'
    | 'refunds'
    | 'after-sales'
    | 'warranties'
    | 'warranty-policies';
  readonly isDisabled?: boolean;
  readonly isSeparated?: boolean;
}

export interface BackofficeNavigationGroup {
  readonly label: string;
  readonly items: readonly ShellNavigationItem[];
}

export interface ShellBrand {
  readonly href?: string;
  readonly label?: string;
}

export interface SharedShellProps {
  readonly children: ReactNode;
  readonly brand?: ShellBrand;
  readonly mainId?: string;
  readonly mainClassName?: string;
}
