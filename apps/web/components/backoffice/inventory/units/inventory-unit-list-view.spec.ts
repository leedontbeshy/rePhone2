import { describe, expect, it } from 'vitest';
import {
  buildInventoryUnitHref,
  looksLikeProtectedIdentifier,
  type InventoryUnitQueryState,
} from './inventory-unit-list-view';

const DEFAULT_QUERY: InventoryUnitQueryState = {
  page: 1,
  pageSize: 20,
  sortBy: 'receivedAt',
  sortOrder: 'desc',
};

describe('inventory unit list presenter', () => {
  it('builds a compact default URL and preserves explicit filters', () => {
    expect(buildInventoryUnitHref(DEFAULT_QUERY)).toBe('/backoffice/inventory/units');
    expect(
      buildInventoryUnitHref(DEFAULT_QUERY, {
        conditionGrade: 'B',
        lifecycleStatus: 'INSPECTING',
        locationId: 'store-1',
        page: 2,
        q: 'iphone 15',
      }),
    ).toBe(
      '/backoffice/inventory/units?q=iphone+15&lifecycleStatus=INSPECTING&locationId=store-1&conditionGrade=B&page=2',
    );
  });

  it('keeps raw device identifiers out of the list query', () => {
    expect(looksLikeProtectedIdentifier('356789012345678')).toBe(true);
    expect(looksLikeProtectedIdentifier('89049032000000000000000000000001')).toBe(true);
    expect(looksLikeProtectedIdentifier('F2LZQ1ABC123')).toBe(true);
    expect(looksLikeProtectedIdentifier('iPhone 15 Pro')).toBe(false);
    expect(looksLikeProtectedIdentifier('RPH-20260828-001')).toBe(false);
    expect(looksLikeProtectedIdentifier('5678')).toBe(false);
  });
});
