import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProductDetail, ProductListItem } from '@/lib/catalog-api';
import { IphoneModelDetail } from './iphone-model-detail';

describe('iPhone model detail', () => {
  it('renders contract-backed model facts and exact-unit context without unsupported claims', () => {
    const markup = renderToStaticMarkup(<IphoneModelDetail product={product()} sort="PRICE_ASC" />);

    expect(markup).toContain('<h1 id="model-title">iPhone 15 Pro Max</h1>');
    expect(markup).toContain('Ảnh minh họa dòng máy');
    expect(markup).toContain('Xem từng máy. Chọn đúng chiếc bạn cần.');
    expect(markup).toContain('Apple A17 Pro');
    expect(markup).toContain('8 GB');
    expect(markup).toContain('6.7 inch');
    expect(markup).toContain('Titan tự nhiên');
    expect(markup).toContain('Xem kỹ rồi hãy chọn');
    expect(markup).not.toContain('Giá, pin và tình trạng thuộc riêng từng mã máy.');
    expect(markup).toContain('Chọn chiếc iPhone 15 Pro Max của bạn');
    expect(markup).toContain('href="#available-options-title"');
    expect(markup).not.toContain('18 hạng mục');
    expect(markup).not.toContain('20 bước');
    expect(markup).not.toContain('checklist');
    expect(markup).not.toContain('Lựa chọn hiện có');
    expect(markup).not.toContain('Chọn đúng chiếc máy đang bán');
    expect(markup).not.toContain('Mới nhất');
    expect(markup).toContain('Ảnh thật · Mã máy UNIT-15PM-001');
    expect(markup).toContain('Titan tự nhiên');
    expect(markup).toContain('25.490.000');
    expect(markup).toContain('href="/products/iphone-15-pro-max/units/UNIT-15PM-001"');
  });

  it('uses the matching public catalog price instead of calculating a price from available offers', () => {
    const source = product();
    const summary = {
      ...source,
      colorOptions: [],
      storageOptions: [],
      inStock: true,
      price: { fromPrice: '19990000' },
    } satisfies ProductListItem;
    const markup = renderToStaticMarkup(
      <IphoneModelDetail product={source} summary={summary} sort="PRICE_ASC" />,
    );
    expect(markup).toContain('Giá từ');
    expect(markup).toContain('19.990.000');
    expect(markup).toContain('25.490.000');
    const mismatched = renderToStaticMarkup(
      <IphoneModelDetail
        product={source}
        summary={{ ...summary, slug: 'iphone-15' }}
        sort="PRICE_ASC"
      />,
    );
    const unavailable = renderToStaticMarkup(
      <IphoneModelDetail
        product={source}
        summary={{ ...summary, inStock: false }}
        sort="PRICE_ASC"
      />,
    );
    expect(mismatched).not.toContain('Giá từ');
    expect(mismatched).not.toContain('19.990.000');
    expect(unavailable).not.toContain('Giá từ');
    expect(unavailable).toContain('Xem giá của từng máy bên dưới');
  });

  it('uses studio artwork only for its exact registered model and keeps other DTO media', () => {
    const source = product();
    const exact = renderToStaticMarkup(
      <IphoneModelDetail
        product={{ ...source, slug: 'iphone-17', name: 'iPhone 17' }}
        sort="PRICE_ASC"
      />,
    );
    const other = renderToStaticMarkup(<IphoneModelDetail product={source} sort="PRICE_ASC" />);
    expect(exact).toContain('/ui-studio/model-iphone-17-banner.webp');
    expect(other).toContain('https://example.test/iphone-15-pro-max.png');
    expect(other).not.toContain('/ui-studio/model-iphone-15-studio.webp');
  });

  it('keeps a useful sold-out model detail instead of turning it into a 404', () => {
    const source = product();
    const variant = source.variants[0];
    if (variant === undefined || !('availableUnits' in variant)) throw new Error('Missing fixture');

    const markup = renderToStaticMarkup(
      <IphoneModelDetail
        product={{ ...source, variants: [{ ...variant, availableUnits: [] }] }}
        sort="PRICE_ASC"
      />,
    );

    expect(markup).toContain('Dòng máy này đang tạm hết máy');
    expect(markup).toContain('href="/products?productType=IPHONE&amp;inStock=true"');
    expect(markup).toContain('iPhone 15 Pro Max');
    expect(markup).not.toContain(
      'Các máy đang hiển thị đã được kỹ thuật viên kiểm tra kỹ lưỡng trước khi đưa lên bán.',
    );
  });

  it('uses the Apple profile for eleven model facts including battery, charge and cameras', () => {
    const source = product();
    const markup = renderToStaticMarkup(
      <IphoneModelDetail
        product={{
          ...source,
          chipset: null,
          id: 'product-15-pro',
          name: 'iPhone 15 Pro',
          ramGb: null,
          releaseYear: 2023,
          screenSizeInches: null,
          slug: 'iphone-15-pro',
          variants: [],
        }}
        sort="PRICE_ASC"
      />,
    );

    expect(markup).toContain('<h1 id="model-title">iPhone 15 Pro</h1>');
    expect(markup).toContain('Apple A17 Pro');
    expect(markup).toContain('8 GB');
    expect(markup).toContain('6.1 inch');
    expect(markup).toContain('Titan đen · Titan trắng · Titan xanh · Titan tự nhiên');
    expect(markup.match(/<dt>/g)).toHaveLength(11);
    expect(markup).toContain('Lên đến 23 giờ');
    expect(markup).toContain('ProMotion đến 120 Hz');
    expect(markup).toContain('48 MP');
    expect(markup).toContain('Thông số từ Apple');
  });
});

function product(): ProductDetail {
  return {
    brand: 'Apple',
    chipset: 'Apple A17 Pro',
    description: 'iPhone cũ được kiểm định minh bạch theo checklist rePhone.',
    id: 'product-15-pro-max',
    media: [
      {
        altText: 'Ảnh minh họa iPhone 15 Pro Max',
        height: 1200,
        url: 'https://example.test/iphone-15-pro-max.png',
        width: 1200,
      },
    ],
    name: 'iPhone 15 Pro Max',
    productType: 'IPHONE',
    ramGb: 8,
    releaseYear: 2023,
    screenSizeInches: '6.7',
    slug: 'iphone-15-pro-max',
    variants: [
      {
        availableUnits: [
          {
            batteryHealthPercent: 96,
            conditionGrade: 'A',
            fulfillmentAvailability: { pickup: true, shipping: true },
            inventoryCode: 'UNIT-15PM-001',
            price: { compareAtPrice: '27990000', salePrice: '25490000' },
            repairHistoryStatus: 'NONE_KNOWN',
            simConfiguration: 'PHYSICAL_AND_ESIM',
            simLockStatus: 'UNLOCKED',
            thumbnail: {
              altText: 'Ảnh thật UNIT-15PM-001',
              height: 1200,
              url: 'https://example.test/unit-15pm-001.png',
              width: 1200,
            },
            warrantyDays: 90,
          },
        ],
        colorHex: '#B5A99B',
        colorName: 'Titan tự nhiên',
        displayName: '256 GB - 8 GB RAM',
        id: 'variant-15pm-256',
        sku: 'IP15PM-256-NAT',
        storageCapacityGb: 256,
        warrantySummary: { days: 90, name: 'Bảo hành 90 ngày', terms: 'Điều khoản' },
      },
    ],
  };
}
