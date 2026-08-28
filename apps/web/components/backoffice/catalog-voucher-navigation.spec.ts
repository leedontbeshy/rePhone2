import { describe, expect, it } from 'vitest';
import {
  canAccessCatalogVoucherPath,
  catalogVoucherAccessForPath,
  catalogVoucherNavigationForRole,
} from './catalog-voucher-navigation';

describe('FE-05 backoffice navigation', () => {
  it('shows the complete operations navigation while keeping voucher administration disabled', () => {
    const groups = catalogVoucherNavigationForRole(
      'EMPLOYEE',
      '/backoffice/catalog/products/product-id',
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toEqual([
      {
        href: '#',
        label: 'Tổng quan',
        icon: 'overview',
        isDisabled: true,
      },
      {
        href: '/backoffice/catalog/products',
        label: 'Danh mục',
        icon: 'catalog',
        isCurrent: true,
      },
      {
        href: '/backoffice/inventory/intake',
        label: 'Kho hàng',
        icon: 'inventory',
        isCurrent: false,
      },
      {
        href: '/backoffice/orders',
        label: 'Đơn hàng',
        icon: 'orders',
        isCurrent: false,
      },
      {
        href: '/backoffice/vouchers',
        label: 'Mã ưu đãi',
        icon: 'vouchers',
        isCurrent: false,
        isDisabled: true,
        isSeparated: true,
      },
    ]);
    expect(canAccessCatalogVoucherPath('EMPLOYEE', '/backoffice/catalog/products/new')).toBe(true);
    expect(canAccessCatalogVoucherPath('EMPLOYEE', '/backoffice/vouchers')).toBe(false);
  });

  it('enables voucher administration for admins and marks nested routes current', () => {
    const groups = catalogVoucherNavigationForRole('ADMIN', '/backoffice/vouchers/voucher-id');

    expect(groups[0]?.items).toEqual([
      {
        href: '#',
        label: 'Tổng quan',
        icon: 'overview',
        isDisabled: true,
      },
      {
        href: '/backoffice/catalog/products',
        label: 'Danh mục',
        icon: 'catalog',
        isCurrent: false,
      },
      {
        href: '/backoffice/inventory/intake',
        label: 'Kho hàng',
        icon: 'inventory',
        isCurrent: false,
      },
      {
        href: '/backoffice/orders',
        label: 'Đơn hàng',
        icon: 'orders',
        isCurrent: false,
      },
      {
        href: '/backoffice/vouchers',
        label: 'Mã ưu đãi',
        icon: 'vouchers',
        isCurrent: true,
        isDisabled: false,
        isSeparated: true,
      },
    ]);
    expect(catalogVoucherAccessForPath('/backoffice/vouchers/new')).toBe('admin');
    expect(canAccessCatalogVoucherPath('ADMIN', '/backoffice/vouchers/new')).toBe(true);
  });

  it('returns no management navigation for customer and anonymous sessions', () => {
    expect(catalogVoucherNavigationForRole('CUSTOMER', '/backoffice/catalog/products')).toEqual([]);
    expect(catalogVoucherNavigationForRole(null, '/backoffice/catalog/products')).toEqual([]);
    expect(canAccessCatalogVoucherPath('CUSTOMER', '/backoffice/catalog/products')).toBe(false);
    expect(canAccessCatalogVoucherPath(undefined, '/backoffice/catalog/products')).toBe(false);
  });
});
