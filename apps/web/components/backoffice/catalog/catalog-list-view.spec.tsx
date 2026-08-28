import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CatalogListView } from './catalog-list-view';

describe('bảng danh mục sản phẩm', () => {
  it('hiển thị board hai cột với nội dung tiếng Việt và liên kết chi tiết', () => {
    const markup = renderToStaticMarkup(
      <CatalogListView
        counts={{ ACTIVE: 1, ARCHIVED: 0, DRAFT: 0, total: 1 }}
        pagination={{ page: 1, pageSize: 6, totalItems: 1, totalPages: 1 }}
        products={[
          {
            id: 'product-1',
            name: 'iPhone 16 Pro',
            primaryMedia: null,
            releaseYear: 2024,
            slug: 'iphone-16-pro',
            status: 'ACTIVE',
            type: 'IPHONE',
            updatedAt: '2026-08-28T07:20:00.000Z',
            variantCount: 4,
          },
        ]}
        query={{ page: 1, pageSize: 6, sortBy: 'updatedAt', sortOrder: 'desc' }}
      />,
    );

    expect(markup).toContain('Danh mục sản phẩm');
    expect(markup).toContain('iPhone 16 Pro');
    expect(markup).toContain('Đang bán');
    expect(markup).toContain('/backoffice/catalog/products/product-1');
    expect(markup).not.toContain('>ACTIVE<');
    expect(markup).not.toContain('product-1</');
  });
});
