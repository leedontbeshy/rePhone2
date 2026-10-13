import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getPublicProductSummary,
  listAllPublicProducts,
  listPublicProducts,
  type CatalogApiError,
  type ProductListItem,
} from './catalog-api';

describe('listAllPublicProducts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses one bounded name search and matches exact identity for the model price', async () => {
    const target = product('iphone-17');
    const other = { ...product('iphone-17-pro'), price: { fromPrice: '1' } };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(catalogResponse([other, target], 1, 3, 250));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getPublicProductSummary(target)).resolves.toEqual(target);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const input = fetchMock.mock.calls[0]?.[0];
    const url = new URL(input instanceof Request ? input.url : String(input));
    expect(url.searchParams.get('q')).toBe(target.name);
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('pageSize')).toBe('100');
    expect(url.searchParams.get('productType')).toBe('IPHONE');
  });

  it('omits starting-price data if the exact model is absent or the supplemental read fails', async () => {
    const target = product('iphone-17');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(catalogResponse([product('iphone-17-pro')], 1, 1, 1))
      .mockResolvedValueOnce(new Response(null, { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getPublicProductSummary(target)).resolves.toBeUndefined();
    await expect(getPublicProductSummary(target)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it('retries one transient server failure before returning the public catalog', async () => {
    const item = product('iphone-17');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(catalogResponse([item], 1, 1, 1));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listPublicProducts({ page: 1, pageSize: 20, sortBy: 'releaseYear', sortOrder: 'desc' }),
    ).resolves.toMatchObject({ data: [item] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries one transient transport failure before returning the public catalog', async () => {
    const item = product('iphone-17');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('temporary transport failure'))
      .mockResolvedValueOnce(catalogResponse([item], 1, 1, 1));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listPublicProducts({ page: 1, pageSize: 20, sortBy: 'releaseYear', sortOrder: 'desc' }),
    ).resolves.toMatchObject({ data: [item] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a permanent public catalog error', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listPublicProducts({ page: 1, pageSize: 20, sortBy: 'releaseYear', sortOrder: 'desc' }),
    ).rejects.toEqual(expect.objectContaining<Partial<CatalogApiError>>({ status: 404 }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
