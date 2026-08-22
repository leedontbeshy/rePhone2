import { Prisma, type PrismaClient } from '../src/generated/prisma/client.js';
import { IdentifierCodec } from '../src/modules/inventory/identifier-protection.js';
import {
  DEMO_CATALOG_ASSETS,
  LEGACY_DEMO_CATALOG_OBJECT_PATHS,
  type DemoCatalogAssetKey,
} from './demo-catalog-assets.js';

const PASSED_CHECK_KEYS = [
  'DISPLAY',
  'TOUCHSCREEN',
  'FRONT_CAMERA',
  'REAR_CAMERA',
  'FACE_ID_TOUCH_ID',
  'SPEAKER',
  'MICROPHONE',
  'BUTTONS',
  'VIBRATION_HAPTICS',
  'WIFI',
  'BLUETOOTH',
  'CELLULAR',
  'CHARGING_PORT',
  'WIRELESS_CHARGING',
  'BATTERY_FUNCTION',
  'GPS_LOCATION',
  'SENSORS',
  'CONNECTORS_OTHER',
] as const;

const PRODUCTS = [
  {
    slug: 'iphone-13',
    type: 'IPHONE' as const,
    name: 'iPhone 13',
    description: 'iPhone cũ được kiểm định minh bạch theo checklist rePhone.',
    releaseYear: 2021,
    chipset: 'Apple A15 Bionic',
    ramGb: 4,
    screenSizeInches: '6.10',
  },
  {
    slug: 'iphone-14-pro',
    type: 'IPHONE' as const,
    name: 'iPhone 14 Pro',
    description: 'iPhone 14 Pro cũ, ảnh thật từng máy và bảo hành rõ ràng.',
    releaseYear: 2022,
    chipset: 'Apple A16 Bionic',
    ramGb: 6,
    screenSizeInches: '6.10',
  },
  {
    slug: 'iphone-15-pro-max',
    type: 'IPHONE' as const,
    name: 'iPhone 15 Pro Max',
    description: 'iPhone 15 Pro Max cũ đã hoàn tất kiểm định đầu vào.',
    releaseYear: 2023,
    chipset: 'Apple A17 Pro',
    ramGb: 8,
    screenSizeInches: '6.70',
  },
  {
    slug: 'cap-usb-c-to-lightning',
    type: 'ACCESSORY' as const,
    name: 'Cáp USB-C to Lightning',
    description: 'Cáp sạc USB-C to Lightning cho iPhone.',
  },
  {
    slug: 'op-lung-magsafe',
    type: 'ACCESSORY' as const,
    name: 'Ốp lưng MagSafe',
    description: 'Ốp lưng tương thích MagSafe.',
  },
  {
    slug: 'cu-sac-usb-c-20w',
    type: 'ACCESSORY' as const,
    name: 'Củ sạc USB-C 20W',
    description: 'Củ sạc USB-C công suất 20W.',
  },
] as const;

const IPHONE_VARIANTS = [
  {
    productSlug: 'iphone-13',
    sku: 'IP13-128-MID',
    displayName: '128 GB Midnight',
    storageCapacityGb: 128,
    colorName: 'Midnight',
    colorHex: '#1F2428',
  },
  {
    productSlug: 'iphone-13',
    sku: 'IP13-128-BLU',
    displayName: '128 GB Blue',
    storageCapacityGb: 128,
    colorName: 'Blue',
    colorHex: '#276787',
  },
  {
    productSlug: 'iphone-14-pro',
    sku: 'IP14P-128-BLK',
    displayName: '128 GB Space Black',
    storageCapacityGb: 128,
    colorName: 'Space Black',
    colorHex: '#3B3B3D',
  },
  {
    productSlug: 'iphone-14-pro',
    sku: 'IP14P-256-BLK',
    displayName: '256 GB Space Black',
    storageCapacityGb: 256,
    colorName: 'Space Black',
    colorHex: '#3B3B3D',
  },
  {
    productSlug: 'iphone-15-pro-max',
    sku: 'IP15PM-256-NAT',
    displayName: '256 GB Natural Titanium',
    storageCapacityGb: 256,
    colorName: 'Natural Titanium',
    colorHex: '#B5A99B',
  },
] as const;

const ACCESSORY_VARIANTS = [
  {
    productSlug: 'cap-usb-c-to-lightning',
    sku: 'ACC-CABLE-USBC-LTG-1M',
    displayName: 'Dài 1 mét',
    salePrice: '390000',
    compareAtPrice: '450000',
    attributes: { connector: 'USB-C to Lightning', material: 'TPE', length: '1m' },
    storeQuantity: 20,
    warehouseQuantity: 8,
  },
  {
    productSlug: 'op-lung-magsafe',
    sku: 'ACC-CASE-MAGSAFE-CLR',
    displayName: 'Trong suốt',
    salePrice: '590000',
    compareAtPrice: '690000',
    colorName: 'Trong suốt',
    colorHex: '#FFFFFF',
    attributes: { compatibility: ['iPhone 13', 'iPhone 14'], material: 'Polycarbonate' },
    storeQuantity: 12,
    warehouseQuantity: 4,
  },
  {
    productSlug: 'cu-sac-usb-c-20w',
    sku: 'ACC-CHARGER-USBC-20W',
    displayName: '20W màu trắng',
    salePrice: '490000',
    compareAtPrice: '590000',
    colorName: 'Trắng',
    colorHex: '#FFFFFF',
    attributes: { connector: 'USB-C', powerWatts: 20, compatibility: ['iPhone'] },
    storeQuantity: 15,
    warehouseQuantity: 6,
  },
] as const;

const IPHONE_UNITS = [
  {
    sku: 'IP13-128-MID',
    productSlug: 'iphone-13',
    inventoryCode: 'IP13-MID-001',
    serial: 'RPH13MID001',
    locationCode: 'HCM-STORE-01',
    salePrice: '10990000',
    compareAtPrice: '11990000',
    conditionGrade: 'A' as const,
    batteryHealthPercent: 91,
    batteryCycleCount: 421,
    modelNumber: 'MLPF3VN/A',
    regionCode: 'VN/A',
  },
  {
    sku: 'IP13-128-BLU',
    productSlug: 'iphone-13',
    inventoryCode: 'IP13-BLU-001',
    serial: 'RPH13BLU001',
    locationCode: 'HCM-WH-01',
    salePrice: '9990000',
    compareAtPrice: '10990000',
    conditionGrade: 'B' as const,
    batteryHealthPercent: 87,
    batteryCycleCount: 566,
    modelNumber: 'MLPK3VN/A',
    regionCode: 'VN/A',
  },
  {
    sku: 'IP14P-128-BLK',
    productSlug: 'iphone-14-pro',
    inventoryCode: 'IP14P-128-001',
    serial: 'RPH14P12801',
    locationCode: 'HCM-STORE-01',
    salePrice: '16490000',
    compareAtPrice: '17990000',
    conditionGrade: 'A' as const,
    batteryHealthPercent: 93,
    batteryCycleCount: 318,
    modelNumber: 'MQ0F3VN/A',
    regionCode: 'VN/A',
  },
  {
    sku: 'IP14P-256-BLK',
    productSlug: 'iphone-14-pro',
    inventoryCode: 'IP14P-256-001',
    serial: 'RPH14P25601',
    locationCode: 'HCM-WH-01',
    salePrice: '17990000',
    compareAtPrice: '19490000',
    conditionGrade: 'B' as const,
    batteryHealthPercent: 88,
    batteryCycleCount: 491,
    modelNumber: 'MQ1F3VN/A',
    regionCode: 'VN/A',
  },
  {
    sku: 'IP15PM-256-NAT',
    productSlug: 'iphone-15-pro-max',
    inventoryCode: 'IP15PM-256-001',
    serial: 'RPH15PM2561',
    locationCode: 'HCM-STORE-01',
    salePrice: '25490000',
    compareAtPrice: '27990000',
    conditionGrade: 'A' as const,
    batteryHealthPercent: 96,
    batteryCycleCount: 207,
    modelNumber: 'MU663VN/A',
    regionCode: 'VN/A',
  },
] as const;

export async function seedPublicCatalog(prisma: PrismaClient): Promise<void> {
  const identifierCodec = new IdentifierCodec(
    requiredEnvironment('IDENTIFIER_ENCRYPTION_KEY'),
    requiredEnvironment('IDENTIFIER_HMAC_KEY'),
  );
  const publicBucket = requiredEnvironment('SUPABASE_PUBLIC_BUCKET');
  await prisma.productMedia.deleteMany({
    where: {
      bucket: publicBucket,
      objectPath: { in: LEGACY_DEMO_CATALOG_OBJECT_PATHS },
    },
  });
  const iphonePolicy = await prisma.warrantyPolicy.findUniqueOrThrow({
    where: { code: 'IPHONE-90D' },
  });
  const accessoryPolicy = await prisma.warrantyPolicy.findUniqueOrThrow({
    where: { code: 'ACCESSORY-30D' },
  });
  const employee = await prisma.user.findUniqueOrThrow({
    where: { normalizedEmail: normalizeEmail(requiredEnvironment('SEED_EMPLOYEE_EMAIL')) },
  });
  const store = await prisma.inventoryLocation.findUniqueOrThrow({
    where: { code: 'HCM-STORE-01' },
  });
  const warehouse = await prisma.inventoryLocation.findUniqueOrThrow({
    where: { code: 'HCM-WH-01' },
  });

  const products = new Map<string, { id: string; name: string }>();
  for (const definition of PRODUCTS) {
    const isIphone = definition.type === 'IPHONE';
    const product = await prisma.product.upsert({
      where: { slug: definition.slug },
      update: {
        type: definition.type,
        brand: 'Apple',
        name: definition.name,
        description: definition.description,
        status: 'ACTIVE',
        archivedAt: null,
        releaseYear: 'releaseYear' in definition ? definition.releaseYear : null,
        chipset: 'chipset' in definition ? definition.chipset : null,
        ramGb: 'ramGb' in definition ? definition.ramGb : null,
        screenSizeInches: 'screenSizeInches' in definition ? definition.screenSizeInches : null,
        warrantyPolicyId: isIphone ? iphonePolicy.id : accessoryPolicy.id,
      },
      create: {
        slug: definition.slug,
        type: definition.type,
        brand: 'Apple',
        name: definition.name,
        description: definition.description,
        status: 'ACTIVE',
        releaseYear: 'releaseYear' in definition ? definition.releaseYear : null,
        chipset: 'chipset' in definition ? definition.chipset : null,
        ramGb: 'ramGb' in definition ? definition.ramGb : null,
        screenSizeInches: 'screenSizeInches' in definition ? definition.screenSizeInches : null,
        warrantyPolicyId: isIphone ? iphonePolicy.id : accessoryPolicy.id,
      },
    });
    products.set(definition.slug, product);
    await upsertMedia(prisma, {
      publicBucket,
      productId: product.id,
      objectPath: `demo/catalog/products/${definition.slug}.png`,
      assetKey: definition.slug,
      altText: definition.name,
    });
  }

  const variants = new Map<string, { id: string; displayName: string }>();
  for (const definition of IPHONE_VARIANTS) {
    const product = requiredMapValue(products, definition.productSlug);
    const variant = await prisma.productVariant.upsert({
      where: { sku: definition.sku },
      update: {
        productId: product.id,
        displayName: definition.displayName,
        storageCapacityGb: definition.storageCapacityGb,
        colorName: definition.colorName,
        colorHex: definition.colorHex,
        inventoryMode: 'SERIALIZED',
        salePrice: null,
        compareAtPrice: null,
        accessoryAttributes: Prisma.DbNull,
        warrantyPolicyId: iphonePolicy.id,
        status: 'ACTIVE',
        archivedAt: null,
      },
      create: {
        productId: product.id,
        sku: definition.sku,
        displayName: definition.displayName,
        storageCapacityGb: definition.storageCapacityGb,
        colorName: definition.colorName,
        colorHex: definition.colorHex,
        inventoryMode: 'SERIALIZED',
        warrantyPolicyId: iphonePolicy.id,
        status: 'ACTIVE',
      },
    });
    variants.set(definition.sku, variant);
  }

  for (const definition of ACCESSORY_VARIANTS) {
    const product = requiredMapValue(products, definition.productSlug);
    const variant = await prisma.productVariant.upsert({
      where: { sku: definition.sku },
      update: {
        productId: product.id,
        displayName: definition.displayName,
        storageCapacityGb: null,
        colorName: 'colorName' in definition ? definition.colorName : null,
        colorHex: 'colorHex' in definition ? definition.colorHex : null,
        inventoryMode: 'QUANTITY',
        salePrice: definition.salePrice,
        compareAtPrice: definition.compareAtPrice,
        accessoryAttributes: definition.attributes,
        warrantyPolicyId: accessoryPolicy.id,
        status: 'ACTIVE',
        archivedAt: null,
      },
      create: {
        productId: product.id,
        sku: definition.sku,
        displayName: definition.displayName,
        colorName: 'colorName' in definition ? definition.colorName : null,
        colorHex: 'colorHex' in definition ? definition.colorHex : null,
        inventoryMode: 'QUANTITY',
        salePrice: definition.salePrice,
        compareAtPrice: definition.compareAtPrice,
        accessoryAttributes: definition.attributes,
        warrantyPolicyId: accessoryPolicy.id,
        status: 'ACTIVE',
      },
    });
    variants.set(definition.sku, variant);
    await upsertMedia(prisma, {
      publicBucket,
      variantId: variant.id,
      objectPath: `demo/catalog/variants/${definition.sku.toLowerCase()}.png`,
      assetKey: definition.productSlug,
      altText: `${product.name} ${definition.displayName}`,
    });
    await seedStock(prisma, {
      variantId: variant.id,
      locationId: store.id,
      locationCode: store.code,
      quantity: definition.storeQuantity,
      movementId: movementId(definition.sku, 'STORE'),
      employeeId: employee.id,
    });
    await seedStock(prisma, {
      variantId: variant.id,
      locationId: warehouse.id,
      locationCode: warehouse.code,
      quantity: definition.warehouseQuantity,
      movementId: movementId(definition.sku, 'WAREHOUSE'),
      employeeId: employee.id,
    });
  }

  for (const [index, definition] of IPHONE_UNITS.entries()) {
    const variant = requiredMapValue(variants, definition.sku);
    const location =
      definition.locationCode === store.code
        ? store
        : definition.locationCode === warehouse.code
          ? warehouse
          : null;
    if (location === null) {
      throw new Error(`Unknown catalog seed location ${definition.locationCode}`);
    }
    const protectedSerial = identifierCodec.protect('SERIAL', definition.serial);
    const unit = await prisma.inventoryUnit.upsert({
      where: { inventoryCode: definition.inventoryCode },
      update: {
        variantId: variant.id,
        modelNumber: definition.modelNumber,
        regionCode: definition.regionCode,
        simLockStatus: 'UNLOCKED',
        carrierName: null,
        simConfiguration: 'PHYSICAL_AND_ESIM',
        serialEncrypted: protectedSerial.encrypted,
        serialHmac: protectedSerial.hmac,
        serialSuffix: protectedSerial.suffix,
        identifierKeyVersion: 1,
        salePrice: definition.salePrice,
        compareAtPrice: definition.compareAtPrice,
        warrantyDaysOverride: null,
      },
      create: {
        variantId: variant.id,
        locationId: location.id,
        inventoryCode: definition.inventoryCode,
        modelNumber: definition.modelNumber,
        regionCode: definition.regionCode,
        simLockStatus: 'UNLOCKED',
        simConfiguration: 'PHYSICAL_AND_ESIM',
        serialEncrypted: protectedSerial.encrypted,
        serialHmac: protectedSerial.hmac,
        serialSuffix: protectedSerial.suffix,
        identifierKeyVersion: 1,
        lifecycleStatus: 'AVAILABLE',
        salePrice: definition.salePrice,
        compareAtPrice: definition.compareAtPrice,
      },
    });
    await upsertMedia(prisma, {
      publicBucket,
      inventoryUnitId: unit.id,
      objectPath: `demo/catalog/units/${definition.inventoryCode.toLowerCase()}.png`,
      assetKey: definition.productSlug,
      altText: `${variant.displayName} — ${definition.inventoryCode}`,
    });
    const existingInspection = await prisma.inventoryInspection.findUnique({
      where: { id: inspectionId(index) },
      select: { id: true },
    });
    if (existingInspection === null) {
      await prisma.inventoryInspection.create({
        data: {
          id: inspectionId(index),
          inventoryUnitId: unit.id,
          inspectionType: 'INTAKE',
          status: 'COMPLETED',
          batteryHealthPercent: definition.batteryHealthPercent,
          batteryCycleCount: definition.batteryCycleCount,
          batteryReplacementStatus: 'ORIGINAL',
          conditionGrade: definition.conditionGrade,
          cosmeticNotes:
            definition.conditionGrade === 'A'
              ? 'Ngoại hình đẹp, có vết sử dụng rất nhẹ.'
              : 'Có vết xước nhẹ ở khung, không ảnh hưởng chức năng.',
          checks: passedChecks(),
          repairHistoryStatus: 'NONE_KNOWN',
          repairNotes: null,
          replacedParts: Prisma.DbNull,
          overallResult: 'PASSED',
          inspectorId: employee.id,
          inspectedAt: new Date('2026-08-20T03:00:00.000Z'),
          isCurrent: true,
        },
      });
    }
  }

  await seedHiddenCatalogRows(prisma, iphonePolicy.id, store.id);
}

async function seedHiddenCatalogRows(
  prisma: PrismaClient,
  iphonePolicyId: string,
  storeLocationId: string,
): Promise<void> {
  const draft = await prisma.product.upsert({
    where: { slug: 'iphone-demo-draft' },
    update: { name: 'iPhone Demo Draft', type: 'IPHONE', status: 'DRAFT', archivedAt: null },
    create: { slug: 'iphone-demo-draft', name: 'iPhone Demo Draft', type: 'IPHONE' },
  });
  const variant = await prisma.productVariant.upsert({
    where: { sku: 'IP13-RECEIVED-DEMO' },
    update: {
      productId: draft.id,
      displayName: 'Received demo',
      inventoryMode: 'SERIALIZED',
      warrantyPolicyId: iphonePolicyId,
      status: 'DRAFT',
    },
    create: {
      productId: draft.id,
      sku: 'IP13-RECEIVED-DEMO',
      displayName: 'Received demo',
      inventoryMode: 'SERIALIZED',
      warrantyPolicyId: iphonePolicyId,
      status: 'DRAFT',
    },
  });
  await prisma.inventoryUnit.upsert({
    where: { inventoryCode: 'IP13-RECEIVED-001' },
    update: {
      variantId: variant.id,
    },
    create: {
      variantId: variant.id,
      locationId: storeLocationId,
      inventoryCode: 'IP13-RECEIVED-001',
      lifecycleStatus: 'RECEIVED',
    },
  });
}

async function upsertMedia(
  prisma: PrismaClient,
  input: {
    publicBucket: string;
    objectPath: string;
    assetKey: DemoCatalogAssetKey;
    altText: string;
    productId?: string;
    variantId?: string;
    inventoryUnitId?: string;
  },
): Promise<void> {
  const asset = DEMO_CATALOG_ASSETS[input.assetKey];
  const owner = {
    ...(input.productId === undefined ? {} : { productId: input.productId }),
    ...(input.variantId === undefined ? {} : { variantId: input.variantId }),
    ...(input.inventoryUnitId === undefined ? {} : { inventoryUnitId: input.inventoryUnitId }),
  };
  await prisma.productMedia.upsert({
    where: { bucket_objectPath: { bucket: input.publicBucket, objectPath: input.objectPath } },
    update: {
      ...owner,
      visibility: 'PUBLIC',
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      fileSize: asset.fileSize,
      sortOrder: 0,
      altText: input.altText,
    },
    create: {
      ...owner,
      bucket: input.publicBucket,
      objectPath: input.objectPath,
      visibility: 'PUBLIC',
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      fileSize: asset.fileSize,
      sortOrder: 0,
      altText: input.altText,
    },
  });
}

async function seedStock(
  prisma: PrismaClient,
  input: {
    variantId: string;
    locationId: string;
    locationCode: string;
    quantity: number;
    movementId: string;
    employeeId: string;
  },
): Promise<void> {
  const stockLevel = await prisma.stockLevel.findUnique({
    where: {
      variantId_locationId: { variantId: input.variantId, locationId: input.locationId },
    },
    select: { id: true },
  });
  if (stockLevel === null) {
    await prisma.stockLevel.create({
      data: {
        variantId: input.variantId,
        locationId: input.locationId,
        quantityOnHand: input.quantity,
        quantityReserved: 0,
      },
    });
  }
  const movement = await prisma.stockMovement.findUnique({
    where: { id: input.movementId },
    select: { id: true },
  });
  if (movement === null) {
    await prisma.stockMovement.create({
      data: {
        id: input.movementId,
        variantId: input.variantId,
        toLocationId: input.locationId,
        type: 'RECEIPT',
        quantity: input.quantity,
        referenceType: 'DEMO_SEED',
        reason: `Tồn demo ban đầu tại ${input.locationCode}`,
        createdById: input.employeeId,
      },
    });
  }
}

function passedChecks(): Prisma.InputJsonObject {
  return {
    schemaVersion: 1,
    items: Object.fromEntries(
      PASSED_CHECK_KEYS.map((key) => [key, { status: 'PASS', note: null }]),
    ),
  };
}

function inspectionId(index: number): string {
  return `0198e4f0-7d16-7c1a-a2bd-39bc2a0f68${(index + 1).toString().padStart(2, '0')}`;
}

function movementId(sku: string, location: 'STORE' | 'WAREHOUSE'): string {
  const movementIds: Record<string, string> = {
    'ACC-CABLE-USBC-LTG-1M:STORE': '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6901',
    'ACC-CABLE-USBC-LTG-1M:WAREHOUSE': '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6902',
    'ACC-CASE-MAGSAFE-CLR:STORE': '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6903',
    'ACC-CASE-MAGSAFE-CLR:WAREHOUSE': '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6904',
    'ACC-CHARGER-USBC-20W:STORE': '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6905',
    'ACC-CHARGER-USBC-20W:WAREHOUSE': '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6906',
  };
  const id = movementIds[`${sku}:${location}`];
  if (id === undefined) {
    throw new Error(`Missing deterministic movement id for ${sku}:${location}`);
  }
  return id;
}

function requiredMapValue<T>(map: Map<string, T>, key: string): T {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`Missing catalog seed dependency ${key}`);
  }
  return value;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for catalog seed`);
  }
  return value;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
