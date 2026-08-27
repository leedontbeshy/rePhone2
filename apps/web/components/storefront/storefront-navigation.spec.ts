import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_ACCOUNT_MENU,
  CUSTOMER_NAVIGATION,
  customerNavigationForSession,
  isStorefrontNavigationCurrent,
  STOREFRONT_NAVIGATION,
} from './storefront-navigation';

describe('storefront navigation', () => {
  it('uses customer-facing Vietnamese labels', () => {
    expect(STOREFRONT_NAVIGATION.map(({ label }) => label)).toContain('Ưu đãi');
    expect(STOREFRONT_NAVIGATION.map(({ label }) => label)).not.toContain('Voucher');
  });

  it('keeps public catalog navigation separate from customer account shortcuts', () => {
    expect(STOREFRONT_NAVIGATION).toEqual([
      { href: '/', label: 'iPhone' },
      { href: '/products?productType=ACCESSORY&inStock=true', label: 'Phụ kiện' },
      { href: '/products?productType=IPHONE&inStock=true', label: 'Máy đang bán' },
      { href: '/vouchers', label: 'Ưu đãi' },
      { href: '/store', label: 'Liên hệ' },
    ]);
    expect(CUSTOMER_NAVIGATION).toEqual([
      { href: '/warranties', label: 'Bảo hành' },
      { href: '/wishlist', label: 'Ưa thích' },
      { href: '/orders', label: 'Đơn hàng' },
    ]);
    expect(CUSTOMER_ACCOUNT_MENU).toEqual([
      { href: '/account', label: 'Quản lý tài khoản' },
      { href: '/warranties', label: 'Bảo hành' },
      { href: '/wishlist', label: 'Ưa thích' },
      { href: '/orders', label: 'Đơn hàng' },
    ]);
  });

  it('shows customer shortcuts only for an authenticated customer', () => {
    expect(customerNavigationForSession('authenticated', 'CUSTOMER')).toBe(CUSTOMER_NAVIGATION);

    expect(customerNavigationForSession('loading', 'CUSTOMER')).toEqual([]);
    expect(customerNavigationForSession('anonymous', 'CUSTOMER')).toEqual([]);
    expect(customerNavigationForSession('authenticated', 'EMPLOYEE')).toEqual([]);
    expect(customerNavigationForSession('authenticated', 'ADMIN')).toEqual([]);
    expect(customerNavigationForSession('authenticated', null)).toEqual([]);
  });

  it('marks the current public route and its descendants', () => {
    expect(isStorefrontNavigationCurrent('/store', '/store')).toBe(true);
    expect(isStorefrontNavigationCurrent('/store', '/store/ho-chi-minh')).toBe(true);
    expect(isStorefrontNavigationCurrent('/store', '/vouchers')).toBe(false);
  });

  it('uses all target query values to distinguish product navigation items', () => {
    const accessories = '/products?productType=ACCESSORY&inStock=true';
    const iphones = '/products?productType=IPHONE&inStock=true';

    expect(
      isStorefrontNavigationCurrent(accessories, '/products', 'productType=ACCESSORY&inStock=true'),
    ).toBe(true);
    expect(
      isStorefrontNavigationCurrent(iphones, '/products', 'productType=ACCESSORY&inStock=true'),
    ).toBe(false);
    expect(
      isStorefrontNavigationCurrent(iphones, '/products', 'productType=IPHONE&inStock=true'),
    ).toBe(true);
    expect(
      isStorefrontNavigationCurrent(iphones, '/products', 'productType=IPHONE&inStock=false'),
    ).toBe(false);
    expect(isStorefrontNavigationCurrent(iphones, '/products', 'productType=IPHONE')).toBe(false);
  });
});
