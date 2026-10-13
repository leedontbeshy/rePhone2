import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CatalogListView, clampCatalogPage, nextSuggestionIndex } from './catalog-list-view';

describe('bảng danh mục sản phẩm', () => {
  it('hiển thị danh sách gọn với nội dung tiếng Việt và liên kết chi tiết', () => {
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
        query={{ page: 1, pageSize: 6, sortBy: 'releaseYear', sortOrder: 'desc' }}
      />,
    );

    expect(markup).toContain('Danh mục sản phẩm');
    expect(markup).toContain('iPhone 16 Pro');
    expect(markup).toContain('Đang bán');
    expect(markup).toContain('/backoffice/catalog/products/product-1');
    expect(markup).not.toContain('>ACTIVE<');
    expect(markup).not.toContain('product-1</');
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-autocomplete="list"');
    expect(markup).toContain('Năm ra mắt mới nhất');
  });

  it('điều hướng vòng qua gợi ý bằng phím mũi tên', () => {
    expect(nextSuggestionIndex(-1, 3, 'ArrowDown')).toBe(0);
    expect(nextSuggestionIndex(2, 3, 'ArrowDown')).toBe(0);
    expect(nextSuggestionIndex(0, 3, 'ArrowUp')).toBe(2);
    expect(nextSuggestionIndex(-1, 0, 'ArrowDown')).toBe(-1);
  });

  it('giới hạn trang yêu cầu vào phạm vi kết quả hợp lệ', () => {
    expect(clampCatalogPage(8, 3)).toBe(3);
    expect(clampCatalogPage(0, 3)).toBe(1);
    expect(clampCatalogPage(2, 3)).toBe(2);
    expect(clampCatalogPage(4, 0)).toBe(1);
  });

  it('nói rõ khi đang giữ kết quả của bộ lọc trước sau lỗi tải', () => {
    const markup = renderToStaticMarkup(
      <CatalogListView
        counts={{ ACTIVE: 1, ARCHIVED: 0, DRAFT: 0, total: 1 }}
        error="Không thể tải danh mục sản phẩm."
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
        query={{ page: 1, pageSize: 6, sortBy: 'releaseYear', sortOrder: 'desc' }}
        showingPreviousResults
      />,
    );

    expect(markup).toContain('Danh sách bên dưới vẫn là kết quả của bộ lọc trước đó.');
    expect(markup).toContain('aria-label="Danh sách sản phẩm" tabindex="-1"');
    expect(markup).toContain('iPhone 16 Pro');
  });

  it('keeps loaded product links interactive while refreshing the list', () => {
    const markup = renderToStaticMarkup(
      <CatalogListView
        counts={{ ACTIVE: 1, ARCHIVED: 0, DRAFT: 0, total: 1 }}
        loading
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
        query={{ page: 1, pageSize: 6, sortBy: 'releaseYear', sortOrder: 'desc' }}
      />,
    );

    expect(markup).toContain('Đang cập nhật danh sách…');
    expect(markup).toContain('href="/backoffice/catalog/products/product-1"');
    expect(markup).not.toContain('data-updating');
    expect(markup).not.toContain('aria-disabled="true"');
  });
});
