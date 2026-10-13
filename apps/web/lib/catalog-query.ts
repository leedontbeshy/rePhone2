import type { paths } from '@rephone/api-client';

export type CatalogSearchParams = Record<string, string | string[] | undefined>;
export type CatalogListQuery = NonNullable<paths['/api/v1/products']['get']['parameters']['query']>;

export function toCatalogListQuery(searchParams: CatalogSearchParams): CatalogListQuery {
  const query: CatalogListQuery = { sortBy: 'generation', sortOrder: 'desc' };
  assignString(query, 'q', singleValue(searchParams['q']));
  assignString(query, 'productType', singleValue(searchParams['productType']));
  assignNumber(query, 'releaseYear', singleValue(searchParams['releaseYear']));
  assignNumber(query, 'storageCapacityGb', singleValue(searchParams['storageCapacityGb']));
  assignNumber(query, 'ramGb', singleValue(searchParams['ramGb']));
  assignString(query, 'simLockStatus', singleValue(searchParams['simLockStatus']));
  assignString(query, 'colorName', singleValue(searchParams['colorName']));
  assignString(query, 'minPrice', singleValue(searchParams['minPrice']));
  assignString(query, 'maxPrice', singleValue(searchParams['maxPrice']));
  assignBoolean(query, 'inStock', singleValue(searchParams['inStock']));
  assignNumber(query, 'page', singleValue(searchParams['page']));
  assignNumber(query, 'pageSize', singleValue(searchParams['pageSize']));
  assignString(query, 'sortBy', singleValue(searchParams['sortBy']));
  assignString(query, 'sortOrder', singleValue(searchParams['sortOrder']));
  return query;
}

export function catalogPageHref(searchParams: CatalogSearchParams, page: number): string {
  const output = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'page' || value === undefined) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item.length > 0) {
        output.append(key, item);
      }
    }
  }
  output.set('page', page.toString());
  return `/products?${output.toString()}`;
}

export function searchParamValue(
  searchParams: CatalogSearchParams,
  key: string,
): string | undefined {
  return singleValue(searchParams[key]);
}

function singleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function assignString(
  query: CatalogListQuery,
  key: keyof CatalogListQuery,
  value: string | undefined,
): void {
  if (value !== undefined && value.length > 0) {
    Object.assign(query, { [key]: value });
  }
}

function assignNumber(
  query: CatalogListQuery,
  key: keyof CatalogListQuery,
  value: string | undefined,
): void {
  if (value !== undefined && value.length > 0) {
    Object.assign(query, { [key]: /^\d+$/.test(value) ? Number(value) : value });
  }
}

function assignBoolean(
  query: CatalogListQuery,
  key: keyof CatalogListQuery,
  value: string | undefined,
): void {
  if (value !== undefined && value.length > 0) {
    Object.assign(query, {
      [key]: value === 'true' ? true : value === 'false' ? false : value,
    });
  }
}
