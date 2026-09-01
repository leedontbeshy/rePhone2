import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CatalogDetailView, type CatalogProductDetailRecord } from './catalog-detail-view';

describe('quản lý hình ảnh biến thể', () => {
  it('hiển thị đầy đủ ảnh biến thể cùng thao tác sửa và xóa', () => {
    const markup = renderToStaticMarkup(
      <CatalogDetailView
        product={product()}
        warranties={[]}
        onActivateVariant={vi.fn()}
        onArchiveProduct={vi.fn()}
        onArchiveVariant={vi.fn()}
        onCreateVariant={vi.fn()}
        onDeleteMedia={vi.fn()}
        onPublish={vi.fn()}
        onUpdateMedia={vi.fn()}
        onUpdateProduct={vi.fn()}
        onUpdateVariant={vi.fn()}
        onUploadMedia={vi.fn()}
      />,
    );

    expect(markup).toContain('Ảnh mặt trước');
    expect(markup).toContain('Ảnh mặt sau');
    expect(markup).toContain('aria-label="Hình ảnh 256 GB · Đen"');
    expect(markup.match(/>Sửa<\/button>/g)).toHaveLength(2);
    expect(markup.match(/>Xóa<\/button>/g)).toHaveLength(2);
  });
});

function product(): CatalogProductDetailRecord {
  return {
    brand: 'Apple',
    chipset: 'A17 Pro',
    description: 'Sản phẩm thử nghiệm',
    id: 'product-1',
    media: [],
    name: 'iPhone 15 Pro',
    primaryMedia: null,
    ramGb: 8,
    releaseYear: 2023,
    screenSizeInches: '6.1',
    seoDescription: null,
    seoTitle: null,
    slug: 'iphone-15-pro',
    status: 'DRAFT',
    type: 'IPHONE',
    updatedAt: '2026-09-02T00:00:00.000Z',
    variants: [
      {
        attributes: [],
        colorHex: '#111111',
        colorName: 'Đen',
        compareAtPrice: null,
        displayName: '256 GB · Đen',
        id: 'variant-1',
        inventoryMode: 'SERIALIZED',
        media: [
          { id: 'media-1', url: 'https://cdn.test/front.webp', altText: 'Ảnh mặt trước', sortOrder: 0 },
          { id: 'media-2', url: 'https://cdn.test/back.webp', altText: 'Ảnh mặt sau', sortOrder: 5 },
        ],
        salePrice: null,
        sku: 'IP15P-256-BLK',
        status: 'DRAFT',
        storageCapacityGb: 256,
        warrantyPolicyId: null,
      },
    ],
    warrantyPolicyId: 'policy-1',
  };
}
