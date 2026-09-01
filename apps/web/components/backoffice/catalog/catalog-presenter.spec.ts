import { describe, expect, it } from 'vitest';
import {
  buildCatalogListHref,
  catalogDisplayCode,
  catalogProductInputFromDraft,
  catalogQueryFromSearchParams,
  EMPTY_PRODUCT_DRAFT,
  slugFromProductName,
  validateCatalogProductDraft,
} from './catalog-presenter';
import {
  catalogPublishReadiness,
  validateCatalogMediaFile,
  type CatalogProductDetailRecord,
} from './catalog-detail-view';

describe('trình bày danh mục FE-05', () => {
  it('chuẩn hóa bộ lọc và giữ liên kết phân trang ổn định', () => {
    const query = catalogQueryFromSearchParams({
      page: '2',
      q: ' iPhone 15 ',
      status: 'ACTIVE',
      type: 'IPHONE',
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expect(query).toMatchObject({
      page: 2,
      q: 'iPhone 15',
      status: 'ACTIVE',
      type: 'IPHONE',
      sortBy: 'name',
      sortOrder: 'asc',
    });
    expect(buildCatalogListHref(query, { page: 1, status: undefined })).toBe(
      '/backoffice/catalog/products?q=iPhone+15&type=IPHONE&sortBy=name&sortOrder=asc',
    );
  });

  it('ưu tiên đời máy mới nhất khi đường dẫn không chọn cách sắp xếp', () => {
    const query = catalogQueryFromSearchParams({});

    expect(query).toMatchObject({
      page: 1,
      sortBy: 'releaseYear',
      sortOrder: 'desc',
    });
    expect(buildCatalogListHref(query, {})).toBe('/backoffice/catalog/products');
    expect(buildCatalogListHref(query, { sortBy: 'updatedAt' })).toBe(
      '/backoffice/catalog/products?sortBy=updatedAt',
    );
  });

  it('tạo đường dẫn và mã hiển thị từ tên mà không lộ mã nội bộ', () => {
    expect(slugFromProductName('Ốp lưng MagSafe Đen')).toBe('op-lung-magsafe-den');
    expect(catalogDisplayCode('iphone-16-pro')).toBe('IPHONE-16-PRO');
  });

  it('kiểm tra form có kiểu và bỏ thông số điện thoại khỏi phụ kiện', () => {
    const accessoryDraft = {
      ...EMPTY_PRODUCT_DRAFT,
      type: 'ACCESSORY' as const,
      name: 'Cáp USB-C',
      slug: 'cap-usb-c',
      description: 'Cáp sạc bền, phù hợp thiết bị Apple.',
      warrantyPolicyId: 'policy-1',
      chipset: 'Không dùng',
      ramGb: '8',
      releaseYear: '2025',
      screenSizeInches: '6.1',
    };

    expect(validateCatalogProductDraft(accessoryDraft)).toEqual([]);
    expect(catalogProductInputFromDraft(accessoryDraft)).not.toHaveProperty('chipset');
    expect(catalogProductInputFromDraft(accessoryDraft)).not.toHaveProperty('ramGb');
  });

  it('chỉ dùng điều kiện nghiệp vụ thật để mở bán sản phẩm', () => {
    const product = productFixture({ media: [] });
    expect(catalogPublishReadiness(product)).toMatchObject({
      hasActiveVariant: true,
      hasMedia: false,
      hasWarranty: true,
      ready: true,
    });
  });

  it('chặn đúng loại và kích thước ảnh trước khi tải lên', () => {
    expect(validateCatalogMediaFile({ size: 100, type: 'image/jpeg' })).toBeNull();
    expect(validateCatalogMediaFile({ size: 0, type: 'image/jpeg' })).toContain('trống');
    expect(validateCatalogMediaFile({ size: 100, type: 'image/svg+xml' })).toContain('JPEG');
    expect(validateCatalogMediaFile({ size: 8 * 1024 * 1024 + 1, type: 'image/png' })).toContain(
      '8 MB',
    );
  });
});

function productFixture(
  overrides: Partial<CatalogProductDetailRecord> = {},
): CatalogProductDetailRecord {
  return {
    brand: 'Apple',
    id: 'product-1',
    media: [{ id: 'media-1', url: '/iphone.webp', altText: 'iPhone', sortOrder: 0 }],
    name: 'iPhone 16 Pro',
    primaryMedia: null,
    slug: 'iphone-16-pro',
    status: 'DRAFT',
    type: 'IPHONE',
    updatedAt: '2026-08-28T07:20:00.000Z',
    variants: [
      {
        attributes: [],
        displayName: '256 GB · Titan tự nhiên',
        id: 'variant-1',
        inventoryMode: 'SERIALIZED',
        media: [],
        sku: 'IP16P-256-TN',
        status: 'ACTIVE',
        storageCapacityGb: 256,
      },
    ],
    warrantyPolicyId: 'policy-1',
    ...overrides,
  };
}
