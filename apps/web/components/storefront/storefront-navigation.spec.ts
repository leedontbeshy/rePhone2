import { describe, expect, it } from 'vitest';
import { isStorefrontNavigationCurrent, STOREFRONT_NAVIGATION } from './storefront-navigation';

describe('storefront navigation', () => {
  it('uses customer-facing Vietnamese labels', () => {
    expect(STOREFRONT_NAVIGATION.map(({ label }) => label)).toContain('Ưu đãi');
    expect(STOREFRONT_NAVIGATION.map(({ label }) => label)).not.toContain('Voucher');
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
