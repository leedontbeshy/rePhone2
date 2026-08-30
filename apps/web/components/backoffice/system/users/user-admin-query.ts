import type { CustomerQuery, EmployeeQuery } from '@/lib/system-admin-api';

export const USER_ADMIN_PAGE_SIZE = 8;

export type EmployeeStatusFilter = '' | NonNullable<EmployeeQuery['status']>;
export type CustomerStatusFilter = '' | NonNullable<CustomerQuery['status']>;

export interface EmployeeFilterDraft {
  readonly q: string;
  readonly status: EmployeeStatusFilter;
}

export interface CustomerFilterDraft {
  readonly q: string;
  readonly sortBy: CustomerQuery['sortBy'];
  readonly status: CustomerStatusFilter;
}

export const EMPTY_EMPLOYEE_FILTERS: EmployeeFilterDraft = { q: '', status: '' };
export const EMPTY_CUSTOMER_FILTERS: CustomerFilterDraft = {
  q: '',
  sortBy: 'createdAt',
  status: '',
};

export function employeeQueryFromSearch(search: URLSearchParams): EmployeeQuery {
  const status = employeeStatus(search.get('status'));
  const q = normalizedSearch(search.get('q'));
  return {
    page: positiveInteger(search.get('page'), 1),
    pageSize: USER_ADMIN_PAGE_SIZE,
    sortBy: 'createdAt',
    sortOrder: search.get('order') === 'asc' ? 'asc' : 'desc',
    ...(q === undefined ? {} : { q }),
    ...(status === undefined ? {} : { status }),
  };
}

export function customerQueryFromSearch(search: URLSearchParams): CustomerQuery {
  const status = customerStatus(search.get('status'));
  const q = normalizedSearch(search.get('q'));
  return {
    page: positiveInteger(search.get('page'), 1),
    pageSize: USER_ADMIN_PAGE_SIZE,
    sortBy: search.get('sort') === 'lastLoginAt' ? 'lastLoginAt' : 'createdAt',
    sortOrder: search.get('order') === 'asc' ? 'asc' : 'desc',
    ...(q === undefined ? {} : { q }),
    ...(status === undefined ? {} : { status }),
  };
}

export function employeeDraftFromQuery(query: EmployeeQuery): EmployeeFilterDraft {
  return { q: query.q ?? '', status: query.status ?? '' };
}

export function customerDraftFromQuery(query: CustomerQuery): CustomerFilterDraft {
  return { q: query.q ?? '', sortBy: query.sortBy, status: query.status ?? '' };
}

export function employeeQueryFromDraft(
  draft: EmployeeFilterDraft,
  current: EmployeeQuery,
): EmployeeQuery {
  const q = normalizedSearch(draft.q);
  return {
    page: 1,
    pageSize: USER_ADMIN_PAGE_SIZE,
    sortBy: 'createdAt',
    sortOrder: current.sortOrder,
    ...(q === undefined ? {} : { q }),
    ...(draft.status === '' ? {} : { status: draft.status }),
  };
}

export function customerQueryFromDraft(
  draft: CustomerFilterDraft,
  current: CustomerQuery,
): CustomerQuery {
  const q = normalizedSearch(draft.q);
  return {
    page: 1,
    pageSize: USER_ADMIN_PAGE_SIZE,
    sortBy: draft.sortBy,
    sortOrder: current.sortOrder,
    ...(q === undefined ? {} : { q }),
    ...(draft.status === '' ? {} : { status: draft.status }),
  };
}

export function buildEmployeeListHref(query: EmployeeQuery, page = query.page): string {
  return buildListHref('/backoffice/employees', {
    page,
    q: query.q,
    status: query.status,
    sortOrder: query.sortOrder,
  });
}

export function buildCustomerListHref(query: CustomerQuery, page = query.page): string {
  return buildListHref('/backoffice/customers', {
    page,
    q: query.q,
    sortBy: query.sortBy,
    status: query.status,
    sortOrder: query.sortOrder,
  });
}

export function employeeQueriesEqual(left: EmployeeQuery, right: EmployeeQuery): boolean {
  return buildEmployeeListHref(left) === buildEmployeeListHref(right);
}

export function customerQueriesEqual(left: CustomerQuery, right: CustomerQuery): boolean {
  return buildCustomerListHref(left) === buildCustomerListHref(right);
}

function buildListHref(
  pathname: string,
  query: {
    page: number;
    q?: string | undefined;
    sortBy?: CustomerQuery['sortBy'] | undefined;
    sortOrder: 'asc' | 'desc';
    status?: string | undefined;
  },
): string {
  const search = new URLSearchParams();
  if (query.q !== undefined) search.set('q', query.q);
  if (query.status !== undefined) search.set('status', query.status);
  if (query.sortBy !== undefined && query.sortBy !== 'createdAt') search.set('sort', query.sortBy);
  if (query.sortOrder !== 'desc') search.set('order', query.sortOrder);
  if (query.page > 1) search.set('page', String(query.page));
  const serialized = search.toString();
  return serialized === '' ? pathname : `${pathname}?${serialized}`;
}

function normalizedSearch(value: string | null): string | undefined {
  if (value === null) return undefined;
  const normalized = value.trim().slice(0, 100);
  return normalized === '' ? undefined : normalized;
}

function positiveInteger(value: string | null, fallback: number): number {
  if (value === null || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

function employeeStatus(value: string | null): EmployeeQuery['status'] | undefined {
  return value === 'PENDING_VERIFICATION' || value === 'ACTIVE' || value === 'DISABLED'
    ? value
    : undefined;
}

function customerStatus(value: string | null): CustomerQuery['status'] | undefined {
  return value === 'ACTIVE' || value === 'SUSPENDED' ? value : undefined;
}
