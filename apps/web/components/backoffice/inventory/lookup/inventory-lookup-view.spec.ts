import { describe, expect, it } from 'vitest';
import {
  createInventoryLookupRequestGate,
  identifierTypeLabel,
  lookupErrorMessage,
  validateInventoryLookupInput,
} from './inventory-lookup-view';

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

  it('rejects a response after the lookup input or page session changes', () => {
    const gate = createInventoryLookupRequestGate();
    const first = gate.begin();
    gate.invalidate();
    const second = gate.begin();

    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
  });

  it('identifies the invalid field and reason without echoing the submitted value', () => {
    const message = lookupErrorMessage('IMEI', new Error('Kiểm tra định dạng rồi thử lại.'));

    expect(message).toBe('IMEI chưa khớp với máy nào. Kiểm tra định dạng rồi thử lại.');
    expect(message).not.toContain('490154203237518');
  });
});
