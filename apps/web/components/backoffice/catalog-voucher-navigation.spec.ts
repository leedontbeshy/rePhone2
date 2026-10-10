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

    expect(groups.map((group) => group.label)).toEqual([
      'Vận hành',
      'Kho hàng',
      'Đơn hàng',
      'Sau mua',
      'Hệ thống',
    ]);
    expect(groups.flatMap((group) => group.items)).toHaveLength(22);
    expect(
      groups.flatMap((group) => group.items).find((item) => item.label === 'Danh mục'),
    ).toMatchObject({ href: '/backoffice/catalog/products', isCurrent: true });
    expect(
      groups.flatMap((group) => group.items).find((item) => item.label === 'Mã ưu đãi'),
    ).toMatchObject({ href: '/backoffice/vouchers', isDisabled: true });
    expect(
      groups.flatMap((group) => group.items).find((item) => item.label === 'Cộng tác viên'),
    ).toMatchObject({ href: '/backoffice/affiliates', isDisabled: true });
    expect(canAccessCatalogVoucherPath('EMPLOYEE', '/backoffice/catalog/products/new')).toBe(true);
    expect(canAccessCatalogVoucherPath('EMPLOYEE', '/backoffice/vouchers')).toBe(false);
  });

  it('enables voucher administration for admins and marks nested routes current', () => {
    const groups = catalogVoucherNavigationForRole('ADMIN', '/backoffice/vouchers/voucher-id');

    const items = groups.flatMap((group) => group.items);
    expect(items.filter((item) => item.isCurrent)).toHaveLength(1);
    expect(items.find((item) => item.label === 'Mã ưu đãi')).toMatchObject({
      href: '/backoffice/vouchers',
      isCurrent: true,
      isDisabled: false,
    });
    expect(catalogVoucherAccessForPath('/backoffice/vouchers/new')).toBe('admin');
    expect(canAccessCatalogVoucherPath('ADMIN', '/backoffice/vouchers/new')).toBe(true);
  });

  it('returns no management navigation for customer and anonymous sessions', () => {
    expect(catalogVoucherNavigationForRole('CUSTOMER', '/backoffice/catalog/products')).toEqual([]);
    expect(catalogVoucherNavigationForRole(null, '/backoffice/catalog/products')).toEqual([]);
    expect(canAccessCatalogVoucherPath('CUSTOMER', '/backoffice/catalog/products')).toBe(false);
    expect(canAccessCatalogVoucherPath(undefined, '/backoffice/catalog/products')).toBe(false);
  });

  it('links to and marks the overview current only on the exact backoffice root', () => {
    const rootOverview = catalogVoucherNavigationForRole('EMPLOYEE', '/backoffice')[0]?.items[0];
    const nestedOverview = catalogVoucherNavigationForRole('EMPLOYEE', '/backoffice/orders')[0]
      ?.items[0];

    expect(rootOverview).toEqual({
      href: '/backoffice',
      label: 'Tổng quan',
      icon: 'overview',
      isCurrent: true,
    });
    expect(nestedOverview).toMatchObject({ href: '/backoffice', isCurrent: false });
  });
});
