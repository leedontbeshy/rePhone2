import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CatalogProductForm } from './catalog-product-form';
import { catalogFormChanged, catalogInternalNavigationTarget } from './use-unsaved-catalog-changes';

describe('bảo vệ thay đổi sản phẩm chưa lưu', () => {
  it('chỉ đánh dấu bẩn khi một trường thực sự thay đổi', () => {
    const baseline = { name: 'iPhone 17', releaseYear: '2025', slug: 'iphone-17' };

    expect(catalogFormChanged(baseline, { ...baseline })).toBe(false);
    expect(catalogFormChanged(baseline, { ...baseline, name: 'iPhone 17 Pro' })).toBe(true);
    expect(catalogFormChanged(baseline, { ...baseline, chipset: 'A19' })).toBe(true);
  });

  it('trở về sạch khi dữ liệu khớp lại bản gốc hoặc bản authoritative mới', () => {
    const edited = { name: 'iPhone 17 Pro', slug: 'iphone-17-pro' };
    const authoritative = { ...edited };

    expect(catalogFormChanged({ name: 'iPhone 17', slug: 'iphone-17' }, edited)).toBe(true);
    expect(catalogFormChanged(authoritative, edited)).toBe(false);
  });

  it('dùng hộp thoại xác nhận riêng cho hành động bỏ form tạo sản phẩm', () => {
    const markup = renderToStaticMarkup(
      <CatalogProductForm
        onCancel={() => undefined}
        onNavigateAway={() => undefined}
        onSubmit={() => undefined}
        warranties={[]}
      />,
    );

    expect(markup).toContain('type="button">Hủy</button>');
    expect(markup).toContain('Bỏ các thay đổi chưa lưu?');
    expect(markup).toContain('Tiếp tục chỉnh sửa');
    expect(markup).not.toContain('href="/backoffice/catalog/products"');
  });

  it('chỉ chặn liên kết nội bộ thực sự rời khỏi màn hình hiện tại', () => {
    const current = 'https://rephone.vn/backoffice/catalog/products/new';

    expect(catalogInternalNavigationTarget('/backoffice/catalog/products', current)).toBe(
      '/backoffice/catalog/products',
    );
    expect(catalogInternalNavigationTarget(current, current)).toBeNull();
    expect(catalogInternalNavigationTarget('https://example.com', current)).toBeNull();
  });
});
