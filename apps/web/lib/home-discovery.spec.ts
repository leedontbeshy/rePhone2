import { describe, expect, it } from 'vitest';
import type { ProductListItem } from '@/lib/catalog-api';
import { buildHomeDiscovery } from './home-discovery';

function product(name: string, overrides: Partial<ProductListItem> = {}): ProductListItem {
  const slug = name.toLowerCase().replaceAll(' ', '-');
  return {
    id: slug,
    slug,
    name,
    brand: 'Apple',
    productType: 'IPHONE',
    inStock: true,
    price: { fromPrice: '12500000' },
    colorOptions: [],
    storageOptions: [],
    ...overrides,
  };
}

describe('home discovery', () => {
  it('resolves the preferred records and covers every remaining model exactly once', () => {
    const products = [
      product('iPhone 17 Pro'),
      product('iPhone 16'),
      product('iPhone 15'),
      product('iPhone 17'),
      product('iPhone 14'),
      product('iPhone 13'),
      product('Cáp sạc', { productType: 'ACCESSORY' }),
    ];
    const duplicate = products.find(({ slug }) => slug === 'iphone-17-pro');
    const result = buildHomeDiscovery(
      duplicate === undefined ? products : [...products, duplicate],
    );
    expect(result.featured.map(({ slug }) => slug)).toEqual([
      'iphone-17',
      'iphone-16',
      'iphone-15',
    ]);
    expect(result.gridProducts.map(({ slug }) => slug)).toEqual([
      'iphone-17-pro',
      'iphone-14',
      'iphone-13',
    ]);
    const visible = [...result.featured, ...result.gridProducts].map(({ id }) => id);
    expect(new Set(visible).size).toBe(6);
    expect(visible).toHaveLength(6);
  });

  it('falls back to existing ordered models without inventing products or prices', () => {
    const soldOut = product('iPhone 15 Pro', { inStock: false, price: { fromPrice: '99999999' } });
    const result = buildHomeDiscovery([product('iPhone 13'), soldOut]);
    expect(result.featured.map(({ slug }) => slug)).toEqual(['iphone-15-pro', 'iphone-13']);
    expect(result.featured[0]).toMatchObject({ inStock: false, fromPrice: '99999999' });
    expect(result.gridProducts).toEqual([]);
  });

  it('filters by the existing generation resolver, including featured records, without duplicates', () => {
    const result = buildHomeDiscovery(
      [
        product('iPhone 17'),
        product('iPhone Air'),
        product('iPhone 17 Pro'),
        product('iPhone 16'),
        product('iPhone 15'),
      ],
      'iphone-17',
    );
    expect(result.selectedGeneration).toBe('iphone-17');
    expect(result.gridProducts.map(({ name }) => name)).toEqual([
      'iPhone 17',
      'iPhone Air',
      'iPhone 17 Pro',
    ]);
    expect(new Set(result.gridProducts.map(({ id }) => id)).size).toBe(3);
  });

  it('treats unknown and repeated query values as the all-generations view', () => {
    const products = [
      product('iPhone 17'),
      product('iPhone 16'),
      product('iPhone 15'),
      product('iPhone 13'),
    ];
    for (const query of ['iphone-999', 'https://example.test', ['iphone-17', 'iphone-16']]) {
      const result = buildHomeDiscovery(products, query);
      expect(result.selectedGeneration).toBeNull();
      expect(result.gridProducts.map(({ slug }) => slug)).toEqual(['iphone-13']);
    }
  });

  it('keeps an empty public catalog empty', () => {
    expect(buildHomeDiscovery([])).toMatchObject({
      featured: [],
      generations: [],
      gridProducts: [],
    });
  });
});
