import type { components } from '@rephone/api-client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExactUnitCard } from './exact-unit-card';

type Unit = components['schemas']['UsedIphoneCardDto'];

describe('exact unit card', () => {
  it('keeps the actual unit identity, media, variant facts and both public prices together', () => {
    const markup = renderToStaticMarkup(
      <ExactUnitCard
        colorHex="#153955"
        colorName="Xanh lam khói"
        productName="iPhone 17"
        productRamGb={8}
        productSlug="iphone-17"
        storageCapacityGb={256}
        unit={unit()}
        variantDisplayName="256 GB · Xanh lam khói"
      />,
    );

    expect(markup).toContain('Ảnh thật · Mã máy RPH-IP17-256-MBL-U01');
    expect(markup).toContain('iPhone 17 256 GB · Xanh lam khói</h3>');
    expect(markup.match(/Xanh lam khói/g)).toHaveLength(2); // Heading and named CTA.
    expect(markup).toContain('<dt>RAM</dt><dd>8 GB</dd>');
    expect(markup).toContain('Ngoại hình loại A');
    expect(markup).toContain('Pin 96%');
    expect(markup).toContain('21.490.000');
    expect(markup).toContain('23.990.000');
    expect(markup).toContain('90 ngày');
    expect(markup).toContain('Nhận tại cửa hàng hoặc giao hàng');
    expect(markup).toContain('src="https://example.test/actual-unit.png"');
    expect(markup).toContain('alt="Mặt sau máy RPH-IP17-256-MBL-U01"');
    expect(markup.match(/href="\/products\/iphone-17\/units\/RPH-IP17-256-MBL-U01"/g)).toHaveLength(
      2,
    );
    expect(markup).toContain('aria-labelledby="unit-card-RPH-IP17-256-MBL-U01"');
    expect(markup).toContain(
      'aria-label="Xem iPhone 17 256 GB · Xanh lam khói, mã máy RPH-IP17-256-MBL-U01"',
    );
  });

  it('does not repeat storage, color or RAM already supplied by the variant heading', () => {
    const markup = renderToStaticMarkup(
      <ExactUnitCard
        colorName="Xanh lam khói"
        productName="iPhone 17"
        productRamGb={8}
        productSlug="iphone-17"
        storageCapacityGb={256}
        unit={unit()}
        variantDisplayName="iPhone 17 256GB · 8GB RAM · Xanh lam khói"
      />,
    );

    expect(markup).toContain('>iPhone 17 256GB · 8GB RAM · Xanh lam khói</h3>');
    expect(markup).not.toContain('aria-label="Cấu hình máy"');
    expect(markup).not.toContain('256 GB');
    expect(markup).not.toContain('iPhone 17 iPhone 17');
  });

  it('adds missing public storage and color without replacing the variant display name', () => {
    const markup = renderToStaticMarkup(
      <ExactUnitCard
        colorName="Titan tự nhiên"
        productName="iPhone 15 Pro"
        productRamGb={8}
        productSlug="iphone-15-pro"
        storageCapacityGb={512}
        unit={unit()}
        variantDisplayName="Bản quốc tế"
      />,
    );

    expect(markup).toContain('>iPhone 15 Pro Bản quốc tế · 512 GB · Titan tự nhiên</h3>');
    expect(markup).toContain('<dt>RAM</dt><dd>8 GB</dd>');
  });

  it('keeps zero and unavailable values honest and uses the real missing-media fallback', () => {
    const withoutMedia = unit();
    delete withoutMedia.thumbnail;
    const markup = renderToStaticMarkup(
      <ExactUnitCard
        colorHex="invalid-color"
        productSlug="iphone-17"
        unit={{
          ...withoutMedia,
          batteryHealthPercent: 0,
          fulfillmentAvailability: { pickup: false, shipping: false },
          price: { salePrice: '21490000' },
          warrantyDays: 0,
        }}
      />,
    );

    expect(markup).toContain('Máy RPH-IP17-256-MBL-U01</h3>');
    expect(markup).toContain('Pin 0%');
    expect(markup).toContain('0 ngày');
    expect(markup).toContain('Tạm thời chưa thể đặt mua');
    expect(markup).toContain('aria-label="Chưa có ảnh máy RPH-IP17-256-MBL-U01"');
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('<s>');
    expect(markup).not.toContain('invalid-color');
    expect(markup).not.toContain('aria-label="Cấu hình máy"');
  });

  it.each([
    [true, false, 'Nhận tại cửa hàng'],
    [false, true, 'Có thể giao hàng'],
  ] as const)('keeps pickup=%s and shipping=%s specific to the unit', (pickup, shipping, label) => {
    const markup = renderToStaticMarkup(
      <ExactUnitCard
        productSlug="iphone-17"
        unit={{
          ...unit(),
          batteryHealthPercent: null,
          fulfillmentAvailability: { pickup, shipping },
        }}
      />,
    );
    expect(markup).toContain(label);
    expect(markup).not.toContain('Nhận tại cửa hàng hoặc giao hàng');
    expect(markup).not.toContain('Pin %');
    expect(markup).not.toContain('Pin 96%');
  });
});

function unit(): Unit {
  return {
    batteryHealthPercent: 96,
    conditionGrade: 'A',
    fulfillmentAvailability: { pickup: true, shipping: true },
    inventoryCode: 'RPH-IP17-256-MBL-U01',
    price: { compareAtPrice: '23990000', salePrice: '21490000' },
    repairHistoryStatus: 'NONE_KNOWN',
    simConfiguration: 'PHYSICAL_AND_ESIM',
    simLockStatus: 'UNLOCKED',
    thumbnail: {
      altText: 'Mặt sau máy RPH-IP17-256-MBL-U01',
      height: 1200,
      url: 'https://example.test/actual-unit.png',
      width: 1200,
    },
    warrantyDays: 90,
  };
}
