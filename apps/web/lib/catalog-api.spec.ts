import { afterEach, describe, expect, it, vi } from 'vitest';
import { listAllPublicProducts, type ProductListItem } from './catalog-api';

describe('listAllPublicProducts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads every page with a stable query before returning the catalog', async () => {
    const first = product('iphone-17');
    const second = product('iphone-16');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(catalogResponse([first], 1, 2, 101))
      .mockResolvedValueOnce(catalogResponse([second], 2, 2, 101));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listAllPublicProducts({
        productType: 'IPHONE',
        sortBy: 'releaseYear',
        sortOrder: 'desc',
      }),
    ).resolves.toEqual([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map(
      ([input]) => new URL(input instanceof Request ? input.url : String(input)),
    );
    expect(urls.map((url) => url.searchParams.get('page'))).toEqual(['1', '2']);
    expect(urls.every((url) => url.searchParams.get('pageSize') === '100')).toBe(true);
    expect(urls.every((url) => url.searchParams.get('productType') === 'IPHONE')).toBe(true);
    expect(urls.every((url) => url.searchParams.get('sortBy') === 'releaseYear')).toBe(true);
    expect(urls.every((url) => url.searchParams.get('sortOrder') === 'desc')).toBe(true);
  });
});

function catalogResponse(
  data: readonly ProductListItem[],
  page: number,
  totalPages: number,
  totalItems: number,
) {
  return new Response(
    JSON.stringify({
      data,
      meta: {
        pagination: { page, pageSize: 100, totalItems, totalPages },
        requestId: `request-${String(page)}`,
      },
    }),
    { headers: { 'content-type': 'application/json' }, status: 200 },
  );
}

function product(slug: string): ProductListItem {
  return {
    brand: 'Apple',
    colorOptions: [],
    id: `product-${slug}`,
    inStock: false,
    name: slug.replaceAll('-', ' '),
    price: {},
    productType: 'IPHONE',
    slug,
    storageOptions: [],
  };
}
