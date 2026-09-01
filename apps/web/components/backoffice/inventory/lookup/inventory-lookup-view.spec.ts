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
    const notFound = Object.assign(new Error('Dữ liệu không tồn tại.'), {
      code: 'RESOURCE_NOT_FOUND',
    });
    const message = lookupErrorMessage('IMEI', notFound);

    expect(message).toBe('IMEI chưa khớp với máy nào. Hãy kiểm tra lại mã đã nhập.');
    expect(message).not.toContain('490154203237518');
  });

  it('keeps provider and network failures distinct from an invalid identifier', () => {
    expect(lookupErrorMessage('SERIAL', new Error('Không thể kết nối tới rePhone.'))).toBe(
      'Không thể kết nối tới rePhone.',
    );
  });
});
