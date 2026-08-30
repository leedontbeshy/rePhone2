import type { AuthRole } from '@/app/auth-provider';
import type { BackofficeNavigationGroup } from '@/components/shells';
import {
  BACKOFFICE_CATALOG_ROOT,
  BACKOFFICE_ORDERS_ROOT,
  BACKOFFICE_ROOT as SHARED_BACKOFFICE_ROOT,
  BACKOFFICE_VOUCHERS_ROOT,
  backofficeNavigationForRole,
} from './backoffice-navigation';

export const CATALOG_PRODUCTS_ROOT = BACKOFFICE_CATALOG_ROOT;
export const BACKOFFICE_ROOT = SHARED_BACKOFFICE_ROOT;
export const INVENTORY_ROOT = '/backoffice/inventory/units';
export const ORDERS_ROOT = BACKOFFICE_ORDERS_ROOT;
export const VOUCHERS_ROOT = BACKOFFICE_VOUCHERS_ROOT;

export type CatalogVoucherAccess = 'staff' | 'admin';

export function catalogVoucherNavigationForRole(
  role: AuthRole | null | undefined,
  pathname: string,
): readonly BackofficeNavigationGroup[] {
  return backofficeNavigationForRole(role, pathname);
}

export function catalogVoucherAccessForPath(pathname: string): CatalogVoucherAccess {
  return isPathWithin(pathname, VOUCHERS_ROOT) ? 'admin' : 'staff';
}

export function canAccessCatalogVoucherPath(
  role: AuthRole | null | undefined,
  pathname: string,
): boolean {
  const access = catalogVoucherAccessForPath(pathname);
  return access === 'admin' ? role === 'ADMIN' : role === 'EMPLOYEE' || role === 'ADMIN';
}

function isPathWithin(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}
