import type { ShellNavigationItem } from './shell.types';

export function joinClassNames(...values: ReadonlyArray<string | undefined>): string {
  return values
    .filter((value): value is string => value !== undefined && value.length > 0)
    .join(' ');
}

export function navigationAccessibleLabel(item: ShellNavigationItem): string | undefined {
  return item.badgeCount === undefined
    ? undefined
    : `${item.label}, ${String(item.badgeCount)} mục`;
}
