import type { ReactNode } from 'react';

export interface ShellNavigationItem {
  readonly href: string;
  readonly label: string;
  readonly isCurrent?: boolean;
  readonly badgeCount?: number;
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
