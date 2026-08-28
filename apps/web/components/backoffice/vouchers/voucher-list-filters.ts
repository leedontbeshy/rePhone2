import type { Voucher, VoucherQuery } from '@/lib/backoffice-voucher-api';

export const VOUCHER_LIST_PAGE_SIZE = 12;

export type VoucherStatusFilter = '' | Voucher['status'];
export type VoucherDiscountFilter = '' | Voucher['discountType'];
export type VoucherScopeFilter = '' | Voucher['scopeType'];

export interface VoucherFilterDraft {
  readonly q: string;
  readonly status: VoucherStatusFilter;
  readonly discountType: VoucherDiscountFilter;
  readonly scopeType: VoucherScopeFilter;
}

interface SearchParamsReader {
  get(name: string): string | null;
}

export function voucherQueryFromSearch(searchParams: SearchParamsReader): VoucherQuery {
  const pageValue = Number(searchParams.get('page'));
  const status = parseVoucherStatus(searchParams.get('status'));
  const discountType = parseVoucherDiscount(searchParams.get('discountType'));
  const scopeType = parseVoucherScope(searchParams.get('scopeType'));
  const q = searchParams.get('q')?.trim();

  return {
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
    pageSize: VOUCHER_LIST_PAGE_SIZE,
    ...(q === undefined || q === '' ? {} : { q }),
    ...(status === '' ? {} : { status }),
    ...(discountType === '' ? {} : { discountType }),
    ...(scopeType === '' ? {} : { scopeType }),
  };
}

export function voucherDraftFromQuery(query: VoucherQuery): VoucherFilterDraft {
  return {
    q: query.q ?? '',
    status: query.status ?? '',
    discountType: query.discountType ?? '',
    scopeType: query.scopeType ?? '',
  };
}

export function voucherQueryFromDraft(filters: VoucherFilterDraft, page = 1): VoucherQuery {
  const q = filters.q.trim();
  return {
    page,
    pageSize: VOUCHER_LIST_PAGE_SIZE,
    ...(q === '' ? {} : { q }),
    ...(filters.status === '' ? {} : { status: filters.status }),
    ...(filters.discountType === '' ? {} : { discountType: filters.discountType }),
    ...(filters.scopeType === '' ? {} : { scopeType: filters.scopeType }),
  };
}

export function voucherQueriesEqual(left: VoucherQuery, right: VoucherQuery): boolean {
  return (
    left.page === right.page &&
    left.pageSize === right.pageSize &&
    left.q === right.q &&
    left.status === right.status &&
    left.discountType === right.discountType &&
    left.scopeType === right.scopeType
  );
}

export function voucherFilterDraftsEqual(
  left: VoucherFilterDraft,
  right: VoucherFilterDraft,
): boolean {
  return (
    left.q === right.q &&
    left.status === right.status &&
    left.discountType === right.discountType &&
    left.scopeType === right.scopeType
  );
}

export function buildVoucherListHref(
  root: string,
  filters: VoucherFilterDraft & { readonly page: number },
): string {
  const params = new URLSearchParams();
  if (filters.q.trim() !== '') params.set('q', filters.q.trim());
  if (filters.status !== '') params.set('status', filters.status);
  if (filters.discountType !== '') params.set('discountType', filters.discountType);
  if (filters.scopeType !== '') params.set('scopeType', filters.scopeType);
  if (filters.page > 1) params.set('page', String(filters.page));
  const query = params.toString();
  return query === '' ? root : `${root}?${query}`;
}

function parseVoucherStatus(value: string | null): VoucherStatusFilter {
  return value === 'ACTIVE' || value === 'DRAFT' || value === 'PAUSED' || value === 'ARCHIVED'
    ? value
    : '';
}

function parseVoucherDiscount(value: string | null): VoucherDiscountFilter {
  return value === 'PERCENT' || value === 'FIXED' ? value : '';
}

function parseVoucherScope(value: string | null): VoucherScopeFilter {
  return value === 'ORDER' ||
    value === 'PRODUCT_TYPE' ||
    value === 'PRODUCTS' ||
    value === 'VARIANTS'
    ? value
    : '';
}
