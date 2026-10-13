import type { AuthRole } from '@/app/auth-provider';
import type { BackofficeNavigationGroup } from '@/components/shells';
import { inventoryNavigationForPath } from './inventory/inventory-navigation';

export const BACKOFFICE_ROOT = '/backoffice';
export const BACKOFFICE_CATALOG_ROOT = '/backoffice/catalog/products';
export const BACKOFFICE_VOUCHERS_ROOT = '/backoffice/vouchers';
export const BACKOFFICE_ORDERS_ROOT = '/backoffice/orders';
export const BACKOFFICE_PAYMENTS_ROOT = '/backoffice/payments';
export const BACKOFFICE_REFUNDS_ROOT = '/backoffice/refunds';
export const BACKOFFICE_AFTER_SALES_ROOT = '/backoffice/after-sales';
export const BACKOFFICE_WARRANTIES_ROOT = '/backoffice/warranties';
export const BACKOFFICE_WARRANTY_POLICIES_ROOT = '/backoffice/warranty-policies';
export const BACKOFFICE_EMPLOYEES_ROOT = '/backoffice/employees';
export const BACKOFFICE_CUSTOMERS_ROOT = '/backoffice/customers';
export const BACKOFFICE_SETTINGS_ROOT = '/backoffice/settings';
export const BACKOFFICE_AUDIT_LOGS_ROOT = '/backoffice/audit-logs';
export const BACKOFFICE_SYSTEM_HEALTH_ROOT = '/backoffice/system/health';

interface BackofficeNavigationOptions {
  readonly activePath?: string | undefined;
  readonly hrefOverrides?: Readonly<Record<string, string>> | undefined;
}

export function backofficeNavigationForRole(
  role: AuthRole | null | undefined,
  pathname: string,
  options: BackofficeNavigationOptions = {},
): readonly BackofficeNavigationGroup[] {
  if (!canAccessBackofficeNavigation(role)) return [];

  const activePath = options.activePath ?? pathname;
  const inventoryItems = inventoryNavigationForPath(activePath).map((item) => ({
    ...item,
    href: options.hrefOverrides?.[item.href] ?? item.href,
  }));

  return [
    {
      label: 'Vận hành',
      items: [
        {
          href: BACKOFFICE_ROOT,
          label: 'Tài chính',
          icon: 'overview',
          isCurrent: activePath === BACKOFFICE_ROOT,
        },
        {
          href: BACKOFFICE_CATALOG_ROOT,
          label: 'Danh mục',
          icon: 'catalog',
          isCurrent: isPathWithin(activePath, BACKOFFICE_CATALOG_ROOT),
        },
        {
          href: BACKOFFICE_VOUCHERS_ROOT,
          label: 'Mã ưu đãi',
          icon: 'vouchers',
          isCurrent: isPathWithin(activePath, BACKOFFICE_VOUCHERS_ROOT),
          isDisabled: role !== 'ADMIN',
        },
      ],
    },
    {
      label: 'Kho hàng',
      items: inventoryItems,
    },
    {
      label: 'Đơn hàng',
      items: [
        {
          href: BACKOFFICE_ORDERS_ROOT,
          label: 'Danh sách đơn hàng',
          icon: 'orders',
          isCurrent: isPathWithin(activePath, BACKOFFICE_ORDERS_ROOT),
        },
        {
          href: '/backoffice/affiliates',
          label: 'Cộng tác viên',
          icon: 'vouchers',
          isCurrent: isPathWithin(activePath, '/backoffice/affiliates'),
          isDisabled: role !== 'ADMIN',
        },
        {
          href: '/backoffice/dealers',
          label: 'Đại lý',
          icon: 'orders',
          isCurrent: isPathWithin(activePath, '/backoffice/dealers'),
        },
        {
          href: BACKOFFICE_PAYMENTS_ROOT,
          label: 'Duyệt thanh toán',
          icon: 'payments',
          isCurrent: isPathWithin(activePath, BACKOFFICE_PAYMENTS_ROOT),
        },
        {
          href: BACKOFFICE_REFUNDS_ROOT,
          label: 'Hoàn tiền',
          icon: 'refunds',
          isCurrent: isPathWithin(activePath, BACKOFFICE_REFUNDS_ROOT),
        },
      ],
    },
    {
      label: 'Sau mua',
      items: [
        {
          href: BACKOFFICE_AFTER_SALES_ROOT,
          label: 'Hỗ trợ sau mua',
          icon: 'after-sales',
          isCurrent: isPathWithin(activePath, BACKOFFICE_AFTER_SALES_ROOT),
        },
        {
          href: BACKOFFICE_WARRANTIES_ROOT,
          label: 'Bảo hành',
          icon: 'warranties',
          isCurrent: isPathWithin(activePath, BACKOFFICE_WARRANTIES_ROOT),
        },
        {
          href: BACKOFFICE_WARRANTY_POLICIES_ROOT,
          label: 'Chính sách bảo hành',
          icon: 'warranty-policies',
          isCurrent: isPathWithin(activePath, BACKOFFICE_WARRANTY_POLICIES_ROOT),
        },
      ],
    },
    {
      label: 'Hệ thống',
      items: [
        {
          href: BACKOFFICE_EMPLOYEES_ROOT,
          label: 'Nhân viên',
          icon: 'employees',
          isCurrent: isPathWithin(activePath, BACKOFFICE_EMPLOYEES_ROOT),
          isDisabled: role !== 'ADMIN',
        },
        {
          href: BACKOFFICE_CUSTOMERS_ROOT,
          label: 'Khách hàng',
          icon: 'customers',
          isCurrent: isPathWithin(activePath, BACKOFFICE_CUSTOMERS_ROOT),
        },
        {
          href: BACKOFFICE_SETTINGS_ROOT,
          label: 'Cấu hình cửa hàng',
          icon: 'settings',
          isCurrent: isPathWithin(activePath, BACKOFFICE_SETTINGS_ROOT),
          isDisabled: role !== 'ADMIN',
        },
        {
          href: BACKOFFICE_AUDIT_LOGS_ROOT,
          label: 'Nhật ký hoạt động',
          icon: 'audit-logs',
          isCurrent: isPathWithin(activePath, BACKOFFICE_AUDIT_LOGS_ROOT),
          isDisabled: role !== 'ADMIN',
        },
        {
          href: BACKOFFICE_SYSTEM_HEALTH_ROOT,
          label: 'Trạng thái hệ thống',
          icon: 'system-health',
          isCurrent: isPathWithin(activePath, BACKOFFICE_SYSTEM_HEALTH_ROOT),
          isDisabled: role !== 'ADMIN',
        },
      ],
    },
  ];
}

export function canAccessBackofficeNavigation(role: AuthRole | null | undefined): boolean {
  return role === 'EMPLOYEE' || role === 'ADMIN';
}

function isPathWithin(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}
