import { describe, expect, it } from 'vitest';
import type { ProductDetail, UsedIphoneDetail } from '@/lib/catalog-api';
import {
  availableColorOffers,
  discountPercent,
  relatedUnitOffers,
  safeColorHex,
  storeAvailabilityLabel,
  unitConfigurationLabel,
} from './unit-dossier-presenters';

describe('unit dossier presenters', () => {
  it('derives a deterministic integer discount from authoritative money strings', () => {
    expect(discountPercent('25490000', '27990000')).toBe(9);
    expect(discountPercent('27990000', '27990000')).toBeNull();
    expect(discountPercent('25490000')).toBeNull();
  });

  it('uses typed model and variant facts for the configuration label', () => {
    expect(unitConfigurationLabel(detailFixture, productFixture)).toBe('256 GB · 8 GB RAM');
    expect(
      unitConfigurationLabel(
        {
          ...detailFixture,
          variant: { ...detailFixture.variant, storageCapacityGb: null },
        },
        { ...productFixture, ramGb: null },
      ),
    ).toBe('256 GB Natural Titanium');
  });

  it('describes pickup availability without implying the service is unsupported', () => {
    expect(storeAvailabilityLabel(true, true)).toBe('Sẵn hàng');
    expect(storeAvailabilityLabel(true, false)).toBe('Sẵn hàng');
    expect(storeAvailabilityLabel(false, true)).toBe('Đang ở kho');
    expect(storeAvailabilityLabel(false, false)).toBe('Không khả dụng');
  });

  it('excludes the current unit and keeps related offers bounded and stable', () => {
    const offers = relatedUnitOffers(productFixture, 'UNIT-CURRENT', 1);
    expect(offers).toHaveLength(1);
    expect(offers[0]?.unit.inventoryCode).toBe('UNIT-OTHER');
    expect(offers[0]?.variant.id).toBe('variant-natural');
  });

  it('keeps one sellable representative per color and sanitizes color values', () => {
    const offers = availableColorOffers(productFixture, 'variant-natural');
    expect(offers.map(({ variant }) => variant.colorName)).toEqual([
      'Natural Titanium',
      'Blue Titanium',
    ]);
    expect(safeColorHex('#B5A99B')).toBe('#B5A99B');
    expect(safeColorHex('url(https://example.test)')).toBe('#dce4ea');
  });

  it('keeps the current variant selected when storage variants share a color', () => {
    const offers = availableColorOffers(productFixture, 'variant-natural-duplicate');

    expect(offers[0]?.variant.id).toBe('variant-natural-duplicate');
    expect(offers.map(({ variant }) => variant.colorName)).toEqual([
      'Natural Titanium',
      'Blue Titanium',
    ]);
  });
});

const cardBase = {
  conditionGrade: 'A' as const,
  fulfillmentAvailability: { pickup: true, shipping: true },
  price: { salePrice: '25490000', compareAtPrice: '27990000' },
  repairHistoryStatus: 'NONE_KNOWN' as const,
  simConfiguration: 'PHYSICAL_AND_ESIM' as const,
  simLockStatus: 'UNLOCKED' as const,
  warrantyDays: 90,
};

const productFixture = {
  id: 'product-1',
  slug: 'iphone-15-pro-max',
  productType: 'IPHONE',
  brand: 'Apple',
  name: 'iPhone 15 Pro Max',
  description: 'Máy cũ đã kiểm định.',
  releaseYear: 2023,
  chipset: 'Apple A17 Pro',
  ramGb: 8,
  screenSizeInches: '6.7',
  media: [],
  variants: [
    {
      id: 'variant-natural',
      sku: 'IP15PM-256-NAT',
      displayName: '256 GB Natural Titanium',
      storageCapacityGb: 256,
      colorName: 'Natural Titanium',
      colorHex: '#B5A99B',
      warrantySummary: { name: 'Bảo hành iPhone', days: 90, terms: 'Điều khoản.' },
      availableUnits: [
        { ...cardBase, inventoryCode: 'UNIT-CURRENT' },
        { ...cardBase, inventoryCode: 'UNIT-OTHER' },
      ],
    },
    {
      id: 'variant-natural-duplicate',
      sku: 'IP15PM-512-NAT',
      displayName: '512 GB Natural Titanium',
      storageCapacityGb: 512,
      colorName: 'Natural Titanium',
      colorHex: '#B5A99B',
      warrantySummary: { name: 'Bảo hành iPhone', days: 90, terms: 'Điều khoản.' },
      availableUnits: [{ ...cardBase, inventoryCode: 'UNIT-NATURAL-512' }],
    },
    {
      id: 'variant-blue',
      sku: 'IP15PM-256-BLU',
      displayName: '256 GB Blue Titanium',
      storageCapacityGb: 256,
      colorName: 'Blue Titanium',
      colorHex: '#253249',
      warrantySummary: { name: 'Bảo hành iPhone', days: 90, terms: 'Điều khoản.' },
      availableUnits: [{ ...cardBase, inventoryCode: 'UNIT-BLUE' }],
    },
  ],
} satisfies ProductDetail;

const detailFixture = {
  product: {
    id: 'product-1',
    slug: 'iphone-15-pro-max',
    name: 'iPhone 15 Pro Max',
    brand: 'Apple',
  },
  variant: {
    id: 'variant-natural',
    sku: 'IP15PM-256-NAT',
    displayName: '256 GB Natural Titanium',
    storageCapacityGb: 256,
    colorName: 'Natural Titanium',
    colorHex: '#B5A99B',
  },
  unit: {
    inventoryCode: 'UNIT-CURRENT',
    modelNumber: 'MU663VN/A',
    regionCode: 'VN/A',
    simLockStatus: 'UNLOCKED',
    carrierName: null,
    simConfiguration: 'PHYSICAL_AND_ESIM',
    price: { salePrice: '25490000', compareAtPrice: '27990000' },
    conditionGrade: 'A',
    cosmeticNotes: 'Ngoại hình đẹp.',
    batteryHealthPercent: 96,
    batteryCycleCount: 207,
    batteryReplacementStatus: 'ORIGINAL',
    repairHistoryStatus: 'NONE_KNOWN',
    repairNotes: null,
    replacedParts: null,
    functionalChecks: [],
    maskedIdentifiers: [],
    warrantyDays: 90,
    fulfillmentAvailability: { pickup: true, shipping: true },
    media: [],
  },
} satisfies UsedIphoneDetail;
