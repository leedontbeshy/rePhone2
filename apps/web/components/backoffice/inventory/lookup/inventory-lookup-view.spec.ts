import { describe, expect, it } from 'vitest';
import { identifierTypeLabel, validateInventoryLookupInput } from './inventory-lookup-view';

describe('inventory identifier lookup', () => {
  it('validates identifier shapes without persisting values', () => {
    expect(
      validateInventoryLookupInput({
        identifier: '123',
        identifierType: 'IMEI',
      }),
    ).toEqual({ identifier: 'IMEI cần có đúng 15 chữ số.' });

    expect(
      validateInventoryLookupInput({
        identifier: '490154203237518',
        identifierType: 'IMEI',
      }),
    ).toEqual({});
  });

  it('uses Vietnamese labels without asking for an audit reason', () => {
    expect(
      validateInventoryLookupInput({
        identifier: 'F2LX1234ABCD',
        identifierType: 'SERIAL',
      }),
    ).toEqual({});
    expect(identifierTypeLabel('SERIAL')).toBe('Số sê-ri');
  });
});
