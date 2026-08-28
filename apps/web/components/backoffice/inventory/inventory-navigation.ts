import type { AuthRole } from '@/app/auth-provider';

export const INVENTORY_UNITS_ROOT = '/backoffice/inventory/units';
export const INVENTORY_INTAKE_ROOT = '/backoffice/inventory/intake';
export const INVENTORY_LOOKUP_ROOT = '/backoffice/inventory/lookup';
export const INVENTORY_INSPECTIONS_ROOT = '/backoffice/inventory/inspections';
export const INVENTORY_LOCATIONS_ROOT = '/backoffice/inventory/locations';
export const INVENTORY_STOCK_ROOT = '/backoffice/inventory/stock';
export const INVENTORY_STOCK_MOVEMENTS_ROOT = '/backoffice/inventory/stock/movements';

export interface InventoryNavigationItem {
  readonly href: string;
  readonly isCurrent: boolean;
  readonly label: string;
}

const INVENTORY_NAVIGATION = [
  { href: INVENTORY_UNITS_ROOT, label: 'Máy vật lý' },
  { href: INVENTORY_INTAKE_ROOT, label: 'Nhập máy' },
  { href: INVENTORY_LOOKUP_ROOT, label: 'Tra cứu mã' },
  { href: INVENTORY_STOCK_ROOT, label: 'Tồn phụ kiện' },
  { href: INVENTORY_STOCK_MOVEMENTS_ROOT, label: 'Lịch sử kho' },
  { href: INVENTORY_LOCATIONS_ROOT, label: 'Địa điểm' },
] as const;

export function inventoryNavigationForPath(pathname: string): readonly InventoryNavigationItem[] {
  return INVENTORY_NAVIGATION.map((item) => ({
    ...item,
    isCurrent: isInventoryNavigationItemCurrent(item.href, pathname),
  }));
}

export function canAccessInventoryWorkspace(role: AuthRole | null | undefined): boolean {
  return role === 'EMPLOYEE' || role === 'ADMIN';
}

export function canViewInventoryCost(role: AuthRole | null | undefined): boolean {
  return role === 'ADMIN';
}

function isInventoryNavigationItemCurrent(href: string, pathname: string): boolean {
  if (href === INVENTORY_UNITS_ROOT) {
    return isPathWithin(pathname, href) || isPathWithin(pathname, INVENTORY_INSPECTIONS_ROOT);
  }
  if (href === INVENTORY_STOCK_ROOT) return pathname === INVENTORY_STOCK_ROOT;
  return isPathWithin(pathname, href);
}

function isPathWithin(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}
