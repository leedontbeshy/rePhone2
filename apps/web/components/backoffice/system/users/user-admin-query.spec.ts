import { describe, expect, it } from 'vitest';
import {
  buildCustomerListHref,
  buildEmployeeListHref,
  customerQueryFromDraft,
  customerQueryFromSearch,
  employeeQueryFromDraft,
  employeeQueryFromSearch,
  USER_ADMIN_PAGE_SIZE,
} from './user-admin-query';

describe('user admin query', () => {
  it('parses a canonical employee query and rejects unsupported values', () => {
    expect(
      employeeQueryFromSearch(new URLSearchParams('q=%20Nguyen%20&page=3&status=ACTIVE&order=asc')),
    ).toEqual({
      page: 3,
      pageSize: USER_ADMIN_PAGE_SIZE,
      q: 'Nguyen',
      sortBy: 'createdAt',
      sortOrder: 'asc',
      status: 'ACTIVE',
    });
    expect(employeeQueryFromSearch(new URLSearchParams('page=-2&status=ADMIN'))).toEqual({
      page: 1,
      pageSize: USER_ADMIN_PAGE_SIZE,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('resets pagination when employee filters change and builds a shareable URL', () => {
    const query = employeeQueryFromDraft(
      { q: '  minh  ', status: 'DISABLED' },
      {
        page: 5,
        pageSize: USER_ADMIN_PAGE_SIZE,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      },
    );
    expect(query.page).toBe(1);
    expect(buildEmployeeListHref(query)).toBe('/backoffice/employees?q=minh&status=DISABLED');
  });

  it('round-trips customer status, sort, search and pagination', () => {
    const parsed = customerQueryFromSearch(
      new URLSearchParams('q=lan&status=SUSPENDED&sort=lastLoginAt&page=2'),
    );
    expect(parsed).toMatchObject({
      page: 2,
      q: 'lan',
      sortBy: 'lastLoginAt',
      status: 'SUSPENDED',
    });
    expect(buildCustomerListHref(parsed)).toBe(
      '/backoffice/customers?q=lan&status=SUSPENDED&sort=lastLoginAt&page=2',
    );
  });

  it('normalizes an empty customer search and resets to the first page', () => {
    const next = customerQueryFromDraft(
      { q: '   ', sortBy: 'createdAt', status: '' },
      {
        page: 9,
        pageSize: USER_ADMIN_PAGE_SIZE,
        q: 'old',
        sortBy: 'lastLoginAt',
        sortOrder: 'asc',
        status: 'ACTIVE',
      },
    );
    expect(next).toEqual({
      page: 1,
      pageSize: USER_ADMIN_PAGE_SIZE,
      sortBy: 'createdAt',
      sortOrder: 'asc',
    });
    expect(buildCustomerListHref(next)).toBe('/backoffice/customers?order=asc');
  });
});
