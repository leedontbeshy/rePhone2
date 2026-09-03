import 'server-only';

import { createApiClient, type components } from '@rephone/api-client';
import type { CatalogListQuery } from './catalog-query';
import { serverApiBaseUrl } from './server-api';

const RETRYABLE_CATALOG_STATUSES = new Set([500, 502, 503, 504]);
const CATALOG_READ_TIMEOUT_MS = 8_000;

const noStoreFetch: typeof globalThis.fetch = async (input, init) => {
  const parentSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (isAborted(parentSignal)) throw parentSignal?.reason;
    const timeoutSignal = AbortSignal.timeout(CATALOG_READ_TIMEOUT_MS);
    const signal = parentSignal ? AbortSignal.any([parentSignal, timeoutSignal]) : timeoutSignal;
    try {
      const response = await fetch(input, { ...init, cache: 'no-store', signal });
      if (attempt > 0 || !RETRYABLE_CATALOG_STATUSES.has(response.status)) return response;
      await response.body?.cancel();
    } catch (error) {
      if (attempt > 0 || isAborted(parentSignal)) throw error;
    }
  }
  throw new Error('Catalog request retry ended unexpectedly.');
};

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

const catalogClient = createApiClient({ baseUrl: serverApiBaseUrl, fetch: noStoreFetch });

export type ProductListItem = components['schemas']['ProductListItemDto'];
export type ProductDetail = components['schemas']['ProductDetailDto'];
export type IphoneVariant = components['schemas']['IphoneVariantDto'];
export type AccessoryVariant = components['schemas']['AccessoryVariantDto'];
export type UsedIphoneDetail = components['schemas']['UsedIphoneDetailDto'];
export type PublicMedia = components['schemas']['PublicMediaDto'];

export class CatalogApiError extends Error {
  public constructor(public readonly status: number) {
    super(status === 404 ? 'Không tìm thấy sản phẩm.' : 'Không thể tải danh mục lúc này.');
    this.name = 'CatalogApiError';
  }
}

export async function listPublicProducts(query: CatalogListQuery) {
  const result = await catalogClient.GET('/api/v1/products', { params: { query } });
  if (result.data === undefined) {
    throw new CatalogApiError(result.response.status);
  }
  return result.data;
}

export async function listAllPublicProducts(
  query: Omit<CatalogListQuery, 'page' | 'pageSize'>,
): Promise<readonly ProductListItem[]> {
  const pageSize = 100;
  const firstPage = await listPublicProducts({ ...query, page: 1, pageSize });
  const totalPages = firstPage.meta.pagination.totalPages;
  if (totalPages <= 1) return firstPage.data;

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      listPublicProducts({ ...query, page: index + 2, pageSize }),
    ),
  );
  return [firstPage, ...remainingPages].flatMap((page) => page.data);
}

export async function getPublicProduct(slug: string): Promise<ProductDetail> {
  const result = await catalogClient.GET('/api/v1/products/{slug}', {
    params: { path: { slug } },
  });
  if (result.data === undefined) {
    throw new CatalogApiError(result.response.status);
  }
  return result.data.data;
}

export async function getPublicUsedIphone(
  slug: string,
  inventoryCode: string,
): Promise<UsedIphoneDetail> {
  const result = await catalogClient.GET('/api/v1/products/{slug}/units/{inventoryCode}', {
    params: { path: { slug, inventoryCode } },
  });
  if (result.data === undefined) {
    throw new CatalogApiError(result.response.status);
  }
  return result.data.data;
}

export function isIphoneVariant(
  variant: IphoneVariant | AccessoryVariant,
): variant is IphoneVariant {
  return 'availableUnits' in variant;
}
