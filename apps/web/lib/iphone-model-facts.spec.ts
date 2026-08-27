import { describe, expect, it } from 'vitest';
import {
  getIphoneModelFacts,
  IPHONE_MODEL_FACTS,
  resolveIphoneModelFacts,
} from './iphone-model-facts';

const CATALOG_IPHONE_SLUGS = [
  'iphone-17',
  'iphone-17e',
  'iphone-air',
  'iphone-17-pro',
  'iphone-17-pro-max',
  'iphone-16',
  'iphone-16e',
  'iphone-16-plus',
  'iphone-16-pro',
  'iphone-16-pro-max',
  'iphone-15',
  'iphone-15-plus',
  'iphone-15-pro',
  'iphone-15-pro-max',
  'iphone-14',
  'iphone-14-plus',
  'iphone-14-pro',
  'iphone-14-pro-max',
  'iphone-13',
  'iphone-13-mini',
  'iphone-13-pro',
  'iphone-13-pro-max',
  'iphone-12',
  'iphone-12-mini',
  'iphone-12-pro',
  'iphone-12-pro-max',
  'iphone-11',
  'iphone-11-pro',
  'iphone-11-pro-max',
  'iphone-x',
  'iphone-xr',
  'iphone-xs',
  'iphone-xs-max',
  'iphone-8',
  'iphone-8-plus',
  'iphone-7',
  'iphone-7-plus',
  'iphone-6',
  'iphone-6-plus',
  'iphone-6s',
  'iphone-6s-plus',
  'iphone-5',
  'iphone-5c',
  'iphone-5s',
  'iphone-se-1st-generation',
  'iphone-se-2nd-generation',
  'iphone-se-3rd-generation',
] as const;

describe('iPhone model facts', () => {
  it('covers all 47 public catalog model slugs with complete source-backed facts', () => {
    expect(Object.keys(IPHONE_MODEL_FACTS)).toEqual(CATALOG_IPHONE_SLUGS);
    expect(new Set(Object.keys(IPHONE_MODEL_FACTS)).size).toBe(47);

    for (const profile of Object.values(IPHONE_MODEL_FACTS)) {
      expect(profile.releaseYear).toBeGreaterThanOrEqual(2012);
      expect(profile.chipset).toMatch(/^Apple A/);
      expect(profile.ramGb).toBeGreaterThan(0);
      expect(Number(profile.screenSizeInches)).toBeGreaterThan(0);
      expect(profile.colors.length).toBeGreaterThan(0);
      expect(profile.colors.every((color) => color.trim().length > 0)).toBe(true);
      expect(profile.sources.apple).toMatch(/^https:\/\/support\.apple\.com\//);
      expect(profile.sources.ram).toBe(
        'https://everymac.com/systems/apple/iphone/index-iphone-specs.html',
      );
      expect(profile.verifiedAt).toBe('2026-08-27');
    }
  });

  it('provides the complete iPhone 15 Pro profile even when its API projection is sparse', () => {
    expect(getIphoneModelFacts('iphone-15-pro')).toMatchObject({
      chipset: 'Apple A17 Pro',
      colors: ['Titan đen', 'Titan trắng', 'Titan xanh', 'Titan tự nhiên'],
      ramGb: 8,
      releaseYear: 2023,
      screenSizeInches: '6.1',
    });

    expect(
      resolveIphoneModelFacts({
        chipset: null,
        ramGb: null,
        releaseYear: 2023,
        screenSizeInches: null,
        slug: 'iphone-15-pro',
      }),
    ).toMatchObject({
      chipset: 'Apple A17 Pro',
      colors: ['Titan đen', 'Titan trắng', 'Titan xanh', 'Titan tự nhiên'],
      ramGb: 8,
      releaseYear: 2023,
      screenSizeInches: '6.1',
    });
  });

  it('keeps official Vietnamese finish names for the newest models', () => {
    expect(getIphoneModelFacts('iphone-17')).toMatchObject({
      colors: ['Đen', 'Trắng', 'Xanh Lam Khói', 'Xanh Lá Xô Thơm', 'Tím Oải Hương'],
      sources: { apple: 'https://support.apple.com/vi-vn/125089' },
    });
    expect(getIphoneModelFacts('iphone-17e')).toMatchObject({
      colors: ['Đen', 'Trắng', 'Hồng Phai'],
      sources: { apple: 'https://support.apple.com/vi-vn/126470' },
    });
    expect(getIphoneModelFacts('iphone-17-pro')?.colors).toEqual(['Bạc', 'Cam Vũ Trụ', 'Xanh Đậm']);
    expect(getIphoneModelFacts('iphone-17-pro-max')?.colors).toEqual([
      'Bạc',
      'Cam Vũ Trụ',
      'Xanh Đậm',
    ]);
    expect(getIphoneModelFacts('iphone-5')?.colors).toEqual([
      'Đen và Xám đá phiến',
      'Trắng và Bạc',
    ]);
    expect(getIphoneModelFacts('iphone-13-pro')?.colors).toContain('Xanh dương sierra');
    expect(getIphoneModelFacts('iphone-13-pro-max')?.colors).toContain('Xanh rừng thông');
    expect(getIphoneModelFacts('iphone-11-pro')?.colors).toContain('Xanh rêu');
    expect(getIphoneModelFacts('iphone-11-pro-max')?.colors).toContain('Xanh rêu');
  });

  it('uses the public projection without inventing colors for an unknown slug', () => {
    expect(
      resolveIphoneModelFacts({
        chipset: 'Apple A20',
        ramGb: 12,
        releaseYear: 2027,
        screenSizeInches: '6.4',
        slug: 'iphone-future',
      }),
    ).toEqual({
      chipset: 'Apple A20',
      colors: [],
      ramGb: 12,
      releaseYear: 2027,
      screenSizeInches: '6.4',
    });
  });
});
