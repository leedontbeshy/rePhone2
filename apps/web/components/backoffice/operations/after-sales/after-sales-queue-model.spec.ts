import { describe, expect, it } from 'vitest';
import {
  filtersFromParams,
  paramsFromFilters,
  queryFromParams,
  validateAfterSalesFilters,
  type AfterSalesFilterDraft,
} from './after-sales-queue-view';

describe('after-sales queue URL model', () => {
  it('uses the full selected local day for date filters', () => {
    const query = queryFromParams(
      new URLSearchParams('from=2026-08-01&to=2026-08-29&page=2&status=all'),
    );
    const from = new Date(query.createdFrom ?? '');
    const to = new Date(query.createdTo ?? '');

    expect([
      from.getFullYear(),
      from.getMonth() + 1,
      from.getDate(),
      from.getHours(),
      from.getMinutes(),
      from.getSeconds(),
      from.getMilliseconds(),
    ]).toEqual([2026, 8, 1, 0, 0, 0, 0]);
    expect([
      to.getFullYear(),
      to.getMonth() + 1,
      to.getDate(),
      to.getHours(),
      to.getMinutes(),
      to.getSeconds(),
      to.getMilliseconds(),
    ]).toEqual([2026, 8, 29, 23, 59, 59, 999]);
    expect(query.page).toBe(2);
    expect(query.status).toBeUndefined();
  });

  it('normalizes unsafe URL values instead of sending an invalid API query', () => {
    const longQuery = 'a'.repeat(300);
    const query = queryFromParams(
      new URLSearchParams(`q=${longQuery}&from=2026-02-30&to=not-a-date&page=1e2`),
    );

    expect(query.q).toHaveLength(255);
    expect(query.createdFrom).toBeUndefined();
    expect(query.createdTo).toBeUndefined();
    expect(query.page).toBe(1);
  });

  it('drops a reversed URL date range and reports reversed form input', () => {
    const filters = filtersFromParams(new URLSearchParams('from=2026-08-30&to=2026-08-29'));
    expect(filters.createdFrom).toBe('');
    expect(filters.createdTo).toBe('');

    const draft = filterDraft({ createdFrom: '2026-08-30', createdTo: '2026-08-29' });
    expect(validateAfterSalesFilters(draft)).toEqual({
      createdTo: 'Ngày kết thúc phải cùng hoặc sau ngày bắt đầu.',
    });
    expect(paramsFromFilters(draft, 1).has('from')).toBe(false);
    expect(paramsFromFilters(draft, 1).has('to')).toBe(false);
  });
});

function filterDraft(overrides: Partial<AfterSalesFilterDraft> = {}): AfterSalesFilterDraft {
  return {
    createdFrom: '',
    createdTo: '',
    q: '',
    sort: 'newest',
    status: '',
    type: '',
    ...overrides,
  };
}
