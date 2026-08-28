import type { AuthRole } from '@/app/auth-provider';
import type { BackofficeNavigationGroup } from '@/components/shells';

export const CATALOG_PRODUCTS_ROOT = '/backoffice/catalog/products';
export const VOUCHERS_ROOT = '/backoffice/vouchers';

export type CatalogVoucherAccess = 'staff' | 'admin';

export function catalogVoucherNavigationForRole(
  role: AuthRole | null | undefined,
  pathname: string,
): readonly BackofficeNavigationGroup[] {
  if (role !== 'EMPLOYEE' && role !== 'ADMIN') return [];

  return [
    {
      label: 'Danh mục',
      items: [
        {
          href: CATALOG_PRODUCTS_ROOT,
          label: 'Sản phẩm',
          isCurrent: isPathWithin(pathname, CATALOG_PRODUCTS_ROOT),
        },
        ...(role === 'ADMIN'
          ? [
              {
                href: VOUCHERS_ROOT,
                label: 'Mã ưu đãi',
                isCurrent: isPathWithin(pathname, VOUCHERS_ROOT),
              },
            ]
          : []),
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
