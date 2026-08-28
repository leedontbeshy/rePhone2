import { describe, expect, it } from 'vitest';
import {
  buildInventoryUnitHref,
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
});
