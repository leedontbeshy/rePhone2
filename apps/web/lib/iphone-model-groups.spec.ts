import { describe, expect, it } from 'vitest';
import type { ProductListItem } from './catalog-api';
import { groupIphoneModels } from './iphone-model-groups';

describe('groupIphoneModels', () => {
  it('groups generations newest-first and keeps the agreed model order', () => {
    const groups = groupIphoneModels([
      product('iPhone 15 Pro Max'),
      product('iPhone 14 Plus'),
      product('iPhone 15'),
      product('iPhone 15 Pro'),
      product('iPhone 15 Plus'),
      product('iPhone 15 mini'),
      product('iPhone 15e'),
      product('iPhone 15 Air'),
    ]);

    expect(groups.map((group) => group.label)).toEqual(['iPhone 15', 'iPhone 14']);
    expect(groups[0]?.products.map((item) => item.name)).toEqual([
      'iPhone 15',
      'iPhone 15 mini',
      'iPhone 15e',
      'iPhone 15 Plus',
      'iPhone 15 Air',
      'iPhone 15 Pro',
      'iPhone 15 Pro Max',
    ]);
  });

  it('handles current Air, legacy numeric, X and SE families without guessing cards', () => {
    const groups = groupIphoneModels([
      product('iPhone SE (thế hệ 1)'),
      product('iPhone XS Max'),
      product('iPhone 5s'),
      product('iPhone 6s Plus'),
      product('iPhone Air'),
      product('iPhone 5'),
      product('iPhone 6 Plus'),
      product('iPhone XR'),
      product('iPhone SE (thế hệ 3)'),
      product('iPhone 6'),
      product('iPhone X'),
      product('iPhone XS'),
      product('iPhone 5c'),
      product('iPhone 6s'),
    ]);

    expect(groups.map((group) => group.label)).toEqual([
      'iPhone 17',
      'iPhone X',
      'iPhone 6',
      'iPhone 5',
      'iPhone SE',
    ]);
    expect(
      groups.find((group) => group.label === 'iPhone X')?.products.map((item) => item.name),
    ).toEqual(['iPhone X', 'iPhone XR', 'iPhone XS', 'iPhone XS Max']);
    expect(
      groups.find((group) => group.label === 'iPhone 6')?.products.map((item) => item.name),
    ).toEqual(['iPhone 6', 'iPhone 6 Plus', 'iPhone 6s', 'iPhone 6s Plus']);
    expect(
      groups.find((group) => group.label === 'iPhone SE')?.products.map((item) => item.name),
    ).toEqual(['iPhone SE (thế hệ 3)', 'iPhone SE (thế hệ 1)']);
  });

  it('puts unrecognized iPhone names in a stable fallback group and ignores accessories', () => {
    const unknown = product('iPhone Prototype');
    const groups = groupIphoneModels([
      unknown,
      { ...product('Ốp lưng'), productType: 'ACCESSORY' },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe('iphone-other');
    expect(groups[0]?.label).toBe('Dòng iPhone khác');
    expect(groups[0]?.products.map((item) => item.name)).toEqual([unknown.name]);
  });
});

function product(name: string): ProductListItem {
  return {
    brand: 'Apple',
    colorOptions: [],
    id: `product-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    inStock: false,
    name,
    price: {},
    productType: 'IPHONE',
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    storageOptions: [],
  };
}
