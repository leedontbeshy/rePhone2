import { describe, expect, it } from 'vitest';
import {
  canAccessCatalogVoucherPath,
  catalogVoucherAccessForPath,
  catalogVoucherNavigationForRole,
} from './catalog-voucher-navigation';

describe('FE-05 backoffice navigation', () => {
  it('shows product management to employees without exposing voucher administration', () => {
    const groups = catalogVoucherNavigationForRole(
      'EMPLOYEE',
      '/backoffice/catalog/products/product-id',
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toEqual([
      {
        href: '/backoffice/catalog/products',
        label: 'Sản phẩm',
        isCurrent: true,
      },
    ]);
    expect(canAccessCatalogVoucherPath('EMPLOYEE', '/backoffice/catalog/products/new')).toBe(true);
    expect(canAccessCatalogVoucherPath('EMPLOYEE', '/backoffice/vouchers')).toBe(false);
  });

  it('adds voucher administration for admins and marks nested routes current', () => {
    const groups = catalogVoucherNavigationForRole('ADMIN', '/backoffice/vouchers/voucher-id');

    expect(groups[0]?.items).toEqual([
      {
        href: '/backoffice/catalog/products',
        label: 'Sản phẩm',
        isCurrent: false,
      },
      {
        href: '/backoffice/vouchers',
        label: 'Mã ưu đãi',
        isCurrent: true,
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
