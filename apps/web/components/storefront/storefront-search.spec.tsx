import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { nextStorefrontSuggestionIndex, StorefrontSearch } from './storefront-search';

describe('tìm kiếm cửa hàng', () => {
  it('giữ form GET hoạt động khi JavaScript chưa tải', () => {
    const markup = renderToStaticMarkup(
      <StorefrontSearch id="storefront-search-test" variant="desktop" />,
    );

    expect(markup).toContain('action="/products"');
    expect(markup).toContain('method="get"');
    expect(markup).toContain('name="q"');
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-autocomplete="list"');
    expect(markup).toContain('Tìm iPhone hoặc phụ kiện');
  });

  it('điều hướng vòng qua danh sách gợi ý', () => {
    expect(nextStorefrontSuggestionIndex(-1, 3, 'ArrowDown')).toBe(0);
    expect(nextStorefrontSuggestionIndex(2, 3, 'ArrowDown')).toBe(0);
    expect(nextStorefrontSuggestionIndex(0, 3, 'ArrowUp')).toBe(2);
    expect(nextStorefrontSuggestionIndex(-1, 0, 'ArrowDown')).toBe(-1);
  });
});
