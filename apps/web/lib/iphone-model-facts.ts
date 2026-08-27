import type { ProductDetail } from './catalog-api';

const RAM_SOURCE = 'https://everymac.com/systems/apple/iphone/index-iphone-specs.html';
const VERIFIED_AT = '2026-08-27';

export interface IphoneModelFacts {
  readonly chipset: string;
  readonly colors: readonly string[];
  readonly ramGb: number;
  readonly releaseYear: number;
  readonly screenSizeInches: string;
  readonly sources: {
    readonly apple: string;
    readonly ram: string;
  };
  readonly verifiedAt: string;
}

export interface IphoneModelDisplayFacts {
  readonly chipset?: string | null | undefined;
  readonly colors: readonly string[];
  readonly ramGb?: number | null | undefined;
  readonly releaseYear?: number | null | undefined;
  readonly screenSizeInches?: string | null | undefined;
}

export const IPHONE_MODEL_FACTS = Object.freeze({
  'iphone-17': facts(
    2025,
    'A19',
    8,
    '6.3',
    ['Đen', 'Trắng', 'Xanh Lam Khói', 'Xanh Lá Xô Thơm', 'Tím Oải Hương'],
    'https://support.apple.com/vi-vn/125089',
  ),
  'iphone-17e': facts(
    2026,
    'A19',
    8,
    '6.1',
    ['Đen', 'Trắng', 'Hồng Phai'],
    'https://support.apple.com/vi-vn/126470',
  ),
  'iphone-air': facts(
    2025,
    'A19 Pro',
    12,
    '6.5',
    ['Đen không gian', 'Trắng mây', 'Vàng nhạt', 'Xanh da trời'],
    'https://support.apple.com/en-us/125092',
  ),
  'iphone-17-pro': facts(
    2025,
    'A19 Pro',
    12,
    '6.3',
    ['Bạc', 'Cam Vũ Trụ', 'Xanh Đậm'],
    'https://support.apple.com/vi-vn/125090',
  ),
  'iphone-17-pro-max': facts(
    2025,
    'A19 Pro',
    12,
    '6.9',
    ['Bạc', 'Cam Vũ Trụ', 'Xanh Đậm'],
    'https://support.apple.com/vi-vn/125091',
  ),
  'iphone-16': facts(
    2024,
    'A18',
    8,
    '6.1',
    ['Đen', 'Trắng', 'Hồng', 'Xanh mòng két', 'Xanh lưu ly'],
    'https://support.apple.com/en-us/121029',
  ),
  'iphone-16e': facts(
    2025,
    'A18',
    8,
    '6.1',
    ['Đen', 'Trắng'],
    'https://support.apple.com/en-us/122208',
  ),
  'iphone-16-plus': facts(
    2024,
    'A18',
    8,
    '6.7',
    ['Đen', 'Trắng', 'Hồng', 'Xanh mòng két', 'Xanh lưu ly'],
    'https://support.apple.com/en-us/121030',
  ),
  'iphone-16-pro': facts(
    2024,
    'A18 Pro',
    8,
    '6.3',
    ['Titan đen', 'Titan trắng', 'Titan tự nhiên', 'Titan sa mạc'],
    'https://support.apple.com/en-us/121031',
  ),
  'iphone-16-pro-max': facts(
    2024,
    'A18 Pro',
    8,
    '6.9',
    ['Titan đen', 'Titan trắng', 'Titan tự nhiên', 'Titan sa mạc'],
    'https://support.apple.com/en-us/121032',
  ),
  'iphone-15': facts(
    2023,
    'A16 Bionic',
    6,
    '6.1',
    ['Đen', 'Xanh dương', 'Xanh lá', 'Vàng', 'Hồng'],
    'https://support.apple.com/en-us/111831',
  ),
  'iphone-15-plus': facts(
    2023,
    'A16 Bionic',
    6,
    '6.7',
    ['Đen', 'Xanh dương', 'Xanh lá', 'Vàng', 'Hồng'],
    'https://support.apple.com/en-us/111830',
  ),
  'iphone-15-pro': facts(
    2023,
    'A17 Pro',
    8,
    '6.1',
    ['Titan đen', 'Titan trắng', 'Titan xanh', 'Titan tự nhiên'],
    'https://support.apple.com/en-us/111829',
  ),
  'iphone-15-pro-max': facts(
    2023,
    'A17 Pro',
    8,
    '6.7',
    ['Titan đen', 'Titan trắng', 'Titan xanh', 'Titan tự nhiên'],
    'https://support.apple.com/en-us/111828',
  ),
  'iphone-14': facts(
    2022,
    'A15 Bionic',
    6,
    '6.1',
    ['Đêm xanh thẳm', 'Ánh sao', '(PRODUCT)RED', 'Xanh dương', 'Tím', 'Vàng'],
    'https://support.apple.com/en-us/111850',
  ),
  'iphone-14-plus': facts(
    2022,
    'A15 Bionic',
    6,
    '6.7',
    ['Đêm xanh thẳm', 'Ánh sao', '(PRODUCT)RED', 'Xanh dương', 'Tím', 'Vàng'],
    'https://support.apple.com/en-us/111854',
  ),
  'iphone-14-pro': facts(
    2022,
    'A16 Bionic',
    6,
    '6.1',
    ['Đen không gian', 'Bạc', 'Vàng', 'Tím đậm'],
    'https://support.apple.com/en-us/111849',
  ),
  'iphone-14-pro-max': facts(
    2022,
    'A16 Bionic',
    6,
    '6.7',
    ['Đen không gian', 'Bạc', 'Vàng', 'Tím đậm'],
    'https://support.apple.com/en-us/111846',
  ),
  'iphone-13': facts(
    2021,
    'A15 Bionic',
    4,
    '6.1',
    ['(PRODUCT)RED', 'Ánh sao', 'Đêm xanh thẳm', 'Xanh dương', 'Hồng', 'Xanh lá'],
    'https://support.apple.com/en-us/111872',
  ),
  'iphone-13-mini': facts(
    2021,
    'A15 Bionic',
    4,
    '5.4',
    ['(PRODUCT)RED', 'Ánh sao', 'Đêm xanh thẳm', 'Xanh dương', 'Hồng', 'Xanh lá'],
    'https://support.apple.com/en-us/111873',
  ),
  'iphone-13-pro': facts(
    2021,
    'A15 Bionic',
    6,
    '6.1',
    ['Than chì', 'Vàng', 'Bạc', 'Xanh dương sierra', 'Xanh rừng thông'],
    'https://support.apple.com/en-us/111871',
  ),
  'iphone-13-pro-max': facts(
    2021,
    'A15 Bionic',
    6,
    '6.7',
    ['Than chì', 'Vàng', 'Bạc', 'Xanh dương sierra', 'Xanh rừng thông'],
    'https://support.apple.com/en-us/111870',
  ),
  'iphone-12': facts(
    2020,
    'A14 Bionic',
    4,
    '6.1',
    ['Đen', 'Trắng', '(PRODUCT)RED', 'Xanh lá', 'Xanh dương', 'Tím'],
    'https://support.apple.com/en-us/111876',
  ),
  'iphone-12-mini': facts(
    2020,
    'A14 Bionic',
    4,
    '5.4',
    ['Đen', 'Trắng', '(PRODUCT)RED', 'Xanh lá', 'Xanh dương', 'Tím'],
    'https://support.apple.com/en-us/111877',
  ),
  'iphone-12-pro': facts(
    2020,
    'A14 Bionic',
    6,
    '6.1',
    ['Bạc', 'Than chì', 'Vàng', 'Xanh Thái Bình Dương'],
    'https://support.apple.com/en-us/111875',
  ),
  'iphone-12-pro-max': facts(
    2020,
    'A14 Bionic',
    6,
    '6.7',
    ['Bạc', 'Than chì', 'Vàng', 'Xanh Thái Bình Dương'],
    'https://support.apple.com/en-us/111874',
  ),
  'iphone-11': facts(
    2019,
    'A13 Bionic',
    4,
    '6.1',
    ['Tím', 'Xanh lá', 'Vàng', 'Đen', 'Trắng', '(PRODUCT)RED'],
    'https://support.apple.com/en-us/111865',
  ),
  'iphone-11-pro': facts(
    2019,
    'A13 Bionic',
    4,
    '5.8',
    ['Bạc', 'Xám không gian', 'Vàng', 'Xanh rêu'],
    'https://support.apple.com/en-us/111879',
  ),
  'iphone-11-pro-max': facts(
    2019,
    'A13 Bionic',
    4,
    '6.5',
    ['Bạc', 'Xám không gian', 'Vàng', 'Xanh rêu'],
    'https://support.apple.com/en-us/111878',
  ),
  'iphone-x': facts(
    2017,
    'A11 Bionic',
    3,
    '5.8',
    ['Bạc', 'Xám không gian'],
    'https://support.apple.com/en-us/111864',
  ),
  'iphone-xr': facts(
    2018,
    'A12 Bionic',
    3,
    '6.1',
    ['Đen', 'Trắng', 'Xanh dương', 'Vàng', 'San hô', '(PRODUCT)RED'],
    'https://support.apple.com/en-us/111868',
  ),
  'iphone-xs': facts(
    2018,
    'A12 Bionic',
    4,
    '5.8',
    ['Bạc', 'Xám không gian', 'Vàng'],
    'https://support.apple.com/en-us/111881',
  ),
  'iphone-xs-max': facts(
    2018,
    'A12 Bionic',
    4,
    '6.5',
    ['Bạc', 'Xám không gian', 'Vàng'],
    'https://support.apple.com/en-us/111880',
  ),
  'iphone-8': facts(
    2017,
    'A11 Bionic',
    2,
    '4.7',
    ['Vàng', 'Bạc', 'Xám không gian', '(PRODUCT)RED'],
    'https://support.apple.com/en-us/111976',
  ),
  'iphone-8-plus': facts(
    2017,
    'A11 Bionic',
    3,
    '5.5',
    ['Vàng', 'Bạc', 'Xám không gian', '(PRODUCT)RED'],
    'https://support.apple.com/en-us/111950',
  ),
  'iphone-7': facts(
    2016,
    'A10 Fusion',
    2,
    '4.7',
    ['Đen', 'Đen bóng', 'Vàng', 'Vàng hồng', 'Bạc', '(PRODUCT)RED'],
    'https://support.apple.com/en-us/111943',
  ),
  'iphone-7-plus': facts(
    2016,
    'A10 Fusion',
    3,
    '5.5',
    ['Đen', 'Đen bóng', 'Vàng', 'Vàng hồng', 'Bạc', '(PRODUCT)RED'],
    'https://support.apple.com/en-us/111953',
  ),
  'iphone-6': facts(
    2014,
    'A8',
    1,
    '4.7',
    ['Xám không gian', 'Bạc', 'Vàng'],
    'https://support.apple.com/en-us/111954',
  ),
  'iphone-6-plus': facts(
    2014,
    'A8',
    1,
    '5.5',
    ['Xám không gian', 'Bạc', 'Vàng'],
    'https://support.apple.com/en-us/111940',
  ),
  'iphone-6s': facts(
    2015,
    'A9',
    2,
    '4.7',
    ['Xám không gian', 'Bạc', 'Vàng', 'Vàng hồng'],
    'https://support.apple.com/en-us/111952',
  ),
  'iphone-6s-plus': facts(
    2015,
    'A9',
    2,
    '5.5',
    ['Xám không gian', 'Bạc', 'Vàng', 'Vàng hồng'],
    'https://support.apple.com/en-us/111996',
  ),
  'iphone-5': facts(
    2012,
    'A6',
    1,
    '4',
    ['Đen và Xám đá phiến', 'Trắng và Bạc'],
    'https://support.apple.com/en-us/112016',
  ),
  'iphone-5c': facts(
    2013,
    'A6',
    1,
    '4',
    ['Trắng', 'Xanh dương', 'Hồng', 'Xanh lá', 'Vàng'],
    'https://support.apple.com/en-us/111917',
  ),
  'iphone-5s': facts(
    2013,
    'A7',
    1,
    '4',
    ['Xám không gian', 'Bạc', 'Vàng'],
    'https://support.apple.com/en-us/111973',
  ),
  'iphone-se-1st-generation': facts(
    2016,
    'A9',
    2,
    '4',
    ['Xám không gian', 'Bạc', 'Vàng', 'Vàng hồng'],
    'https://support.apple.com/en-us/112005',
  ),
  'iphone-se-2nd-generation': facts(
    2020,
    'A13 Bionic',
    3,
    '4.7',
    ['Trắng', 'Đen', '(PRODUCT)RED'],
    'https://support.apple.com/en-us/111882',
  ),
  'iphone-se-3rd-generation': facts(
    2022,
    'A15 Bionic',
    4,
    '4.7',
    ['(PRODUCT)RED', 'Ánh sao', 'Đêm xanh thẳm'],
    'https://support.apple.com/en-us/111866',
  ),
} satisfies Readonly<Record<string, IphoneModelFacts>>);

export type KnownIphoneModelSlug = keyof typeof IPHONE_MODEL_FACTS;

export function getIphoneModelFacts(slug: string): IphoneModelFacts | undefined {
  return IPHONE_MODEL_FACTS[slug as KnownIphoneModelSlug];
}

export function resolveIphoneModelFacts(
  product: Pick<ProductDetail, 'chipset' | 'ramGb' | 'releaseYear' | 'screenSizeInches' | 'slug'>,
): IphoneModelDisplayFacts {
  return (
    getIphoneModelFacts(product.slug) ?? {
      chipset: product.chipset,
      colors: [],
      ramGb: product.ramGb,
      releaseYear: product.releaseYear,
      screenSizeInches: product.screenSizeInches,
    }
  );
}

function facts(
  releaseYear: number,
  chipset: string,
  ramGb: number,
  screenSizeInches: string,
  colors: readonly string[],
  appleSource: string,
): IphoneModelFacts {
  return Object.freeze({
    chipset: `Apple ${chipset}`,
    colors: Object.freeze(colors),
    ramGb,
    releaseYear,
    screenSizeInches,
    sources: Object.freeze({ apple: appleSource, ram: RAM_SOURCE }),
    verifiedAt: VERIFIED_AT,
  });
}
