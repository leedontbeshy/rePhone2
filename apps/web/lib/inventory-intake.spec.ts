import { describe, expect, it } from 'vitest';
import {
  allPassChecklist,
  checklistFromApi,
  checklistPayload,
  IPHONE_CHECKLIST_V1,
} from './inventory-intake';

describe('inventory intake checklist', () => {
  it('builds the exact 18-check PASSED helper payload', () => {
    const payload = checklistPayload(allPassChecklist());
    expect(Object.keys(payload.items)).toHaveLength(18);
    expect(Object.keys(payload.items)).toEqual(IPHONE_CHECKLIST_V1.map(([key]) => key));
    expect(payload.items.DISPLAY).toEqual({ status: 'PASS', note: null });
  });

  it('restores supported API values without trusting malformed entries', () => {
    const restored = checklistFromApi({
      schemaVersion: 1,
      items: {
        DISPLAY: { status: 'DEGRADED', note: 'Ám nhẹ' },
        TOUCHSCREEN: { status: 'INVALID' },
      },
    });
    expect(restored.DISPLAY).toEqual({ status: 'DEGRADED', note: 'Ám nhẹ' });
    expect(restored.TOUCHSCREEN.status).toBe('PASS');
  });
});
