import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProductListItem } from '@/lib/catalog-api';
import { Home } from './home';

function product(name: string, overrides: Partial<ProductListItem> = {}): ProductListItem {
  const slug = name.toLowerCase().replaceAll(' ', '-');
  return {
    brand: 'Apple',
    colorOptions: [],
    storageOptions: [],
    coverMedia: {
      altText: `Ảnh minh họa ${name}`,
      width: 800,
      height: 800,
      url: `https://example.test/${slug}.webp`,
    },
    id: slug,
    slug,
    name,
    inStock: true,
    price: { fromPrice: '12500000' },
    productType: 'IPHONE',
    ...overrides,
  };
}

describe('storefront home v2', () => {
  it('shows 18/17/16 campaigns, stock before model families, and generations without hiding navigation', () => {
    const products = [
      product('iPhone 17'),
      product('iPhone 16'),
      product('iPhone 15'),
      product('iPhone 15 Pro', { inStock: false, price: { fromPrice: '99999999' } }),
      product('iPhone 13'),
    ];
    const markup = renderToStaticMarkup(<Home products={products} catalogUnavailable={false} />);
    expect(markup).toContain('<h1>Chọn iPhone phù hợp với bạn</h1>');
    expect(markup).toContain('aria-label="Dòng iPhone nổi bật"');
    expect(markup).toContain('aria-label="Chọn thế hệ iPhone"');
    expect(markup).toContain('model-iphone-18-studio.webp');
    expect(markup).not.toContain('model-iphone-15-studio.webp');
    expect(markup.indexOf('id="available-units-title"')).toBeLessThan(
      markup.indexOf('id="iphone-models"'),
    );
    const families = markup.slice(markup.indexOf('id="iphone-models"'));
    for (const item of products.filter((item) => item.slug !== 'iphone-13')) {
      expect(families.match(new RegExp(`href="/products/${item.slug}"`, 'g'))).toHaveLength(1);
    }
    expect(families).not.toContain('href="/products/iphone-13"');
    for (const generation of [18, 17, 16, 15, 14, 13, 12])
      expect(markup).toContain(`>iPhone ${String(generation)}</a>`);
    expect(markup).toContain('>Khác</a>');
    expect(markup).toContain('12.500.000');
    expect(markup).toContain('Tạm hết máy');
    expect(markup).not.toContain('99.999.999');
    expect(markup).toContain('Ảnh thật từng máy');
    expect(markup).not.toContain('36 bước');
    expect(markup).not.toContain('đã bao gồm VAT');
  });

  it('renders a selected generation from the URL with all of its model choices', () => {
    const markup = renderToStaticMarkup(
      <Home
        products={[
          product('iPhone 17'),
          product('iPhone 16'),
          product('iPhone 15'),
          product('iPhone 15 Pro'),
        ]}
        catalogUnavailable={false}
        generation="iphone-15"
      />,
    );
    expect(markup).toContain('href="/?generation=iphone-15#iphone-models"');
    expect(markup).toMatch(/<a[^>]*aria-current="page"[^>]*>iPhone 15<\/a>/);
    expect(markup).toContain('id="iphone-15-title">iPhone 15');
    const grid = markup.slice(markup.indexOf('id="iphone-models"'));
    expect(grid).toContain('href="/products/iphone-15"');
    expect(grid).toContain('href="/products/iphone-15-pro"');
    expect(grid).not.toContain('href="/products/iphone-16"');
  });

  it('keeps useful server-rendered provider-failure and empty states', () => {
    const unavailable = renderToStaticMarkup(<Home products={[]} catalogUnavailable />);
    expect(unavailable).toContain('Danh mục đang tạm gián đoạn');
    expect(unavailable).toContain('href="/"');
    expect(unavailable).toContain('Khám phá dòng máy');
    expect(unavailable).not.toContain('Giá từ');
    const empty = renderToStaticMarkup(<Home products={[]} catalogUnavailable={false} />);
    expect(empty).toContain('Chưa có dòng iPhone nào');
    expect(empty).not.toContain('Tạm hết máy');
  });
});
