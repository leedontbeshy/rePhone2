import type { AuthRole } from '@/app/auth-provider';
import type { BackofficeNavigationGroup } from '@/components/shells';

export const CATALOG_PRODUCTS_ROOT = '/backoffice/catalog/products';
export const BACKOFFICE_ROOT = '/backoffice';
export const INVENTORY_ROOT = '/backoffice/inventory/units';
export const ORDERS_ROOT = '/backoffice/orders';
export const VOUCHERS_ROOT = '/backoffice/vouchers';

export type CatalogVoucherAccess = 'staff' | 'admin';

export function catalogVoucherNavigationForRole(
  role: AuthRole | null | undefined,
  pathname: string,
): readonly BackofficeNavigationGroup[] {
  if (role !== 'EMPLOYEE' && role !== 'ADMIN') return [];

  return [
    {
      label: 'Vận hành',
      items: [
        {
          href: BACKOFFICE_ROOT,
          label: 'Tổng quan',
          icon: 'overview',
          isCurrent: pathname === BACKOFFICE_ROOT,
        },
        {
          href: CATALOG_PRODUCTS_ROOT,
          label: 'Danh mục',
          icon: 'catalog',
          isCurrent: isPathWithin(pathname, CATALOG_PRODUCTS_ROOT),
        },
        {
          href: INVENTORY_ROOT,
          label: 'Kho hàng',
          icon: 'inventory',
          isCurrent: isPathWithin(pathname, '/backoffice/inventory'),
        },
        {
          href: ORDERS_ROOT,
          label: 'Đơn hàng',
          icon: 'orders',
          isCurrent: isPathWithin(pathname, ORDERS_ROOT),
        },
        {
          href: VOUCHERS_ROOT,
          label: 'Mã ưu đãi',
          icon: 'vouchers',
          isCurrent: isPathWithin(pathname, VOUCHERS_ROOT),
          isDisabled: role !== 'ADMIN',
          isSeparated: true,
        },
      ],
    },
  ];
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
