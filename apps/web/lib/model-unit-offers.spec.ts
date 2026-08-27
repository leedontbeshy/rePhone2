import { describe, expect, it } from 'vitest';
import type { ProductDetail } from './catalog-api';
import { sortModelUnitOffers, toModelUnitOfferSort, toModelUnitOffers } from './model-unit-offers';

describe('model unit offers', () => {
  it('flattens iPhone variants with the context needed by exact-unit cards', () => {
    const offers = toModelUnitOffers(product());

    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      colorHex: '#B5A99B',
      colorName: 'Titan tự nhiên',
      productRamGb: 8,
      storageCapacityGb: 256,
      variantDisplayName: '256 GB - 8 GB RAM',
      variantId: 'variant-256',
    });
    expect(offers.map(({ unit }) => unit.inventoryCode)).toEqual(['UNIT-A', 'UNIT-B']);
  });

  it('sorts deterministically by authoritative price or battery without mutating input', () => {
    const offers = toModelUnitOffers(product());

    expect(sortModelUnitOffers(offers, 'PRICE_ASC').map(code)).toEqual(['UNIT-B', 'UNIT-A']);
    expect(sortModelUnitOffers(offers, 'PRICE_DESC').map(code)).toEqual(['UNIT-A', 'UNIT-B']);
    expect(sortModelUnitOffers(offers, 'BATTERY_DESC').map(code)).toEqual(['UNIT-A', 'UNIT-B']);
    expect(offers.map(code)).toEqual(['UNIT-A', 'UNIT-B']);
  });

  it('ignores accessory variants instead of inventing serialized offers', () => {
    const source = product();
    const accessory = {
      attributes: null,
      displayName: 'Ốp lưng',
      fulfillmentAvailability: { inStock: true, pickup: true, shipping: true },
      id: 'accessory-variant',
      media: [],
      price: { salePrice: '500000' },
      sku: 'CASE-01',
      warrantySummary: { days: 30, name: 'Bảo hành', terms: 'Điều khoản' },
    } satisfies ProductDetail['variants'][number];

    expect(
      toModelUnitOffers({ ...source, variants: [...source.variants, accessory] }),
    ).toHaveLength(2);
  });

  it('accepts only supported local sort values and never invents a newest sort', () => {
    expect(toModelUnitOfferSort('PRICE_DESC')).toBe('PRICE_DESC');
    expect(toModelUnitOfferSort(['BATTERY_DESC', 'PRICE_DESC'])).toBe('BATTERY_DESC');
    expect(toModelUnitOfferSort('NEWEST')).toBe('PRICE_ASC');
    expect(toModelUnitOfferSort(undefined)).toBe('PRICE_ASC');
  });
});

function code(offer: ReturnType<typeof toModelUnitOffers>[number]): string {
  return offer.unit.inventoryCode;
}

function product(): ProductDetail {
  return {
    brand: 'Apple',
    chipset: 'Apple A17 Pro',
    description: 'iPhone đã hoàn tất kiểm định đầu vào.',
    id: 'product-15-pro-max',
    media: [],
    name: 'iPhone 15 Pro Max',
    productType: 'IPHONE',
    ramGb: 8,
    releaseYear: 2023,
    screenSizeInches: '6.7',
    slug: 'iphone-15-pro-max',
    variants: [
      {
        availableUnits: [unit('UNIT-A', '25490000', 96), unit('UNIT-B', '24790000', null)],
        colorHex: '#B5A99B',
        colorName: 'Titan tự nhiên',
        displayName: '256 GB - 8 GB RAM',
        id: 'variant-256',
        sku: 'IP15PM-256-NAT',
        storageCapacityGb: 256,
        warrantySummary: { days: 90, name: 'Bảo hành 90 ngày', terms: 'Điều khoản' },
      },
    ],
  };
}

function unit(inventoryCode: string, salePrice: string, batteryHealthPercent: number | null) {
  return {
    batteryHealthPercent,
    conditionGrade: 'A' as const,
    fulfillmentAvailability: { pickup: true, shipping: true },
    inventoryCode,
    price: { salePrice },
    repairHistoryStatus: 'NONE_KNOWN' as const,
    simConfiguration: 'PHYSICAL_AND_ESIM' as const,
    simLockStatus: 'UNLOCKED' as const,
    warrantyDays: 90,
  };
}
