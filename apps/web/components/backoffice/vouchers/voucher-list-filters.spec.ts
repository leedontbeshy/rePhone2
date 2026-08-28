import { describe, expect, it } from 'vitest';
import {
  buildVoucherListHref,
  voucherDraftFromQuery,
  voucherFilterDraftsEqual,
  voucherQueriesEqual,
  voucherQueryFromDraft,
  voucherQueryFromSearch,
} from './voucher-list-filters';

describe('voucher list filters', () => {
  it('normalizes supported query values and rejects invalid filters', () => {
    const params = new URLSearchParams(
      'q=%20iphone%20&status=ACTIVE&discountType=PERCENT&scopeType=PRODUCTS&page=3',
    );

    expect(voucherQueryFromSearch(params)).toEqual({
      discountType: 'PERCENT',
      page: 3,
      pageSize: 12,
      q: 'iphone',
      scopeType: 'PRODUCTS',
      status: 'ACTIVE',
    });
    expect(voucherQueryFromSearch(new URLSearchParams('status=UNKNOWN&page=-2'))).toEqual({
      page: 1,
      pageSize: 12,
    });
  });

  it('builds a stable URL and resets the requested page through the draft conversion', () => {
    const draft = voucherDraftFromQuery({
      page: 5,
      pageSize: 12,
      q: '  tháng 9  ',
      scopeType: 'ORDER',
      status: 'DRAFT',
    });

    expect(voucherQueryFromDraft(draft)).toEqual({
      page: 1,
      pageSize: 12,
      q: 'tháng 9',
      scopeType: 'ORDER',
      status: 'DRAFT',
    });
    expect(buildVoucherListHref('/backoffice/vouchers', { ...draft, page: 2 })).toBe(
      '/backoffice/vouchers?q=th%C3%A1ng+9&status=DRAFT&scopeType=ORDER&page=2',
    );
  });

  it('compares normalized queries and filter drafts by value', () => {
    const query = voucherQueryFromSearch(
      new URLSearchParams('q=iphone&status=ACTIVE&scopeType=PRODUCTS&page=2'),
    );
    const sameQuery = { ...query };
    const draft = voucherDraftFromQuery(query);

    expect(voucherQueriesEqual(query, sameQuery)).toBe(true);
    expect(voucherQueriesEqual(query, { ...sameQuery, page: 3 })).toBe(false);
    expect(voucherFilterDraftsEqual(draft, { ...draft })).toBe(true);
    expect(voucherFilterDraftsEqual(draft, { ...draft, q: 'phụ kiện' })).toBe(false);
  });
});
