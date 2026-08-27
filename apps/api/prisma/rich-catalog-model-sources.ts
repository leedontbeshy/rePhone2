export interface AppleIphoneModelSource {
  readonly productSlug: string;
  readonly sourcePageUrl: string;
  readonly originalUrl: string;
  readonly usageBasis: 'EDUCATIONAL_DEMO';
  readonly expectedMimeType: 'image/jpeg' | 'image/png';
  readonly expectedWidth: number;
  readonly expectedHeight: number;
  readonly retrievedAt: '2026-08-27';
}

const APPLE_COMPARE_PAGE_URL = 'https://www.apple.com/iphone/compare/';
const APPLE_COMPARE_ASSET_BASE_URL = 'https://www.apple.com/v/iphone/compare/al/images/overview/';
const EXPECTED_MODEL_SOURCE_COUNT = 47;

export const APPLE_IPHONE_MODEL_SOURCES = [
  appleCompareSource('iphone-17', 'compare_iphone17_black__epmfmcpap0sy_large_2x.jpg'),
  appleCompareSource('iphone-17e', 'compare_iphone17e_black__f8ox5biet3au_large_2x.jpg'),
  appleCompareSource('iphone-air', 'compare_iphone_air_space_black__erjeo9fa6oa6_large_2x.jpg'),
  appleCompareSource('iphone-17-pro', 'compare_iphone17_pro_silver__c7bbt5uwieye_large_2x.jpg'),
  appleCompareSource(
    'iphone-17-pro-max',
    'compare_iphone17_pro_max_silver__dtw5i9e8osmu_large_2x.jpg',
  ),
  appleCompareSource('iphone-16', 'compare_iphone16_black__bedc0hlw316q_large_2x.jpg'),
  appleCompareSource('iphone-16e', 'compare_iphone16e_black__folwa2rvc3ma_large_2x.jpg'),
  appleCompareSource('iphone-16-plus', 'compare_iphone16_plus_black__fzb15ieuikey_large_2x.jpg'),
  appleCompareSource(
    'iphone-16-pro',
    'compare_iphone16_pro_black_titanium__c7t71uah5qky_large_2x.jpg',
  ),
  appleCompareSource(
    'iphone-16-pro-max',
    'compare_iphone16_pro_max_black_titanium__evlilxt8g2mq_large_2x.jpg',
  ),
  appleCompareSource('iphone-15', 'compare_iphone15_black__eer8kwdkdjyq_large_2x.jpg'),
  appleCompareSource('iphone-15-plus', 'compare_iphone15_plus_black__chh9za6pd2vm_large_2x.jpg'),
  appleCompareSource(
    'iphone-15-pro',
    'compare_iphone15_pro_black_titanium__etz96gq8ruoi_large_2x.jpg',
  ),
  appleCompareSource(
    'iphone-15-pro-max',
    'compare_iphone15_pro_max_black_titanium__djidfm1dcmie_large_2x.jpg',
  ),
  appleCompareSource('iphone-14', 'compare_iphone14_midnight__bvwj36frtody_large_2x.jpg'),
  appleCompareSource('iphone-14-plus', 'compare_iphone14_plus_midnight__c9kmil1aq0ae_large_2x.jpg'),
  appleCompareSource(
    'iphone-14-pro',
    'compare_iphone14_pro_space_black__dym2kqku7n6u_large_2x.jpg',
  ),
  appleCompareSource(
    'iphone-14-pro-max',
    'compare_iphone14_pro_max_space_black__dve23pjslceq_large_2x.jpg',
  ),
  appleCompareSource('iphone-13', 'compare_iphone13_midnight__dc2w8cyhc9iu_large_2x.jpg'),
  appleCompareSource('iphone-13-mini', 'compare_iphone13_mini_midnight__e8z05098gnma_large_2x.jpg'),
  appleCompareSource('iphone-13-pro', 'compare_iphone13_pro_graphite__1v1ipyvu1eae_large_2x.jpg'),
  appleCompareSource(
    'iphone-13-pro-max',
    'compare_iphone13_pro_max_graphite__e0rjnrin6ncm_large_2x.jpg',
  ),
  appleCompareSource('iphone-12', 'compare_iphone12_black__gj93q2eeofma_large_2x.jpg'),
  appleCompareSource('iphone-12-mini', 'compare_iphone12_mini_black__f27jirmfeomu_large_2x.jpg'),
  appleCompareSource('iphone-12-pro', 'compare_iphone12_pro_graphite__exopjoz6u2ye_large_2x.jpg'),
  appleCompareSource(
    'iphone-12-pro-max',
    'compare_iphone12_pro_max_graphite__b6j4sfia3yaa_large_2x.jpg',
  ),
  appleCompareSource('iphone-11', 'compare_iphone11_black__luskajpcyaaa_large_2x.jpg'),
  appleCompareSource('iphone-11-pro', 'compare_iphone11_pro_spacegrey__5tufecsmnjmq_large_2x.jpg'),
  appleCompareSource(
    'iphone-11-pro-max',
    'compare_iphone11_pro_max_spacegrey__dut95hfk3j42_large_2x.jpg',
  ),
  appleCompareSource('iphone-x', 'compare_iphoneX_spacegray__65fr9mfeduaa_large_2x.jpg'),
  appleCompareSource('iphone-xr', 'compare_iphoneXR_black__5fvlyykx3bm6_large_2x.jpg'),
  appleCompareSource('iphone-xs', 'compare_iphoneXS_spacegray__dyx8m6aa9pw2_large_2x.jpg'),
  appleCompareSource('iphone-xs-max', 'compare_iphoneXSmax_spacegray__dm2cub991bau_large_2x.jpg'),
  appleCompareSource('iphone-8', 'compare_iphone8_spacegray__eer4a549ezwy_large_2x.jpg'),
  appleCompareSource('iphone-8-plus', 'compare_iphone8plus_spacegray__ex27235welkm_large_2x.jpg'),
  appleCompareSource('iphone-7', 'compare_iphone7_black__gdwleruk1yqa_large_2x.jpg'),
  appleCompareSource('iphone-7-plus', 'compare_iphone7plus_black__d3i1w0xfd926_large_2x.jpg'),
  appleCompareSource('iphone-6', 'compare_iphone6_spacegray__dvt92tqoayky_large_2x.jpg'),
  appleCompareSource('iphone-6-plus', 'compare_iphone6plus_spacegray__sk2v2sul4eye_large_2x.jpg'),
  appleCompareSource('iphone-6s', 'compare_iphone6s_spacegray__drfferlgnewm_large_2x.jpg'),
  appleCompareSource('iphone-6s-plus', 'compare_iphone6splus_spacegray__b5kb8neyuff6_large_2x.jpg'),
  appleSupportSource(
    'iphone-5',
    'https://support.apple.com/en-us/docs/iphone/133778',
    'https://cdsassets.apple.com/content/services/pub/image?productid=133778&size=960x960',
  ),
  appleSupportSource(
    'iphone-5c',
    'https://support.apple.com/en-us/docs/iphone/134094',
    'https://cdsassets.apple.com/content/services/pub/image?productid=134094&size=960x960',
  ),
  appleSupportSource(
    'iphone-5s',
    'https://support.apple.com/en-us/docs/iphone/134096',
    'https://cdsassets.apple.com/content/services/pub/image?productid=134096&size=960x960',
  ),
  appleCompareSource(
    'iphone-se-1st-generation',
    'compare_iphoneSE_spacegray__ex217y3ezw2u_large_2x.jpg',
  ),
  appleCompareSource(
    'iphone-se-2nd-generation',
    'compare_iphoneSE_2nd_gen_black__d4pi98rfqt0m_large_2x.jpg',
  ),
  appleCompareSource(
    'iphone-se-3rd-generation',
    'compare_iphoneSE_3rd_gen_midnight__c57d9v9oipyu_large_2x.jpg',
  ),
] as const satisfies readonly AppleIphoneModelSource[];

export function validateAppleIphoneModelSources(
  sources: readonly AppleIphoneModelSource[] = APPLE_IPHONE_MODEL_SOURCES,
): void {
  if (sources.length !== EXPECTED_MODEL_SOURCE_COUNT) {
    throw new Error(
      `Expected ${String(EXPECTED_MODEL_SOURCE_COUNT)} Apple iPhone model sources, received ${String(sources.length)}.`,
    );
  }

  assertUniqueNonEmptyValues(sources, 'productSlug');
  assertUniqueNonEmptyValues(sources, 'originalUrl');
}

function appleCompareSource(productSlug: string, assetFileName: string): AppleIphoneModelSource {
  return {
    productSlug,
    sourcePageUrl: APPLE_COMPARE_PAGE_URL,
    originalUrl: `${APPLE_COMPARE_ASSET_BASE_URL}${assetFileName}`,
    usageBasis: 'EDUCATIONAL_DEMO',
    expectedMimeType: 'image/jpeg',
    expectedWidth: 612,
    expectedHeight: 760,
    retrievedAt: '2026-08-27',
  };
}

function appleSupportSource(
  productSlug: string,
  sourcePageUrl: string,
  originalUrl: string,
): AppleIphoneModelSource {
  return {
    productSlug,
    sourcePageUrl,
    originalUrl,
    usageBasis: 'EDUCATIONAL_DEMO',
    expectedMimeType: 'image/png',
    expectedWidth: 960,
    expectedHeight: 960,
    retrievedAt: '2026-08-27',
  };
}

function assertUniqueNonEmptyValues(
  sources: readonly AppleIphoneModelSource[],
  field: 'productSlug' | 'originalUrl',
): void {
  const values = new Set<string>();

  for (const source of sources) {
    const value = source[field].trim();
    if (value.length === 0) {
      throw new Error(`Apple iPhone model source has an empty ${field}.`);
    }
    if (values.has(value)) {
      throw new Error(`Duplicate Apple iPhone model source ${field}: ${value}`);
    }
    values.add(value);
  }
}
