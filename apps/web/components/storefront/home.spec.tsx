import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProductListItem } from '@/lib/catalog-api';
import { Home } from './home';

const product = {
  brand: 'Apple',
  colorOptions: ['Blue'],
  coverMedia: {
    altText: 'Ảnh tham khảo iPhone 13 màu xanh',
    height: 800,
    url: 'https://example.test/iphone-13.webp',
    width: 800,
  },
  id: '11111111-1111-4111-8111-111111111111',
  inStock: true,
  name: 'iPhone 13',
  price: { fromPrice: '12500000' },
  productType: 'IPHONE',
  releaseYear: 2021,
  slug: 'iphone-13',
  storageOptions: [128, 256],
} satisfies ProductListItem;

const soldOutProduct = {
  ...product,
  id: '22222222-2222-4222-8222-222222222222',
  inStock: false,
  name: 'iPhone 15 Pro',
  price: {},
  releaseYear: 2023,
  slug: 'iphone-15-pro',
} satisfies ProductListItem;

describe('FE-1 storefront home', () => {
  it('renders generation shelves with authoritative price and sold-out states', () => {
    const markup = renderToStaticMarkup(
      <Home products={[product, soldOutProduct]} catalogUnavailable={false} />,
    );

    expect(markup).toContain('<h1>Chọn iPhone phù hợp với bạn</h1>');
    expect(markup).toContain('<h2 id="iphone-15-heading">iPhone 15</h2>');
    expect(markup).toContain('<h2 id="iphone-13-heading">iPhone 13</h2>');
    expect(markup).toContain('href="/products/iphone-13"');
    expect(markup).toContain('href="/products/iphone-15-pro"');
    expect(markup).toContain('12.500.000');
    expect(markup).toContain('Tạm hết máy');
    expect(markup).toContain('Ảnh thật từng máy');
    expect(markup).not.toContain('36 bước');
    expect(markup).not.toContain('đã bao gồm VAT');
  });

  it('keeps a useful server-rendered state when the catalog provider fails', () => {
    const markup = renderToStaticMarkup(<Home products={[]} catalogUnavailable />);

    expect(markup).toContain('Danh mục đang tạm gián đoạn');
    expect(markup).toContain('href="/"');
  });
});
