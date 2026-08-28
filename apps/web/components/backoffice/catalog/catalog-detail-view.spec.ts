import { describe, expect, it } from 'vitest';
import {
  variantDraftFrom,
  variantInputFromDraft,
  type CatalogVariantRecord,
  type VariantDraft,
} from './catalog-detail-view';

describe('biểu mẫu biến thể sản phẩm', () => {
  it('chuẩn hóa giá, màu và các thông số của phụ kiện', () => {
    const input = variantInputFromDraft(
      draft({
        attributes: [
          { name: ' Tương thích ', value: ' iPhone 15 trở lên ' },
          { name: '', value: '' },
        ],
        colorHex: '#abcdef',
        colorName: 'Trong suốt',
        compareAtPrice: '690000',
        salePrice: '590000',
      }),
      'ACCESSORY',
    );

    expect(input).toEqual({
      attributes: [{ name: 'Tương thích', value: 'iPhone 15 trở lên' }],
      colorHex: '#ABCDEF',
      colorName: 'Trong suốt',
      compareAtPrice: '690000',
      displayName: 'Phiên bản thử nghiệm',
      salePrice: '590000',
      sku: 'TEST-SKU',
    });
  });

  it('không nhận thông số thiếu giá trị hoặc bị trùng tên', () => {
    const missingValue = variantInputFromDraft(
      draft({ attributes: [{ name: 'Chất liệu', value: '' }], salePrice: '590000' }),
      'ACCESSORY',
    );
    const duplicateName = variantInputFromDraft(
      draft({
        attributes: [
          { name: 'Tương thích', value: 'iPhone 15' },
          { name: 'tương thích', value: 'iPhone 16' },
        ],
        salePrice: '590000',
      }),
      'ACCESSORY',
    );

    expect(missingValue).toBeInstanceOf(Error);
    expect((missingValue as Error).message).toContain('đủ tên và giá trị');
    expect(duplicateName).toBeInstanceOf(Error);
    expect((duplicateName as Error).message).toContain('không được trùng');
  });

  it('cho phép biến thể quay về chính sách bảo hành chung của sản phẩm', () => {
    const existing = variant({ warrantyPolicyId: 'policy-1' });
    const input = variantInputFromDraft(
      { ...variantDraftFrom(existing), warrantyPolicyId: '' },
      'IPHONE',
      existing,
    );

    expect(input).not.toBeInstanceOf(Error);
    expect(input).toMatchObject({ warrantyPolicyId: null });
  });

  it('xóa được giá niêm yết và màu tùy chọn khi chỉnh sửa phụ kiện', () => {
    const existing = variant({
      colorHex: '#FFFFFF',
      colorName: 'Trắng',
      compareAtPrice: '690000',
      inventoryMode: 'QUANTITY',
      salePrice: '590000',
    });
    const input = variantInputFromDraft(
      {
        ...variantDraftFrom(existing),
        colorHex: '',
        colorName: '',
        compareAtPrice: '',
      },
      'ACCESSORY',
      existing,
    );

    expect(input).not.toBeInstanceOf(Error);
    expect(input).toMatchObject({
      colorHex: null,
      colorName: null,
      compareAtPrice: null,
      salePrice: '590000',
    });
  });

  it('không gửi thông tin giá hoặc thuộc tính phụ kiện cho iPhone', () => {
    const input = variantInputFromDraft(
      draft({
        attributes: [{ name: 'Chất liệu', value: 'Titan' }],
        colorHex: '#112233',
        colorName: 'Đen',
        compareAtPrice: '999000',
        salePrice: '599000',
        storageCapacityGb: '256',
      }),
      'IPHONE',
    );

    expect(input).toEqual({
      colorHex: '#112233',
      colorName: 'Đen',
      displayName: 'Phiên bản thử nghiệm',
      sku: 'TEST-SKU',
      storageCapacityGb: 256,
    });
  });
});

function draft(overrides: Partial<VariantDraft> = {}): VariantDraft {
  return {
    attributes: [{ name: '', value: '' }],
    colorHex: '',
    colorName: '',
    compareAtPrice: '',
    displayName: 'Phiên bản thử nghiệm',
    salePrice: '',
    sku: 'test-sku',
    storageCapacityGb: '',
    warrantyPolicyId: '',
    ...overrides,
  };
}

function variant(overrides: Partial<CatalogVariantRecord> = {}): CatalogVariantRecord {
  return {
    attributes: [],
    colorHex: '#112233',
    colorName: 'Đen',
    compareAtPrice: null,
    displayName: '256 GB Đen',
    id: 'variant-1',
    inventoryMode: 'SERIALIZED',
    media: [],
    salePrice: null,
    sku: 'TEST-SKU',
    status: 'DRAFT',
    storageCapacityGb: 256,
    warrantyPolicyId: null,
    ...overrides,
  };
}
