import { describe, expect, it } from 'vitest';
import {
  firstInventoryIntakeErrorField,
  inventoryIntakeProductForSelection,
  inventoryIntakeProductSelection,
  inventoryIntakeErrorItems,
  inventoryIntakeServerFieldErrors,
  inventoryIntakeVariantIsSelectable,
  normalizedInventoryIdentifiers,
  validateInventoryIntakeDraft,
  type InventoryIntakeDraft,
} from './intake-form-model';

const VALID_DRAFT: InventoryIntakeDraft = {
  productId: 'product-1',
  variantId: 'variant-1',
  locationId: 'location-1',
  imei1: '490154203237518',
  imei2: '',
  serial: '',
  eid: '',
  salePrice: '12000000',
  compareAtPrice: '13000000',
  modelNumber: 'A3102',
  regionCode: 'VN/A',
  simLockStatus: 'UNLOCKED',
  carrierName: '',
  simConfiguration: 'PHYSICAL_AND_ESIM',
  warrantyDaysOverride: '365',
};

describe('inventory intake validation', () => {
  it('accepts a complete intake draft without changing its values', () => {
    const draft = { ...VALID_DRAFT };

    expect(validateInventoryIntakeDraft(draft)).toEqual({});
    expect(draft).toEqual(VALID_DRAFT);
  });

  it('blocks an old product variant when loading the newly selected product fails', () => {
    const productA = {
      id: 'product-a',
      variants: [{ id: 'variant-a' }],
    };
    const switchedDraft = {
      ...VALID_DRAFT,
      ...inventoryIntakeProductSelection('product-b'),
    };

    const productAfterProductBFailure = inventoryIntakeProductForSelection(
      productA,
      switchedDraft.productId,
    );
    const selectableVariants = productAfterProductBFailure?.variants ?? [];

    expect(switchedDraft).toMatchObject({ productId: 'product-b', variantId: '' });
    expect(selectableVariants).toEqual([]);
    expect(inventoryIntakeVariantIsSelectable(selectableVariants, 'variant-a')).toBe(false);
    expect(validateInventoryIntakeDraft(switchedDraft).variantId).toBe('Hãy chọn cấu hình máy.');
  });

  it('returns a precise message for every invalid field', () => {
    const errors = validateInventoryIntakeDraft({
      ...VALID_DRAFT,
      productId: '',
      variantId: '',
      locationId: '',
      imei1: '123',
      imei2: '456',
      serial: 'A!',
      eid: '1234',
      salePrice: '12 triệu',
      compareAtPrice: '10 triệu',
      simLockStatus: 'CARRIER_LOCKED',
      carrierName: ' ',
      simConfiguration: 'invalid',
      warrantyDaysOverride: '365.5',
    });

    expect(errors).toMatchObject({
      productId: 'Hãy chọn dòng iPhone.',
      variantId: 'Hãy chọn cấu hình máy.',
      locationId: 'Hãy chọn địa điểm nhận máy.',
      imei1: 'IMEI chính phải gồm 15 chữ số hợp lệ.',
      imei2: 'IMEI phụ phải gồm 15 chữ số hợp lệ.',
      serial: 'Số sê-ri phải gồm 6–32 chữ cái hoặc chữ số.',
      eid: 'EID phải gồm đúng 32 chữ số.',
      salePrice: 'Giá bán phải gồm tối đa 15 chữ số.',
      compareAtPrice: 'Giá niêm yết phải gồm tối đa 15 chữ số.',
      carrierName: 'Hãy nhập tên nhà mạng đang khóa máy.',
      simConfiguration: 'Hãy chọn cấu hình SIM.',
      warrantyDaysOverride: 'Số ngày bảo hành phải là số nguyên.',
    });
  });

  it('validates cross-field identifier and price rules', () => {
    const missingIdentifier = validateInventoryIntakeDraft({
      ...VALID_DRAFT,
      imei1: '',
      serial: '',
    });
    const duplicateImei = validateInventoryIntakeDraft({
      ...VALID_DRAFT,
      imei2: VALID_DRAFT.imei1,
    });
    const lowComparePrice = validateInventoryIntakeDraft({
      ...VALID_DRAFT,
      compareAtPrice: '11999999',
    });

    expect(missingIdentifier.imei1).toBe('Nhập IMEI chính hoặc số sê-ri để nhận diện máy.');
    expect(duplicateImei.imei2).toBe('IMEI phụ phải khác IMEI chính.');
    expect(lowComparePrice.compareAtPrice).toBe('Giá niêm yết phải lớn hơn hoặc bằng giá bán.');
  });

  it('submits identifiers in the same normalized form that passed validation', () => {
    expect(
      normalizedInventoryIdentifiers({
        eid: '8904 9003 2000 0000 0000 0000 0000 0001',
        imei1: '49015-420-3237-518',
        imei2: '35 2099 0017 6132 9',
        serial: ' f2 lx 9a0 abc12 ',
      }),
    ).toEqual({
      eid: '89049003200000000000000000000001',
      imei1: '490154203237518',
      imei2: '352099001761329',
      serial: 'F2LX9A0ABC12',
    });
  });

  it('maps server validation details back to supported form fields', () => {
    const errors = inventoryIntakeServerFieldErrors(
      {
        error: {
          code: 'VALIDATION_FAILED',
          details: [
            { field: 'compareAtPrice', code: 'COMPARE_AT_PRICE_TOO_LOW' },
            { field: 'carrierName', code: 'CARRIER_REQUIRED' },
            { field: 'identifiers', code: 'INVALID_EID' },
          ],
        },
      },
      { ...VALID_DRAFT, eid: '1234', simLockStatus: 'CARRIER_LOCKED' },
    );

    expect(errors).toEqual({
      carrierName: 'Hãy nhập tên nhà mạng đang khóa máy.',
      compareAtPrice: 'Giá niêm yết phải lớn hơn hoặc bằng giá bán.',
      eid: 'EID phải gồm đúng 32 chữ số.',
    });
  });

  it('orders the summary and first focus target by the visual form order', () => {
    const errors = {
      warrantyDaysOverride: 'Bảo hành sai.',
      salePrice: 'Giá bán sai.',
      variantId: 'Cấu hình sai.',
    };

    expect(firstInventoryIntakeErrorField(errors)).toBe('variantId');
    expect(inventoryIntakeErrorItems(errors)).toEqual([
      { href: '#intake-variantId', message: 'Cấu hình sai.' },
      { href: '#intake-salePrice', message: 'Giá bán sai.' },
      { href: '#intake-warrantyDaysOverride', message: 'Bảo hành sai.' },
    ]);
  });
});
