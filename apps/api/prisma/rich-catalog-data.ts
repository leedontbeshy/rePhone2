export type RichConditionGrade = 'A' | 'B' | 'C';
export type RichLocationCode = 'HCM-STORE-01' | 'HCM-WH-01';
export type RichBatteryReplacementStatus = 'ORIGINAL' | 'UNKNOWN';
export type RichRepairHistoryStatus = 'NONE_KNOWN' | 'UNKNOWN';

export interface RichIphoneProductDefinition {
  slug: string;
  name: string;
  modelToken: string;
  releaseYear: number;
  referenceBaseStorageCapacityGb: number;
  referenceBasePrice: string;
}

export interface RichIphoneVariantDefinition {
  productSlug: RichIphoneProductSlug;
  sku: string;
  displayName: string;
  storageCapacityGb: number;
  colorName: string;
  colorHex: string;
  referenceSalePrice: string;
}

export interface RichAvailableUnitDefinition {
  productSlug: RichIphoneProductSlug;
  sku: string;
  inventoryCode: string;
  serial: string;
  locationCode: RichLocationCode;
  lifecycleStatus: 'AVAILABLE';
  salePrice: string;
  compareAtPrice: string;
  acquisitionCost: string;
  additionalCost: string;
  conditionGrade: RichConditionGrade;
  batteryHealthPercent: number;
  batteryCycleCount: number;
  batteryReplacementStatus: RichBatteryReplacementStatus;
  repairHistoryStatus: RichRepairHistoryStatus;
  cosmeticNotes: string;
  imageAssetKey: string;
  imageFileName: string;
}

const PRODUCTS = [
  product('iphone-17', 'iPhone 17', 'IP17', 2025, 256, '21990000'),
  product('iphone-17e', 'iPhone 17e', 'IP17E', 2026, 256, '16990000'),
  product('iphone-air', 'iPhone Air', 'IPAIR', 2025, 256, '24990000'),
  product('iphone-17-pro', 'iPhone 17 Pro', 'IP17P', 2025, 256, '27990000'),
  product('iphone-17-pro-max', 'iPhone 17 Pro Max', 'IP17PM', 2025, 256, '30990000'),
  product('iphone-16', 'iPhone 16', 'IP16', 2024, 128, '17490000'),
  product('iphone-16e', 'iPhone 16e', 'IP16E', 2025, 128, '13990000'),
  product('iphone-16-plus', 'iPhone 16 Plus', 'IP16PL', 2024, 128, '18490000'),
  product('iphone-16-pro', 'iPhone 16 Pro', 'IP16P', 2024, 128, '22490000'),
  product('iphone-16-pro-max', 'iPhone 16 Pro Max', 'IP16PM', 2024, 256, '25990000'),
  product('iphone-15', 'iPhone 15', 'IP15', 2023, 128, '13990000'),
  product('iphone-15-plus', 'iPhone 15 Plus', 'IP15PL', 2023, 128, '14990000'),
  product('iphone-15-pro', 'iPhone 15 Pro', 'IP15P', 2023, 128, '17990000'),
  product('iphone-15-pro-max', 'iPhone 15 Pro Max', 'IP15PM', 2023, 256, '21990000'),
  product('iphone-14', 'iPhone 14', 'IP14', 2022, 128, '10490000'),
  product('iphone-14-plus', 'iPhone 14 Plus', 'IP14PL', 2022, 128, '11490000'),
  product('iphone-14-pro', 'iPhone 14 Pro', 'IP14P', 2022, 128, '13990000'),
  product('iphone-14-pro-max', 'iPhone 14 Pro Max', 'IP14PM', 2022, 128, '15990000'),
  product('iphone-13', 'iPhone 13', 'IP13', 2021, 128, '8490000'),
  product('iphone-13-mini', 'iPhone 13 mini', 'IP13M', 2021, 128, '7990000'),
  product('iphone-13-pro', 'iPhone 13 Pro', 'IP13P', 2021, 128, '10990000'),
  product('iphone-13-pro-max', 'iPhone 13 Pro Max', 'IP13PM', 2021, 128, '11990000'),
  product('iphone-12', 'iPhone 12', 'IP12', 2020, 64, '6490000'),
  product('iphone-12-mini', 'iPhone 12 mini', 'IP12M', 2020, 64, '5990000'),
  product('iphone-12-pro', 'iPhone 12 Pro', 'IP12P', 2020, 128, '7490000'),
  product('iphone-12-pro-max', 'iPhone 12 Pro Max', 'IP12PM', 2020, 128, '8490000'),
  product('iphone-11', 'iPhone 11', 'IP11', 2019, 64, '4990000'),
  product('iphone-11-pro', 'iPhone 11 Pro', 'IP11P', 2019, 64, '5990000'),
  product('iphone-11-pro-max', 'iPhone 11 Pro Max', 'IP11PM', 2019, 64, '6490000'),
  product('iphone-x', 'iPhone X', 'IPX', 2017, 64, '3990000'),
  product('iphone-xr', 'iPhone XR', 'IPXR', 2018, 64, '3790000'),
  product('iphone-xs', 'iPhone XS', 'IPXS', 2018, 64, '4290000'),
  product('iphone-xs-max', 'iPhone XS Max', 'IPXSM', 2018, 64, '4790000'),
  product('iphone-8', 'iPhone 8', 'IP8', 2017, 64, '2990000'),
  product('iphone-8-plus', 'iPhone 8 Plus', 'IP8PL', 2017, 64, '3490000'),
  product('iphone-7', 'iPhone 7', 'IP7', 2016, 32, '2490000'),
  product('iphone-7-plus', 'iPhone 7 Plus', 'IP7PL', 2016, 32, '2890000'),
  product('iphone-6', 'iPhone 6', 'IP6', 2014, 16, '1890000'),
  product('iphone-6-plus', 'iPhone 6 Plus', 'IP6PL', 2014, 16, '2090000'),
  product('iphone-6s', 'iPhone 6s', 'IP6S', 2015, 32, '2090000'),
  product('iphone-6s-plus', 'iPhone 6s Plus', 'IP6SPL', 2015, 32, '2290000'),
  product('iphone-5', 'iPhone 5', 'IP5', 2012, 16, '1490000'),
  product('iphone-5c', 'iPhone 5c', 'IP5C', 2013, 16, '1390000'),
  product('iphone-5s', 'iPhone 5s', 'IP5S', 2013, 16, '1590000'),
  product('iphone-se-1st-generation', 'iPhone SE (thế hệ 1)', 'IPSE1', 2016, 32, '1790000'),
  product('iphone-se-2nd-generation', 'iPhone SE (thế hệ 2)', 'IPSE2', 2020, 64, '3490000'),
  product('iphone-se-3rd-generation', 'iPhone SE (thế hệ 3)', 'IPSE3', 2022, 64, '5490000'),
] as const satisfies readonly RichIphoneProductDefinition[];

export const RICH_IPHONE_PRODUCTS = PRODUCTS;
export type RichIphoneProductSlug = (typeof RICH_IPHONE_PRODUCTS)[number]['slug'];

interface RichVariantSeed {
  storageCapacityGb: number;
  colorName: string;
  colorToken: string;
  colorHex: string;
}

const VARIANT_SEEDS = {
  'iphone-17': [
    variant(256, 'Mist Blue', 'MBL', '#A7C1CC'),
    variant(256, 'Black', 'BLK', '#252525'),
    variant(512, 'Sage', 'SGE', '#A6AE9B'),
  ],
  'iphone-17e': [variant(256, 'Soft Pink', 'SPK', '#E9CDD1')],
  'iphone-air': [variant(256, 'Sky Blue', 'SKY', '#C7D8E5')],
  'iphone-17-pro': [
    variant(256, 'Deep Blue', 'DBL', '#243549'),
    variant(512, 'Silver', 'SLV', '#D8D7D2'),
    variant(1024, 'Cosmic Orange', 'ORG', '#C96E45'),
  ],
  'iphone-17-pro-max': [
    variant(256, 'Silver', 'SLV', '#D8D7D2'),
    variant(512, 'Deep Blue', 'DBL', '#243549'),
    variant(1024, 'Cosmic Orange', 'ORG', '#C96E45'),
    variant(2048, 'Silver', 'SLV', '#D8D7D2'),
  ],
  'iphone-16': [
    variant(128, 'Black', 'BLK', '#252525'),
    variant(256, 'Teal', 'TEA', '#8AA6A2'),
    variant(256, 'Ultramarine', 'ULT', '#6578A8'),
  ],
  'iphone-16e': [variant(128, 'White', 'WHT', '#F1F0EB')],
  'iphone-16-plus': [
    variant(128, 'Pink', 'PNK', '#E9D0D2'),
    variant(256, 'Teal', 'TEA', '#8AA6A2'),
    variant(256, 'Ultramarine', 'ULT', '#6578A8'),
  ],
  'iphone-16-pro': [
    variant(128, 'Natural Titanium', 'NAT', '#B6AEA4'),
    variant(256, 'Black Titanium', 'BLK', '#3B3A38'),
    variant(512, 'Desert Titanium', 'DES', '#C8B4A3'),
  ],
  'iphone-16-pro-max': [
    variant(256, 'Desert Titanium', 'DES', '#C8B4A3'),
    variant(512, 'Natural Titanium', 'NAT', '#B6AEA4'),
    variant(1024, 'White Titanium', 'WHT', '#E5E1DA'),
  ],
  'iphone-15': [
    variant(128, 'Blue', 'BLU', '#CAD9E5'),
    variant(256, 'Black', 'BLK', '#353839'),
    variant(256, 'Pink', 'PNK', '#E7C9C8'),
  ],
  'iphone-15-plus': [
    variant(128, 'Blue', 'BLU', '#CAD9E5'),
    variant(256, 'Pink', 'PNK', '#E7C9C8'),
    variant(256, 'Green', 'GRN', '#D4DFD1'),
  ],
  'iphone-15-pro': [
    variant(128, 'Natural Titanium', 'NAT', '#B5A99B'),
    variant(256, 'Blue Titanium', 'BLU', '#39475A'),
    variant(512, 'Black Titanium', 'BLK', '#3B3B3D'),
  ],
  'iphone-15-pro-max': [
    variant(256, 'Natural Titanium', 'NAT', '#B5A99B'),
    variant(512, 'Black Titanium', 'BLK', '#3B3B3D'),
    variant(1024, 'White Titanium', 'WHT', '#E6E2DA'),
  ],
  'iphone-14': [
    variant(128, 'Midnight', 'MID', '#1F2428'),
    variant(256, 'Blue', 'BLU', '#A7B8C8'),
    variant(256, 'Purple', 'PUR', '#B8B0C5'),
  ],
  'iphone-14-plus': [variant(128, 'Purple', 'PUR', '#B8B0C5')],
  'iphone-14-pro': [
    variant(128, 'Space Black', 'BLK', '#3B3B3D'),
    variant(256, 'Space Black', 'BLK', '#3B3B3D'),
    variant(256, 'Deep Purple', 'PUR', '#5B5268'),
  ],
  'iphone-14-pro-max': [
    variant(128, 'Deep Purple', 'PUR', '#5B5268'),
    variant(256, 'Space Black', 'BLK', '#3B3B3D'),
    variant(512, 'Silver', 'SLV', '#E4E2DD'),
  ],
  'iphone-13': [
    variant(128, 'Midnight', 'MID', '#1F2428'),
    variant(128, 'Blue', 'BLU', '#276787'),
    variant(256, 'Pink', 'PNK', '#E8D1D1'),
  ],
  'iphone-13-mini': [variant(128, 'Pink', 'PNK', '#E8D1D1')],
  'iphone-13-pro': [
    variant(128, 'Sierra Blue', 'SBL', '#9BB5C5'),
    variant(256, 'Graphite', 'GRA', '#4C4B49'),
  ],
  'iphone-13-pro-max': [
    variant(128, 'Sierra Blue', 'SBL', '#9BB5C5'),
    variant(256, 'Graphite', 'GRA', '#4C4B49'),
    variant(512, 'Gold', 'GLD', '#D8C5A3'),
  ],
  'iphone-12': [
    variant(64, 'Black', 'BLK', '#202124'),
    variant(128, 'Blue', 'BLU', '#2D5F8A'),
    variant(256, 'Purple', 'PUR', '#B7A7C5'),
  ],
  'iphone-12-mini': [variant(64, 'Blue', 'BLU', '#2D5F8A')],
  'iphone-12-pro': [variant(128, 'Pacific Blue', 'PBL', '#526C78')],
  'iphone-12-pro-max': [
    variant(128, 'Pacific Blue', 'PBL', '#526C78'),
    variant(256, 'Graphite', 'GRA', '#4D4C4A'),
  ],
  'iphone-11': [
    variant(64, 'Black', 'BLK', '#202124'),
    variant(128, 'Purple', 'PUR', '#C2B8CD'),
    variant(256, 'Green', 'GRN', '#A7B8AA'),
  ],
  'iphone-11-pro': [variant(64, 'Midnight Green', 'MGN', '#4E5851')],
  'iphone-11-pro-max': [
    variant(64, 'Midnight Green', 'MGN', '#4E5851'),
    variant(256, 'Gold', 'GLD', '#D5C3A5'),
  ],
  'iphone-x': [
    variant(64, 'Space Gray', 'GRY', '#535150'),
    variant(256, 'Silver', 'SLV', '#D7D7D5'),
  ],
  'iphone-xr': [variant(64, 'Blue', 'BLU', '#68A2B9'), variant(128, 'Black', 'BLK', '#252525')],
  'iphone-xs': [variant(64, 'Gold', 'GLD', '#D0BFA5')],
  'iphone-xs-max': [
    variant(64, 'Gold', 'GLD', '#D0BFA5'),
    variant(256, 'Space Gray', 'GRY', '#535150'),
  ],
  'iphone-8': [variant(64, 'Space Gray', 'GRY', '#535150')],
  'iphone-8-plus': [variant(64, 'Gold', 'GLD', '#D0B58D')],
  'iphone-7': [variant(32, 'Black', 'BLK', '#292929')],
  'iphone-7-plus': [variant(32, 'Jet Black', 'JBK', '#171717')],
  'iphone-6': [variant(16, 'Space Gray', 'GRY', '#777573')],
  'iphone-6-plus': [variant(16, 'Gold', 'GLD', '#D3BA98')],
  'iphone-6s': [variant(32, 'Rose Gold', 'RGD', '#D6AAA0')],
  'iphone-6s-plus': [variant(32, 'Space Gray', 'GRY', '#777573')],
  'iphone-5': [variant(16, 'Black & Slate', 'BTS', '#28292A')],
  'iphone-5c': [variant(16, 'Blue', 'BLU', '#5AA6CC')],
  'iphone-5s': [variant(16, 'Space Gray', 'GRY', '#666563')],
  'iphone-se-1st-generation': [variant(32, 'Rose Gold', 'RGD', '#D6AAA0')],
  'iphone-se-2nd-generation': [variant(64, 'Black', 'BLK', '#252525')],
  'iphone-se-3rd-generation': [variant(64, 'Midnight', 'MID', '#1F2428')],
} as const satisfies Record<RichIphoneProductSlug, readonly RichVariantSeed[]>;

export const RICH_AVAILABLE_MODEL_SLUGS = [
  'iphone-x',
  'iphone-xr',
  'iphone-xs-max',
  'iphone-11',
  'iphone-11-pro-max',
  'iphone-12',
  'iphone-12-pro-max',
  'iphone-13',
  'iphone-13-pro',
  'iphone-13-pro-max',
  'iphone-14',
  'iphone-14-pro',
  'iphone-14-pro-max',
  'iphone-15',
  'iphone-15-plus',
  'iphone-15-pro',
  'iphone-15-pro-max',
  'iphone-16',
  'iphone-16-plus',
  'iphone-16-pro',
  'iphone-16-pro-max',
  'iphone-17',
  'iphone-17-pro',
  'iphone-17-pro-max',
] as const satisfies readonly RichIphoneProductSlug[];

export const RICH_IPHONE_VARIANTS = Object.freeze(
  RICH_IPHONE_PRODUCTS.flatMap((productDefinition) =>
    VARIANT_SEEDS[productDefinition.slug].map((seed) =>
      buildVariantDefinition(productDefinition, seed),
    ),
  ),
);

export const RICH_AVAILABLE_UNITS = Object.freeze(
  RICH_AVAILABLE_MODEL_SLUGS.flatMap((productSlug) => buildAvailableUnits(productSlug)),
);

export interface RichCatalogData {
  products: readonly RichIphoneProductDefinition[];
  variants: readonly RichIphoneVariantDefinition[];
  availableModelSlugs: readonly RichIphoneProductSlug[];
  units: readonly RichAvailableUnitDefinition[];
}

export const RICH_CATALOG_DATA: RichCatalogData = Object.freeze({
  products: RICH_IPHONE_PRODUCTS,
  variants: RICH_IPHONE_VARIANTS,
  availableModelSlugs: RICH_AVAILABLE_MODEL_SLUGS,
  units: RICH_AVAILABLE_UNITS,
});

export const RICH_BASELINE_SKUS = Object.freeze([
  'IP13-128-MID',
  'IP13-128-BLU',
  'IP14P-128-BLK',
  'IP14P-256-BLK',
  'IP15PM-256-NAT',
] as const);

export function validateRichCatalogData(
  data: RichCatalogData = RICH_CATALOG_DATA,
): readonly string[] {
  const errors: string[] = [];
  const productSlugs = new Set(data.products.map(({ slug }) => slug));
  const productTokens = new Set(data.products.map(({ modelToken }) => modelToken));
  const variantSkus = new Set(data.variants.map(({ sku }) => sku));
  const availableSlugs = new Set(data.availableModelSlugs);

  expectCount(errors, 'products', data.products.length, 47);
  expectUniqueCount(errors, 'product slugs', productSlugs.size, data.products.length);
  expectUniqueCount(errors, 'product model tokens', productTokens.size, data.products.length);
  expectCount(errors, 'variants', data.variants.length, 90);
  expectUniqueCount(errors, 'variant SKUs', variantSkus.size, data.variants.length);
  expectCount(errors, 'available model slugs', data.availableModelSlugs.length, 24);
  expectUniqueCount(
    errors,
    'available model slugs',
    availableSlugs.size,
    data.availableModelSlugs.length,
  );
  expectCount(errors, 'available units', data.units.length, 96);

  for (const productDefinition of data.products) {
    if (!/^iphone-[a-z0-9-]+$/.test(productDefinition.slug)) {
      errors.push(`Invalid product slug: ${productDefinition.slug}`);
    }
    if (!/^IP[A-Z0-9]+$/.test(productDefinition.modelToken)) {
      errors.push(`Invalid product model token: ${productDefinition.modelToken}`);
    }
    if (!isPositiveMoney(productDefinition.referenceBasePrice)) {
      errors.push(`Invalid reference base price for ${productDefinition.slug}`);
    }
    const matchingVariants = data.variants.filter(
      ({ productSlug }) => productSlug === productDefinition.slug,
    );
    if (matchingVariants.length === 0) {
      errors.push(`Product has no real variant: ${productDefinition.slug}`);
    }
  }

  for (const variantDefinition of data.variants) {
    if (!productSlugs.has(variantDefinition.productSlug)) {
      errors.push(`Variant ${variantDefinition.sku} references an unknown product`);
    }
    if (!/^[A-Z0-9-]{6,64}$/.test(variantDefinition.sku)) {
      errors.push(`Invalid SKU: ${variantDefinition.sku}`);
    }
    if (variantDefinition.storageCapacityGb <= 0) {
      errors.push(`Invalid storage capacity for ${variantDefinition.sku}`);
    }
    if (!/^#[0-9A-F]{6}$/i.test(variantDefinition.colorHex)) {
      errors.push(`Invalid color hex for ${variantDefinition.sku}`);
    }
    if (!isPositiveMoney(variantDefinition.referenceSalePrice)) {
      errors.push(`Invalid reference sale price for ${variantDefinition.sku}`);
    }
  }

  for (const sku of RICH_BASELINE_SKUS) {
    if (!variantSkus.has(sku)) errors.push(`Missing baseline SKU: ${sku}`);
  }

  for (const productSlug of data.availableModelSlugs) {
    if (!productSlugs.has(productSlug)) {
      errors.push(`Available model references an unknown product: ${productSlug}`);
    }
    const count = data.units.filter((unit) => unit.productSlug === productSlug).length;
    if (count !== 4)
      errors.push(`Expected 4 available units for ${productSlug}; received ${String(count)}`);
  }

  const inventoryCodes = new Set<string>();
  const serials = new Set<string>();
  const imageKeys = new Set<string>();
  const imageFileNames = new Set<string>();
  let storeCount = 0;
  let warehouseCount = 0;

  for (const unit of data.units) {
    const variantDefinition = data.variants.find(({ sku }) => sku === unit.sku);
    if (variantDefinition === undefined) {
      errors.push(`Unit ${unit.inventoryCode} references an unknown SKU`);
    } else if (variantDefinition.productSlug !== unit.productSlug) {
      errors.push(`Unit ${unit.inventoryCode} references a SKU from another product`);
    }
    if (!availableSlugs.has(unit.productSlug)) {
      errors.push(`Unit ${unit.inventoryCode} belongs to a non-available model`);
    }
    if (!/^[A-Z0-9-]{6,64}$/.test(unit.inventoryCode)) {
      errors.push(`Invalid inventory code: ${unit.inventoryCode}`);
    }
    if (!/^[A-Z0-9]{6,32}$/.test(unit.serial)) {
      errors.push(`Invalid demo serial: ${unit.serial}`);
    }
    if (!isPositiveMoney(unit.salePrice) || !isPositiveMoney(unit.compareAtPrice)) {
      errors.push(`Invalid unit price for ${unit.inventoryCode}`);
    } else if (BigInt(unit.compareAtPrice) < BigInt(unit.salePrice)) {
      errors.push(`Compare-at price is below sale price for ${unit.inventoryCode}`);
    }
    if (!isPositiveMoney(unit.acquisitionCost) || !isNonNegativeMoney(unit.additionalCost)) {
      errors.push(`Invalid cost for ${unit.inventoryCode}`);
    }
    if (unit.batteryHealthPercent < 0 || unit.batteryHealthPercent > 100) {
      errors.push(`Invalid battery health for ${unit.inventoryCode}`);
    }
    if (!Number.isInteger(unit.batteryCycleCount) || unit.batteryCycleCount < 0) {
      errors.push(`Invalid battery cycle count for ${unit.inventoryCode}`);
    }
    if (!/^unit-iphone-[a-z0-9-]+-\d{2}$/.test(unit.imageAssetKey)) {
      errors.push(`Invalid unit image asset key: ${unit.imageAssetKey}`);
    }
    if (!/^iphone-[a-z0-9-]+-\d{2}\.webp$/.test(unit.imageFileName)) {
      errors.push(`Invalid unit image filename: ${unit.imageFileName}`);
    }
    addUnique(errors, inventoryCodes, unit.inventoryCode, 'inventory code');
    addUnique(errors, serials, unit.serial, 'serial');
    addUnique(errors, imageKeys, unit.imageAssetKey, 'unit image asset key');
    addUnique(errors, imageFileNames, unit.imageFileName, 'unit image filename');
    if (unit.locationCode === 'HCM-STORE-01') storeCount += 1;
    if (unit.locationCode === 'HCM-WH-01') warehouseCount += 1;
  }

  expectCount(errors, 'store available units', storeCount, 48);
  expectCount(errors, 'warehouse available units', warehouseCount, 48);
  return Object.freeze(errors);
}

export function assertValidRichCatalogData(data: RichCatalogData = RICH_CATALOG_DATA): void {
  const errors = validateRichCatalogData(data);
  if (errors.length > 0) {
    throw new Error(`Invalid rich catalog data:\n- ${errors.join('\n- ')}`);
  }
}

function product<const Slug extends string, const ModelToken extends string>(
  slug: Slug,
  name: string,
  modelToken: ModelToken,
  releaseYear: number,
  referenceBaseStorageCapacityGb: number,
  referenceBasePrice: string,
): RichIphoneProductDefinition & { slug: Slug; modelToken: ModelToken } {
  return {
    slug,
    name,
    modelToken,
    releaseYear,
    referenceBaseStorageCapacityGb,
    referenceBasePrice,
  };
}

function variant(
  storageCapacityGb: number,
  colorName: string,
  colorToken: string,
  colorHex: string,
): RichVariantSeed {
  return { storageCapacityGb, colorName, colorToken, colorHex };
}

function buildVariantDefinition(
  productDefinition: (typeof RICH_IPHONE_PRODUCTS)[number],
  seed: RichVariantSeed,
): RichIphoneVariantDefinition {
  return Object.freeze({
    productSlug: productDefinition.slug,
    sku: `${productDefinition.modelToken}-${String(seed.storageCapacityGb)}-${seed.colorToken}`,
    displayName: `${storageLabel(seed.storageCapacityGb)} ${seed.colorName}`,
    storageCapacityGb: seed.storageCapacityGb,
    colorName: seed.colorName,
    colorHex: seed.colorHex,
    referenceSalePrice: calculateReferencePrice(productDefinition, seed.storageCapacityGb),
  });
}

function buildAvailableUnits(
  productSlug: RichIphoneProductSlug,
): readonly RichAvailableUnitDefinition[] {
  const productDefinition = requiredProduct(productSlug);
  const variants = RICH_IPHONE_VARIANTS.filter(
    (variantDefinition) => variantDefinition.productSlug === productSlug,
  );
  if (variants.length === 0) throw new Error(`Missing variants for ${productSlug}`);
  const grades: readonly RichConditionGrade[] =
    productDefinition.releaseYear >= 2022 ? ['A', 'A', 'B', 'B'] : ['A', 'B', 'B', 'C'];

  return Object.freeze(
    Array.from({ length: 4 }, (_, index) => {
      const variantDefinition = variants[index % variants.length];
      if (variantDefinition === undefined)
        throw new Error(`Missing unit variant for ${productSlug}`);
      const sequence = (index + 1).toString().padStart(2, '0');
      const inventoryCode = `RPH-${variantDefinition.sku}-U${sequence}`;
      const conditionGrade = grades[index];
      if (conditionGrade === undefined) throw new Error(`Missing grade for ${inventoryCode}`);
      const batteryHealthPercent = calculateBatteryHealth(
        productDefinition.releaseYear,
        conditionGrade,
        index,
      );
      const salePrice = calculateUnitSalePrice(
        variantDefinition.referenceSalePrice,
        conditionGrade,
        batteryHealthPercent,
        index,
      );
      return Object.freeze({
        productSlug,
        sku: variantDefinition.sku,
        inventoryCode,
        serial: inventoryCode.replaceAll('-', ''),
        locationCode: index < 2 ? 'HCM-STORE-01' : 'HCM-WH-01',
        lifecycleStatus: 'AVAILABLE',
        salePrice,
        compareAtPrice: calculateCompareAtPrice(salePrice),
        acquisitionCost: calculateAcquisitionCost(salePrice, index),
        additionalCost: ['0', '150000', '0', '300000'][index] ?? '0',
        conditionGrade,
        batteryHealthPercent,
        batteryCycleCount: calculateBatteryCycleCount(
          productDefinition.releaseYear,
          conditionGrade,
          index,
        ),
        batteryReplacementStatus:
          productDefinition.releaseYear <= 2020 && batteryHealthPercent < 80
            ? 'UNKNOWN'
            : 'ORIGINAL',
        repairHistoryStatus: conditionGrade === 'A' ? 'NONE_KNOWN' : 'UNKNOWN',
        cosmeticNotes: cosmeticNotes(conditionGrade),
        imageAssetKey: `unit-${productSlug}-${sequence}`,
        imageFileName: `${productSlug}-${sequence}.webp`,
      });
    }),
  );
}

function requiredProduct(productSlug: RichIphoneProductSlug) {
  const productDefinition = RICH_IPHONE_PRODUCTS.find(({ slug }) => slug === productSlug);
  if (productDefinition === undefined) throw new Error(`Missing rich product ${productSlug}`);
  return productDefinition;
}

function calculateReferencePrice(
  productDefinition: RichIphoneProductDefinition,
  storageCapacityGb: number,
): string {
  const premium = requiredStoragePremium(storageCapacityGb);
  const basePremium = requiredStoragePremium(productDefinition.referenceBaseStorageCapacityGb);
  return (BigInt(productDefinition.referenceBasePrice) + premium - basePremium).toString();
}

function calculateBatteryHealth(
  releaseYear: number,
  grade: RichConditionGrade,
  index: number,
): number {
  const age = Math.max(0, 2026 - releaseYear);
  const base = { A: 98, B: 94, C: 88 }[grade];
  const maximumPenalty = { A: 14, B: 16, C: 13 }[grade];
  const jitter = [0, 1, -1, 0][index] ?? 0;
  return Math.max(75, Math.min(100, base - Math.min(age * 2, maximumPenalty) + jitter));
}

function calculateBatteryCycleCount(
  releaseYear: number,
  grade: RichConditionGrade,
  index: number,
): number {
  const age = Math.max(0, 2026 - releaseYear);
  const gradeCycles = { A: 80, B: 220, C: 390 }[grade];
  return Math.min(1500, age * 85 + gradeCycles + index * 31);
}

function calculateUnitSalePrice(
  referencePrice: string,
  grade: RichConditionGrade,
  batteryHealthPercent: number,
  index: number,
): string {
  const gradeDiscount = { A: 0n, B: 600_000n, C: 1_300_000n }[grade];
  const batteryDiscount = BigInt(Math.min(12, Math.max(0, 90 - batteryHealthPercent))) * 100_000n;
  const deterministicAdjustment = [100_000n, 0n, -100_000n, -200_000n][index] ?? 0n;
  const calculated =
    BigInt(referencePrice) - gradeDiscount - batteryDiscount + deterministicAdjustment;
  return roundMoney(calculated < 1_000_000n ? 1_000_000n : calculated).toString();
}

function calculateCompareAtPrice(salePrice: string): string {
  const sale = BigInt(salePrice);
  const percentage = roundMoney((sale * 8n) / 100n);
  const difference = percentage > 800_000n ? percentage : 800_000n;
  return (sale + difference).toString();
}

function calculateAcquisitionCost(salePrice: string, index: number): string {
  const percentage = BigInt(72 + index * 2);
  return roundMoney((BigInt(salePrice) * percentage) / 100n).toString();
}

function requiredStoragePremium(storageCapacityGb: number): bigint {
  const premiums = new Map<number, bigint>([
    [16, 0n],
    [32, 300_000n],
    [64, 700_000n],
    [128, 1_500_000n],
    [256, 3_000_000n],
    [512, 5_500_000n],
    [1024, 9_000_000n],
    [2048, 14_000_000n],
  ]);
  const premium = premiums.get(storageCapacityGb);
  if (premium === undefined)
    throw new Error(`Unsupported rich catalog storage: ${String(storageCapacityGb)}`);
  return premium;
}

function storageLabel(storageCapacityGb: number): string {
  if (storageCapacityGb === 1024) return '1 TB';
  if (storageCapacityGb === 2048) return '2 TB';
  return `${String(storageCapacityGb)} GB`;
}

function cosmeticNotes(grade: RichConditionGrade): string {
  if (grade === 'A') return 'Ngoại hình đẹp, có dấu sử dụng rất nhẹ khi soi gần.';
  if (grade === 'B') return 'Khung có vài vết xước nhỏ, màn hình và chức năng hoạt động tốt.';
  return 'Có vết sử dụng nhìn thấy rõ nhưng không ảnh hưởng chức năng đã kiểm định.';
}

function roundMoney(value: bigint): bigint {
  return (value / 10_000n) * 10_000n;
}

function isPositiveMoney(value: string): boolean {
  return /^[1-9]\d*$/.test(value);
}

function isNonNegativeMoney(value: string): boolean {
  return /^(0|[1-9]\d*)$/.test(value);
}

function expectCount(errors: string[], name: string, actual: number, expected: number): void {
  if (actual !== expected)
    errors.push(`Expected ${String(expected)} ${name}; received ${String(actual)}`);
}

function expectUniqueCount(
  errors: string[],
  name: string,
  uniqueCount: number,
  totalCount: number,
): void {
  if (uniqueCount !== totalCount) errors.push(`Expected unique ${name}; received duplicates`);
}

function addUnique(errors: string[], values: Set<string>, value: string, name: string): void {
  if (values.has(value)) errors.push(`Duplicate ${name}: ${value}`);
  values.add(value);
}
