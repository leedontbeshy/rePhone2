import { describe, expect, it } from 'vitest';
import {
  identifierTypeLabel,
  validateInventoryLookupInput,
} from './inventory-lookup-view';

describe('inventory identifier lookup', () => {
  it('validates identifier shapes without persisting values', () => {
    expect(
      validateInventoryLookupInput({
        identifier: '123',
        identifierType: 'IMEI_1',
        reason: 'Hỗ trợ khách tại cửa hàng',
      }),
    ).toEqual({ identifier: 'IMEI cần có đúng 15 chữ số.' });

    expect(
      validateInventoryLookupInput({
        identifier: '490154203237518',
        identifierType: 'IMEI_1',
        reason: 'Kiểm tra máy đổi trả',
      }),
    ).toEqual({});
  });

  it('requires a meaningful audit reason and uses Vietnamese labels', () => {
    expect(
      validateInventoryLookupInput({
        identifier: 'F2LX1234ABCD',
        identifierType: 'SERIAL',
        reason: 'x',
      }),
    ).toEqual({ reason: 'Lý do cần ít nhất 5 ký tự.' });
    expect(identifierTypeLabel('SERIAL')).toBe('Số sê-ri');
  });
});
