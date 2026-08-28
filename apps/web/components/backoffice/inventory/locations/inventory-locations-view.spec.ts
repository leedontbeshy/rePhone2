import { describe, expect, it } from 'vitest';
import { locationTypeLabel } from './inventory-locations-view';

describe('inventory locations presenter', () => {
  it('uses staff-facing Vietnamese labels', () => {
    expect(locationTypeLabel('STORE')).toBe('Cửa hàng');
    expect(locationTypeLabel('WAREHOUSE')).toBe('Kho trung tâm');
  });
});
