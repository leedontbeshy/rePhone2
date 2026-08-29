import type { AuthRole } from '@/app/auth-provider';
import type { BackofficeNavigationGroup } from '@/components/shells';

export const OPERATIONS_ORDERS_ROOT = '/backoffice/orders';
export const OPERATIONS_PAYMENTS_ROOT = '/backoffice/payments';
export const OPERATIONS_REFUNDS_ROOT = '/backoffice/refunds';
export const OPERATIONS_AFTER_SALES_ROOT = '/backoffice/after-sales';
export const OPERATIONS_WARRANTIES_ROOT = '/backoffice/warranties';
export const OPERATIONS_WARRANTY_POLICIES_ROOT = '/backoffice/warranty-policies';

const BACKOFFICE_ROOT = '/backoffice';
const CATALOG_ROOT = '/backoffice/catalog/products';
const INVENTORY_ROOT = '/backoffice/inventory/units';
const VOUCHERS_ROOT = '/backoffice/vouchers';

export function operationsNavigationForRole(
  role: AuthRole | null | undefined,
  pathname: string,
): readonly BackofficeNavigationGroup[] {
  if (!canAccessOperationsWorkspace(role)) return [];

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
          href: CATALOG_ROOT,
          label: 'Danh mục',
          icon: 'catalog',
          isCurrent: isPathWithin(pathname, CATALOG_ROOT),
        },
        {
          href: INVENTORY_ROOT,
          label: 'Kho hàng',
          icon: 'inventory',
          isCurrent: isPathWithin(pathname, '/backoffice/inventory'),
        },
        {
          href: OPERATIONS_ORDERS_ROOT,
          label: 'Đơn hàng',
          icon: 'orders',
          isCurrent: isPathWithin(pathname, OPERATIONS_ORDERS_ROOT),
        },
        {
          href: VOUCHERS_ROOT,
          label: 'Mã ưu đãi',
          icon: 'vouchers',
          isCurrent: isPathWithin(pathname, VOUCHERS_ROOT),
          isDisabled: role !== 'ADMIN',
        },
      ],
    },
    {
      label: 'Tài chính',
      items: [
        {
          href: OPERATIONS_PAYMENTS_ROOT,
          label: 'Duyệt thanh toán',
          icon: 'payments',
          isCurrent: isPathWithin(pathname, OPERATIONS_PAYMENTS_ROOT),
        },
        {
          href: OPERATIONS_REFUNDS_ROOT,
          label: 'Hoàn tiền',
          icon: 'refunds',
          isCurrent: isPathWithin(pathname, OPERATIONS_REFUNDS_ROOT),
        },
      ],
    },
    {
      label: 'Sau mua',
      items: [
        {
          href: OPERATIONS_AFTER_SALES_ROOT,
          label: 'Hỗ trợ sau mua',
          icon: 'after-sales',
          isCurrent: isPathWithin(pathname, OPERATIONS_AFTER_SALES_ROOT),
        },
        {
          href: OPERATIONS_WARRANTIES_ROOT,
          label: 'Bảo hành',
          icon: 'warranties',
          isCurrent: isPathWithin(pathname, OPERATIONS_WARRANTIES_ROOT),
        },
        {
          href: OPERATIONS_WARRANTY_POLICIES_ROOT,
          label: 'Chính sách bảo hành',
          icon: 'warranty-policies',
          isCurrent: isPathWithin(pathname, OPERATIONS_WARRANTY_POLICIES_ROOT),
        },
      ],
    },
  ];
}

export function canAccessOperationsWorkspace(role: AuthRole | null | undefined): boolean {
  return role === 'EMPLOYEE' || role === 'ADMIN';
}

function isPathWithin(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}
