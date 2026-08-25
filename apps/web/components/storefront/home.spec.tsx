import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProductListItem } from '@/lib/catalog-api';
import type { PublicStore } from '@/lib/public-store-api';
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

const store = {
  currency: 'VND',
  pickup: {
    address: '123 Nguyễn Văn A, TP.HCM',
    holdMinutes: 120,
    locationName: 'rePhone Quận 1',
  },
  storeAddress: '123 Nguyễn Văn A, TP.HCM',
  storeName: 'rePhone',
  storePhone: '0901 234 567',
  timezone: 'Asia/Ho_Chi_Minh',
} satisfies PublicStore;

describe('FE-1 storefront home', () => {
  it('separates model discovery from exact-unit evidence', () => {
    const markup = renderToStaticMarkup(
      <Home products={[product]} catalogUnavailable={false} store={store} />,
    );

    expect(markup).toContain('<h1 id="home-title">Biết rõ chiếc máy trước khi xuống tiền.</h1>');
    expect(markup).toContain('Ảnh dòng máy');
    expect(markup).toContain('href="/products/iphone-13"');
    expect(markup).toContain('12.500.000');
    expect(markup).toContain('rePhone Quận 1');
    expect(markup).not.toContain('36 bước');
    expect(markup).not.toContain('đã bao gồm VAT');
  });

  it('keeps a useful server-rendered state when catalog and store providers fail', () => {
    const markup = renderToStaticMarkup(
      <Home products={[]} catalogUnavailable={true} store={undefined} />,
    );

    expect(markup).toContain('Catalog đang tạm gián đoạn');
    expect(markup).toContain('Chưa tải được thông tin cửa hàng');
    expect(markup).toContain('href="/products"');
    expect(markup).toContain('href="/store"');
  });
});
