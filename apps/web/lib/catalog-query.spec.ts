import { describe, expect, it } from 'vitest';
import { catalogPageHref, toCatalogListQuery } from './catalog-query';

describe('catalog URL query mapping', () => {
  it('maps supported query parameters to generated-client types', () => {
    expect(toCatalogListQuery({})).toEqual({ sortBy: 'generation', sortOrder: 'desc' });
    expect(
      toCatalogListQuery({
        q: 'iphone 13',
        productType: 'IPHONE',
        page: '2',
        pageSize: '12',
        inStock: 'false',
        sortBy: 'fromPrice',
        sortOrder: 'asc',
      }),
    ).toEqual({
      q: 'iphone 13',
      productType: 'IPHONE',
      page: 2,
      pageSize: 12,
      inStock: false,
      sortBy: 'fromPrice',
      sortOrder: 'asc',
    });
  });

  it('preserves invalid scalar values so the API remains the validation authority', () => {
    expect(toCatalogListQuery({ page: 'not-a-number', inStock: '1' })).toEqual({
      page: 'not-a-number',
      inStock: '1',
      sortBy: 'generation',
      sortOrder: 'desc',
    });
  });

  it('changes page without dropping active filters', () => {
    expect(catalogPageHref({ q: 'iphone', page: '1', colorName: 'Blue' }, 2)).toBe(
      '/products?q=iphone&colorName=Blue&page=2',
    );
  });
});
