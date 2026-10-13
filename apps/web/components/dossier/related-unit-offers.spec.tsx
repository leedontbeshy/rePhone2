import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RelatedUnitOffers } from './related-unit-offers';
import type { RelatedUnitOffer } from './unit-dossier-presenters';

describe('related exact unit offers', () => {
  it('keeps each related card tied to its model, variant and actual unit facts', () => {
    const first = offer('UNIT-BLUE', 256, 'Xanh lam khói');
    const second = offer('UNIT-BLACK', 512, 'Đen');
    const markup = renderToStaticMarkup(
      <RelatedUnitOffers
        offers={[
          first,
          {
            ...second,
            unit: {
              ...second.unit,
              batteryHealthPercent: 88,
              fulfillmentAvailability: { pickup: false, shipping: true },
              price: { salePrice: '22990000' },
              warrantyDays: 180,
            },
          },
        ]}
        productName="iPhone 17"
        productRamGb={8}
        productSlug="iphone-17"
      />,
    );
    const cards = markup.match(/<article\b[^>]*>[\s\S]*?<\/article>/g);

    expect(cards).toHaveLength(2);
    expect(cards?.[0]).toContain('iPhone 17 256 GB · Xanh lam khói</h3>');
    expect(cards?.[0]).toContain('Ảnh thật · Mã máy UNIT-BLUE');
    expect(cards?.[0]).toContain('Pin 96%');
    expect(cards?.[0]).toContain('21.490.000');
    expect(cards?.[0]).toContain('90 ngày');
    expect(cards?.[0]).toContain('Nhận tại cửa hàng hoặc giao hàng');
    expect(cards?.[0]).not.toContain('UNIT-BLACK');
    expect(cards?.[1]).toContain('iPhone 17 512 GB · Đen</h3>');
    expect(cards?.[1]).toContain('Ảnh thật · Mã máy UNIT-BLACK');
    expect(cards?.[1]).toContain('Pin 88%');
    expect(cards?.[1]).toContain('22.990.000');
    expect(cards?.[1]).toContain('180 ngày');
    expect(cards?.[1]).toContain('Có thể giao hàng');
    expect(cards?.[1]).toContain('href="/products/iphone-17/units/UNIT-BLACK"');
    expect(cards?.[1]).not.toContain('UNIT-BLUE');
    expect(markup.match(/<dt>RAM<\/dt><dd>8 GB<\/dd>/g)).toHaveLength(2);
  });

  it('does not invent related units when none are available', () => {
    expect(
      renderToStaticMarkup(
        <RelatedUnitOffers offers={[]} productName="iPhone 17" productSlug="iphone-17" />,
      ),
    ).toBe('');
  });
});

function offer(
  inventoryCode: string,
  storageCapacityGb: number,
  colorName: string,
): RelatedUnitOffer {
  return {
    unit: {
      batteryHealthPercent: 96,
      conditionGrade: 'A',
      fulfillmentAvailability: { pickup: true, shipping: true },
      inventoryCode,
      price: { salePrice: '21490000' },
      repairHistoryStatus: 'NONE_KNOWN',
      simConfiguration: 'PHYSICAL_AND_ESIM',
      simLockStatus: 'UNLOCKED',
      warrantyDays: 90,
    },
    variant: {
      availableUnits: [],
      colorName,
      displayName: `${String(storageCapacityGb)} GB · ${colorName}`,
      id: `variant-${inventoryCode}`,
      sku: `sku-${inventoryCode}`,
      storageCapacityGb,
      warrantySummary: { days: 90, name: 'Bảo hành 90 ngày', terms: 'Điều khoản bảo hành' },
    },
  };
}
