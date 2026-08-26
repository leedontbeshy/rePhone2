import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { IdentifierCodec } from '../../src/modules/inventory/identifier-protection.js';
import {
  RICH_AVAILABLE_UNITS,
  RICH_IPHONE_VARIANTS,
  validateRichCatalogData,
} from '../rich-catalog-data.js';
import { RICH_CATALOG_ASSETS, validateRichCatalogAssets } from '../rich-catalog-assets.js';

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const MIGRATIONS_DIRECTORY = resolve(WORKSPACE_ROOT, 'apps/api/prisma/migrations');
const RUN_JOURNAL_DIRECTORY = resolve(WORKSPACE_ROOT, '.local/rich-catalog/runs');
const EXPECTED_AVAILABLE_UNITS = 96;
const EXPECTED_PLACEHOLDER_VARIANTS = 44;
const UNIT_BATCH_SIZE = 12;
const STORAGE_CONCURRENCY = 4;
const STORAGE_TIMEOUT_MS = 20_000;
const TRANSACTION_LOCK_NAME = 'rephone-rich-catalog-v1';
const INSPECTED_AT = new Date('2026-08-26T03:00:00.000Z');
const BASELINE_REAL_VARIANT_PRODUCT_SLUGS = new Set([
  'iphone-13',
  'iphone-14-pro',
  'iphone-15-pro-max',
]);
const LEGACY_MODEL_MEDIA = [
  {
    productSlug: 'iphone-13',
    objectPath: 'demo/catalog/products/iphone-13.png',
    fileSize: 1_421_042,
    altText: 'iPhone 13',
  },
  {
    productSlug: 'iphone-14-pro',
    objectPath: 'demo/catalog/products/iphone-14-pro.png',
    fileSize: 1_109_472,
    altText: 'iPhone 14 Pro',
  },
  {
    productSlug: 'iphone-15-pro-max',
    objectPath: 'demo/catalog/products/iphone-15-pro-max.png',
    fileSize: 1_611_610,
    altText: 'iPhone 15 Pro Max',
  },
] as const;
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

type RichUnit = (typeof RICH_AVAILABLE_UNITS)[number];
type RichAsset = (typeof RICH_CATALOG_ASSETS)[number];
type StorageClient = ReturnType<typeof createClient>;

interface RuntimeConfiguration {
  connectionString: string;
  directConnectionString: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  publicBucket: string;
  identifierEncryptionKey: string;
  identifierHmacKey: string;
  employeeEmail: string;
  apiPublicUrl?: string;
  nodeEnvironment: string;
}

interface SafeTarget {
  fingerprint: string;
  confirmation: string;
}

interface LocalAsset {
  definition: RichAsset;
  absolutePath: string;
  bytes: Buffer;
}

interface StoragePlan {
  existing: LocalAsset[];
  missing: LocalAsset[];
}

interface DatabasePlan {
  variantsToCreate: number;
  variantsToReuse: number;
  unitsToCreate: number;
  unitsToReuse: number;
  placeholderState: 'PRESENT' | 'ABSENT';
  placeholderFingerprint: string;
}

interface ProvisionResult {
  variantsCreated: number;
  variantsReused: number;
  unitsCreated: number;
  unitsReused: number;
  storageUploaded: number;
  storageReused: number;
  placeholdersDeleted: number;
  legacyMediaReordered: number;
}

interface PlaceholderInspection {
  state: 'PRESENT' | 'ABSENT';
  ids: string[];
  fingerprint: string;
}

interface MigrationRecord {
  migrationName: string;
  finishedAt: Date | null;
  rolledBackAt: Date | null;
}

class RichCatalogProvisionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RichCatalogProvisionError';
  }
}

export async function provisionRichCatalog(): Promise<void> {
  loadWorkspaceEnvironment();
  const configuration = readRuntimeConfiguration();
  const target = deriveAndValidateTarget(configuration);
  const explicitDryRun = process.argv.slice(2).includes('--dry-run');
  const suppliedConfirmation = process.env['RICH_CATALOG_CONFIRM']?.trim();
  if (
    suppliedConfirmation !== undefined &&
    suppliedConfirmation.length > 0 &&
    suppliedConfirmation !== target.confirmation
  ) {
    throw new RichCatalogProvisionError(
      'RICH_CATALOG_CONFIRM does not match the currently configured target fingerprint.',
    );
  }
  const applyChanges = !explicitDryRun && suppliedConfirmation === target.confirmation;

  validateStaticManifests();
  const localAssets = await loadAndValidateLocalAssets();
  const storage = createStorageClient(configuration);
  await assertPublicBucket(storage, configuration.publicBucket);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: configuration.connectionString }),
  });
  try {
    await assertMigrationsReady(prisma);
    const identifierCodec = new IdentifierCodec(
      configuration.identifierEncryptionKey,
      configuration.identifierHmacKey,
    );
    const [storagePlan, databasePlan] = await Promise.all([
      inspectStoragePlan(storage, configuration.publicBucket, localAssets),
      inspectDatabasePlan(
        prisma,
        configuration.publicBucket,
        configuration.employeeEmail,
        identifierCodec,
      ),
    ]);

    writeSafeEvent({
      status: applyChanges ? 'confirmed' : 'dry-run',
      targetFingerprint: target.fingerprint,
      data: {
        variants: RICH_IPHONE_VARIANTS.length,
        availableUnits: RICH_AVAILABLE_UNITS.length,
        assets: RICH_CATALOG_ASSETS.length,
      },
      plan: {
        storageUpload: storagePlan.missing.length,
        storageReuse: storagePlan.existing.length,
        variantsCreate: databasePlan.variantsToCreate,
        variantsReuse: databasePlan.variantsToReuse,
        unitsCreate: databasePlan.unitsToCreate,
        unitsReuse: databasePlan.unitsToReuse,
        placeholderState: databasePlan.placeholderState,
        placeholderFingerprint: databasePlan.placeholderFingerprint,
      },
      ...(applyChanges ? {} : { applyWith: target.confirmation }),
    });

    if (!applyChanges) return;

    await uploadMissingAssets(storage, configuration.publicBucket, storagePlan.missing);
    const master = await provisionMasterData(prisma, configuration.publicBucket);
    const units = await provisionAvailableUnits(
      prisma,
      configuration.publicBucket,
      configuration.employeeEmail,
      identifierCodec,
    );
    await postflight(
      prisma,
      configuration.publicBucket,
      storage,
      localAssets,
      configuration.apiPublicUrl,
    );

    const result: ProvisionResult = {
      variantsCreated: master.created,
      variantsReused: master.reused,
      unitsCreated: units.created,
      unitsReused: units.reused,
      storageUploaded: storagePlan.missing.length,
      storageReused: storagePlan.existing.length,
      placeholdersDeleted: master.placeholdersDeleted,
      legacyMediaReordered: master.legacyMediaReordered,
    };
    await writeRunJournal(target.fingerprint, result);
    writeSafeEvent({ status: 'completed', targetFingerprint: target.fingerprint, result });
  } finally {
    await prisma.$disconnect();
  }
}

function readRuntimeConfiguration(): RuntimeConfiguration {
  const nodeEnvironment = requiredEnvironment('NODE_ENV');
  const apiPublicUrl = optionalEnvironment('API_PUBLIC_URL');
  if (nodeEnvironment === 'production') {
    throw new RichCatalogProvisionError(
      'Rich catalog provisioning is disabled when NODE_ENV=production.',
    );
  }
  return {
    connectionString: requiredEnvironment('DATABASE_URL'),
    directConnectionString: requiredEnvironment('DIRECT_URL'),
    supabaseUrl: requiredEnvironment('SUPABASE_URL'),
    serviceRoleKey: requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    publicBucket: requiredEnvironment('SUPABASE_PUBLIC_BUCKET'),
    identifierEncryptionKey: requiredEnvironment('IDENTIFIER_ENCRYPTION_KEY'),
    identifierHmacKey: requiredEnvironment('IDENTIFIER_HMAC_KEY'),
    employeeEmail: requiredEnvironment('SEED_EMPLOYEE_EMAIL').toLowerCase(),
    ...(apiPublicUrl === undefined ? {} : { apiPublicUrl }),
    nodeEnvironment,
  };
}

function deriveAndValidateTarget(configuration: RuntimeConfiguration): SafeTarget {
  const databaseUrl = parseUrl(configuration.connectionString, 'DATABASE_URL');
  const directUrl = parseUrl(configuration.directConnectionString, 'DIRECT_URL');
  const storageUrl = parseUrl(configuration.supabaseUrl, 'SUPABASE_URL');
  for (const [name, url] of [
    ['DATABASE_URL', databaseUrl],
    ['DIRECT_URL', directUrl],
  ] as const) {
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !isOfficialSupabaseDatabaseHost(url.hostname)
    ) {
      throw new RichCatalogProvisionError(`${name} is not an official Supabase PostgreSQL target.`);
    }
    const schema = url.searchParams.get('schema') ?? 'public';
    if (schema !== 'public') {
      throw new RichCatalogProvisionError(`${name} must target the public schema.`);
    }
  }
  if (storageUrl.protocol !== 'https:' || !storageUrl.hostname.endsWith('.supabase.co')) {
    throw new RichCatalogProvisionError('SUPABASE_URL is not an official HTTPS Supabase target.');
  }
  const storageProjectReference = storageUrl.hostname.split('.')[0] ?? '';
  const databaseProjectReference = supabaseProjectReference(databaseUrl);
  const directProjectReference = supabaseProjectReference(directUrl);
  if (
    storageProjectReference.length === 0 ||
    databaseProjectReference !== storageProjectReference ||
    directProjectReference !== storageProjectReference
  ) {
    throw new RichCatalogProvisionError(
      'DATABASE_URL, DIRECT_URL and SUPABASE_URL do not resolve to the same Supabase project.',
    );
  }
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ''));
  const directDatabaseName = decodeURIComponent(directUrl.pathname.replace(/^\//, ''));
  if (databaseName.length === 0 || databaseName !== directDatabaseName) {
    throw new RichCatalogProvisionError(
      'DATABASE_URL and DIRECT_URL do not resolve to the same database.',
    );
  }
  const canonical = [storageProjectReference, databaseName, 'public', configuration.publicBucket]
    .join('|')
    .toLowerCase();
  const fingerprint = sha256(Buffer.from(canonical)).slice(0, 12);
  return {
    fingerprint,
    confirmation: `provision-rich-catalog:${fingerprint}`,
  };
}

function validateStaticManifests(): void {
  const errors = [...validateRichCatalogData(), ...validateRichCatalogAssets()];
  if (RICH_AVAILABLE_UNITS.length !== EXPECTED_AVAILABLE_UNITS) {
    errors.push(
      `rich catalog must define exactly ${EXPECTED_AVAILABLE_UNITS.toString()} AVAILABLE units`,
    );
  }
  const variantSkus = new Set(RICH_IPHONE_VARIANTS.map(({ sku }) => sku));
  const assetsByKey = new Map(RICH_CATALOG_ASSETS.map((asset) => [asset.key, asset]));
  const productSlugs = new Set(RICH_IPHONE_VARIANTS.map(({ productSlug }) => productSlug));
  const productAssets = new Map<string, RichAsset[]>();
  const digestOwners = new Map<string, string>();

  for (const asset of RICH_CATALOG_ASSETS) {
    const previousOwner = digestOwners.get(asset.sha256);
    if (previousOwner !== undefined) {
      errors.push(`asset ${asset.key} duplicates content from ${previousOwner}`);
    } else {
      digestOwners.set(asset.sha256, asset.key);
    }
    if (asset.owner.type === 'PRODUCT') {
      const owned = productAssets.get(asset.owner.productSlug) ?? [];
      owned.push(asset);
      productAssets.set(asset.owner.productSlug, owned);
    }
  }

  for (const slug of productSlugs) {
    const covers = (productAssets.get(slug) ?? []).filter(({ sortOrder }) => sortOrder === 0);
    if (covers.length !== 1) {
      errors.push(`product ${slug} must have exactly one rich cover with sortOrder 0`);
    }
  }
  for (const unit of RICH_AVAILABLE_UNITS) {
    if (!variantSkus.has(unit.sku))
      errors.push(`unit ${unit.inventoryCode} references unknown SKU`);
    const primaryAsset = assetsByKey.get(unit.imageAssetKey);
    if (
      primaryAsset === undefined ||
      primaryAsset.owner.type !== 'UNIT' ||
      primaryAsset.owner.inventoryCode !== unit.inventoryCode
    ) {
      errors.push(`unit ${unit.inventoryCode} has no matching primary image asset`);
    }
  }
  const expectedPlaceholders = expectedPlaceholderPairs();
  if (expectedPlaceholders.length !== EXPECTED_PLACEHOLDER_VARIANTS) {
    errors.push(
      `rich variants imply ${expectedPlaceholders.length.toString()} placeholders; expected ${EXPECTED_PLACEHOLDER_VARIANTS.toString()}`,
    );
  }
  if (errors.length > 0) {
    throw new RichCatalogProvisionError(
      `Rich catalog manifests are invalid (${errors.length.toString()} issue(s)); first: ${errors[0] ?? 'unknown'}.`,
    );
  }
}

async function loadAndValidateLocalAssets(): Promise<LocalAsset[]> {
  return mapWithConcurrency(RICH_CATALOG_ASSETS, STORAGE_CONCURRENCY, async (definition) => {
    const absolutePath = resolveManifestPath(definition.filePath);
    let bytes: Buffer;
    try {
      bytes = await readFile(absolutePath);
    } catch {
      throw new RichCatalogProvisionError(`Missing local rich asset ${definition.key}.`);
    }
    if (bytes.byteLength !== definition.fileSize || sha256(bytes) !== definition.sha256) {
      throw new RichCatalogProvisionError(
        `Local rich asset checksum mismatch for ${definition.key}.`,
      );
    }
    const metadata = await sharp(bytes, { failOn: 'error' }).metadata();
    if (metadata.width !== definition.width || metadata.height !== definition.height) {
      throw new RichCatalogProvisionError(
        `Local rich asset dimensions mismatch for ${definition.key}.`,
      );
    }
    const detectedMime = sharpFormatToMime(metadata.format);
    if (detectedMime !== definition.mimeType) {
      throw new RichCatalogProvisionError(`Local rich asset MIME mismatch for ${definition.key}.`);
    }
    return { definition, absolutePath, bytes };
  });
}

function createStorageClient(configuration: RuntimeConfiguration): StorageClient {
  return createClient(new URL(configuration.supabaseUrl).origin, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function assertPublicBucket(storage: StorageClient, bucket: string): Promise<void> {
  const { data, error } = await storage.storage.getBucket(bucket);
  if (error !== null || !data.public) {
    throw new RichCatalogProvisionError(
      'Configured catalog bucket is unavailable or is not public; no bucket settings were changed.',
    );
  }
}

async function inspectStoragePlan(
  storage: StorageClient,
  bucket: string,
  assets: readonly LocalAsset[],
): Promise<StoragePlan> {
  const results = await mapWithConcurrency(assets, STORAGE_CONCURRENCY, async (asset) => ({
    asset,
    exists: await verifyRemoteAsset(storage, bucket, asset, true),
  }));
  return {
    existing: results.filter(({ exists }) => exists).map(({ asset }) => asset),
    missing: results.filter(({ exists }) => !exists).map(({ asset }) => asset),
  };
}

async function uploadMissingAssets(
  storage: StorageClient,
  bucket: string,
  assets: readonly LocalAsset[],
): Promise<void> {
  await mapWithConcurrency(assets, STORAGE_CONCURRENCY, async (asset) => {
    let uploadedOrReused = false;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      let error: unknown = null;
      try {
        const result = await withTimeout(
          storage.storage.from(bucket).upload(asset.definition.objectPath, asset.bytes, {
            cacheControl: '31536000',
            contentType: asset.definition.mimeType,
            upsert: false,
          }),
          STORAGE_TIMEOUT_MS,
        );
        error = result.error;
      } catch {
        if (attempt < 3) {
          await delay(attempt === 1 ? 250 : 750);
          continue;
        }
        throw new RichCatalogProvisionError(
          `Storage upload failed for asset ${asset.definition.key}.`,
        );
      }
      const status = storageErrorStatus(error);
      if (error === null || status === 409) {
        uploadedOrReused = true;
        break;
      }
      if ((status === 429 || (status !== null && status >= 500)) && attempt < 3) {
        await delay(attempt === 1 ? 250 : 750);
        continue;
      }
      throw new RichCatalogProvisionError(
        `Storage upload failed for asset ${asset.definition.key}.`,
      );
    }
    if (!uploadedOrReused) {
      throw new RichCatalogProvisionError(
        `Storage upload failed for asset ${asset.definition.key}.`,
      );
    }
    const verified = await verifyRemoteAsset(storage, bucket, asset, false);
    if (!verified) {
      throw new RichCatalogProvisionError(
        `Storage verification failed after upload for asset ${asset.definition.key}.`,
      );
    }
  });
}

async function verifyRemoteAsset(
  storage: StorageClient,
  bucket: string,
  asset: LocalAsset,
  allowMissing: boolean,
): Promise<boolean> {
  const { folder, fileName } = splitObjectPath(asset.definition.objectPath);
  const listed = await withTimeout(
    storage.storage.from(bucket).list(folder, { limit: 100, search: fileName }),
    STORAGE_TIMEOUT_MS,
  );
  if (listed.error !== null) {
    throw new RichCatalogProvisionError(
      `Unable to inspect storage object for asset ${asset.definition.key}.`,
    );
  }
  const exists = listed.data.some(({ name }) => name === fileName);
  if (!exists) {
    if (allowMissing) return false;
    throw new RichCatalogProvisionError(
      `Storage object is missing after upload for asset ${asset.definition.key}.`,
    );
  }
  const { data, error } = await withTimeout(
    storage.storage.from(bucket).download(asset.definition.objectPath),
    STORAGE_TIMEOUT_MS,
  );
  if (error !== null) {
    throw new RichCatalogProvisionError(
      `Unable to verify storage object for asset ${asset.definition.key}.`,
    );
  }
  const remoteBytes = Buffer.from(await data.arrayBuffer());
  if (
    remoteBytes.byteLength !== asset.definition.fileSize ||
    sha256(remoteBytes) !== asset.definition.sha256
  ) {
    throw new RichCatalogProvisionError(
      `Existing storage object content conflicts with asset ${asset.definition.key}.`,
    );
  }
  return true;
}

async function inspectDatabasePlan(
  prisma: PrismaClient,
  publicBucket: string,
  employeeEmail: string,
  identifierCodec: IdentifierCodec,
): Promise<DatabasePlan> {
  await assertSeedDependencies(prisma, employeeEmail);
  const productSlugs = uniqueSorted(RICH_IPHONE_VARIANTS.map(({ productSlug }) => productSlug));
  const products = await prisma.product.findMany({
    where: { slug: { in: productSlugs } },
    select: {
      id: true,
      slug: true,
      type: true,
      status: true,
      archivedAt: true,
      warrantyPolicyId: true,
      warrantyPolicy: { select: { status: true, archivedAt: true } },
    },
  });
  const productBySlug = new Map(products.map((product) => [product.slug, product]));
  for (const slug of productSlugs) {
    const product = productBySlug.get(slug);
    if (
      product === undefined ||
      product.type !== 'IPHONE' ||
      product.status !== 'ACTIVE' ||
      product.archivedAt !== null ||
      product.warrantyPolicyId === null ||
      product.warrantyPolicy?.status !== 'ACTIVE' ||
      product.warrantyPolicy.archivedAt !== null
    ) {
      throw new RichCatalogProvisionError(`Missing valid baseline iPhone product for ${slug}.`);
    }
  }

  const existingVariants = await prisma.productVariant.findMany({
    where: { sku: { in: RICH_IPHONE_VARIANTS.map(({ sku }) => sku) } },
    select: {
      sku: true,
      productId: true,
      displayName: true,
      storageCapacityGb: true,
      colorName: true,
      colorHex: true,
      inventoryMode: true,
      warrantyPolicyId: true,
      status: true,
      archivedAt: true,
      product: { select: { status: true, archivedAt: true } },
    },
  });
  for (const variant of existingVariants) {
    const definition = RICH_IPHONE_VARIANTS.find(({ sku }) => sku === variant.sku);
    if (definition === undefined)
      throw new RichCatalogProvisionError('Unexpected rich variant row.');
    const product = requiredMapValue(productBySlug, definition.productSlug, 'product');
    if (
      variant.productId !== product.id ||
      variant.displayName !== definition.displayName ||
      variant.storageCapacityGb !== definition.storageCapacityGb ||
      variant.colorName !== definition.colorName ||
      variant.colorHex !== definition.colorHex ||
      variant.inventoryMode !== 'SERIALIZED' ||
      variant.warrantyPolicyId !== product.warrantyPolicyId ||
      variant.status !== 'ACTIVE' ||
      variant.archivedAt !== null ||
      variant.product.status !== 'ACTIVE' ||
      variant.product.archivedAt !== null
    ) {
      throw new RichCatalogProvisionError(`Variant collision detected for ${variant.sku}.`);
    }
  }

  const variantProductSlugBySku = new Map(
    RICH_IPHONE_VARIANTS.map(({ sku, productSlug }) => [sku, productSlug]),
  );
  const existingUnits = await prisma.inventoryUnit.findMany({
    where: {
      inventoryCode: { in: RICH_AVAILABLE_UNITS.map(({ inventoryCode }) => inventoryCode) },
    },
    select: {
      inventoryCode: true,
      lifecycleStatus: true,
      salePrice: true,
      serialHmac: true,
      variant: {
        select: {
          sku: true,
          status: true,
          archivedAt: true,
          product: { select: { slug: true, status: true, archivedAt: true } },
        },
      },
      location: { select: { status: true } },
      media: {
        where: { bucket: publicBucket, visibility: 'PUBLIC' },
        select: { objectPath: true },
      },
      inspections: {
        where: { isCurrent: true },
        select: {
          status: true,
          overallResult: true,
          batteryHealthPercent: true,
          conditionGrade: true,
          checks: true,
        },
      },
      reservations: { where: { status: 'ACTIVE' }, select: { id: true } },
    },
  });
  for (const unit of existingUnits) {
    const definition = RICH_AVAILABLE_UNITS.find(
      ({ inventoryCode }) => inventoryCode === unit.inventoryCode,
    );
    if (definition === undefined) throw new RichCatalogProvisionError('Unexpected rich unit row.');
    if (
      unit.variant.sku !== definition.sku ||
      unit.variant.product.slug !== variantProductSlugBySku.get(definition.sku) ||
      unit.serialHmac !== identifierCodec.lookupHmac('SERIAL', definition.serial)
    ) {
      throw new RichCatalogProvisionError(
        `Inventory stable-key collision detected for ${unit.inventoryCode}.`,
      );
    }
    if (unit.lifecycleStatus === 'AVAILABLE') {
      const currentInspection = unit.inspections[0];
      if (
        unit.salePrice === null ||
        unit.variant.status !== 'ACTIVE' ||
        unit.variant.archivedAt !== null ||
        unit.variant.product.status !== 'ACTIVE' ||
        unit.variant.product.archivedAt !== null ||
        unit.location.status !== 'ACTIVE' ||
        unit.media.length === 0 ||
        unit.reservations.length !== 0 ||
        unit.inspections.length !== 1 ||
        currentInspection?.status !== 'COMPLETED' ||
        currentInspection.overallResult !== 'PASSED' ||
        currentInspection.batteryHealthPercent === null ||
        currentInspection.conditionGrade === null ||
        !isCompletePassedChecklist(currentInspection.checks)
      ) {
        throw new RichCatalogProvisionError(
          `Existing AVAILABLE manifest unit is incomplete: ${unit.inventoryCode}.`,
        );
      }
    }
  }

  const inventoryCodeBySerialHmac = new Map(
    RICH_AVAILABLE_UNITS.map((unit) => [
      identifierCodec.lookupHmac('SERIAL', unit.serial),
      unit.inventoryCode,
    ]),
  );
  const identifierRows = await prisma.inventoryUnit.findMany({
    where: { serialHmac: { in: [...inventoryCodeBySerialHmac.keys()] } },
    select: { inventoryCode: true, serialHmac: true },
  });
  for (const row of identifierRows) {
    if (
      row.serialHmac === null ||
      inventoryCodeBySerialHmac.get(row.serialHmac) !== row.inventoryCode
    ) {
      throw new RichCatalogProvisionError(
        'A rich catalog synthetic serial collides with an existing inventory unit.',
      );
    }
  }

  await assertMediaPathCollisionsSafe(prisma, publicBucket, productBySlug, existingUnits);
  await assertProductCoverSlotsSafe(prisma, publicBucket, products);
  const placeholders = await inspectPlaceholders(prisma);
  return {
    variantsToCreate: RICH_IPHONE_VARIANTS.length - existingVariants.length,
    variantsToReuse: existingVariants.length,
    unitsToCreate: RICH_AVAILABLE_UNITS.length - existingUnits.length,
    unitsToReuse: existingUnits.length,
    placeholderState: placeholders.state,
    placeholderFingerprint: placeholders.fingerprint,
  };
}

async function provisionMasterData(
  prisma: PrismaClient,
  publicBucket: string,
): Promise<{
  created: number;
  reused: number;
  placeholdersDeleted: number;
  legacyMediaReordered: number;
}> {
  return prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${TRANSACTION_LOCK_NAME}))`;
      const productSlugs = uniqueSorted(RICH_IPHONE_VARIANTS.map(({ productSlug }) => productSlug));
      const products = await transaction.product.findMany({
        where: { slug: { in: productSlugs } },
        select: {
          id: true,
          slug: true,
          type: true,
          status: true,
          archivedAt: true,
          warrantyPolicyId: true,
          warrantyPolicy: { select: { status: true, archivedAt: true } },
        },
        orderBy: { slug: 'asc' },
      });
      const productBySlug = new Map(products.map((product) => [product.slug, product]));
      let created = 0;
      let reused = 0;

      for (const definition of [...RICH_IPHONE_VARIANTS].sort((left, right) =>
        left.sku.localeCompare(right.sku),
      )) {
        const product = requiredMapValue(productBySlug, definition.productSlug, 'product');
        if (
          product.type !== 'IPHONE' ||
          product.status !== 'ACTIVE' ||
          product.archivedAt !== null ||
          product.warrantyPolicyId === null ||
          product.warrantyPolicy?.status !== 'ACTIVE' ||
          product.warrantyPolicy.archivedAt !== null
        ) {
          throw new RichCatalogProvisionError(
            `Product ${definition.productSlug} is not publishable.`,
          );
        }
        const existing = await transaction.productVariant.findUnique({
          where: { sku: definition.sku },
          select: {
            productId: true,
            displayName: true,
            storageCapacityGb: true,
            colorName: true,
            colorHex: true,
            inventoryMode: true,
            warrantyPolicyId: true,
            status: true,
            archivedAt: true,
          },
        });
        if (existing !== null) {
          if (
            existing.productId !== product.id ||
            existing.displayName !== definition.displayName ||
            existing.storageCapacityGb !== definition.storageCapacityGb ||
            existing.colorName !== definition.colorName ||
            existing.colorHex !== definition.colorHex ||
            existing.inventoryMode !== 'SERIALIZED' ||
            existing.warrantyPolicyId !== product.warrantyPolicyId ||
            existing.status !== 'ACTIVE' ||
            existing.archivedAt !== null
          ) {
            throw new RichCatalogProvisionError(
              `Variant collision detected for ${definition.sku}.`,
            );
          }
          reused += 1;
          continue;
        }
        await transaction.productVariant.create({
          data: {
            productId: product.id,
            sku: definition.sku,
            displayName: definition.displayName,
            storageCapacityGb: definition.storageCapacityGb,
            colorName: definition.colorName,
            colorHex: definition.colorHex,
            inventoryMode: 'SERIALIZED',
            warrantyPolicyId: product.warrantyPolicyId,
            status: 'ACTIVE',
          },
        });
        created += 1;
      }

      for (const asset of RICH_CATALOG_ASSETS.filter(
        (candidate) => candidate.owner.type === 'PRODUCT',
      ).sort((left, right) => left.objectPath.localeCompare(right.objectPath))) {
        if (asset.owner.type !== 'PRODUCT') continue;
        const product = requiredMapValue(productBySlug, asset.owner.productSlug, 'product');
        await createOrValidateProductMedia(transaction, publicBucket, product.id, asset);
      }

      const legacyMediaReordered = await reorderKnownLegacyMedia(
        transaction,
        publicBucket,
        productBySlug,
      );
      const placeholders = await inspectPlaceholders(transaction);
      let placeholdersDeleted = 0;
      if (placeholders.state === 'PRESENT') {
        for (const product of products) {
          const activeRealVariant = await transaction.productVariant.findFirst({
            where: {
              productId: product.id,
              status: 'ACTIVE',
              archivedAt: null,
              inventoryMode: 'SERIALIZED',
              NOT: { sku: { in: expectedPlaceholderPairs().map(({ sku }) => sku) } },
            },
            select: { id: true },
          });
          if (activeRealVariant === null) {
            throw new RichCatalogProvisionError(
              `Cannot delete placeholder before ${product.slug} has a real active variant.`,
            );
          }
        }
        const deleted = await transaction.productVariant.deleteMany({
          where: { id: { in: placeholders.ids } },
        });
        if (deleted.count !== EXPECTED_PLACEHOLDER_VARIANTS) {
          throw new RichCatalogProvisionError('Placeholder deletion count changed concurrently.');
        }
        placeholdersDeleted = deleted.count;
      }
      return { created, reused, placeholdersDeleted, legacyMediaReordered };
    },
    { isolationLevel: 'Serializable', maxWait: 5_000, timeout: 120_000 },
  );
}

async function provisionAvailableUnits(
  prisma: PrismaClient,
  publicBucket: string,
  employeeEmail: string,
  identifierCodec: IdentifierCodec,
): Promise<{ created: number; reused: number }> {
  const employee = await prisma.user.findUnique({
    where: { normalizedEmail: employeeEmail },
    select: { id: true, role: true, status: true },
  });
  if (
    employee === null ||
    !['EMPLOYEE', 'ADMIN'].includes(employee.role) ||
    employee.status !== 'ACTIVE'
  ) {
    throw new RichCatalogProvisionError('Configured seed employee is not active staff.');
  }
  const locationCodes = uniqueSorted(RICH_AVAILABLE_UNITS.map(({ locationCode }) => locationCode));
  const locations = await prisma.inventoryLocation.findMany({
    where: { code: { in: locationCodes } },
    select: { id: true, code: true, status: true },
  });
  const locationByCode = new Map(locations.map((location) => [location.code, location]));
  for (const code of locationCodes) {
    const location = locationByCode.get(code);
    if (location === undefined || location.status !== 'ACTIVE') {
      throw new RichCatalogProvisionError(
        `Required active inventory location is missing: ${code}.`,
      );
    }
  }

  let created = 0;
  let reused = 0;
  for (const batch of chunks(
    [...RICH_AVAILABLE_UNITS].sort((left, right) =>
      left.inventoryCode.localeCompare(right.inventoryCode),
    ),
    UNIT_BATCH_SIZE,
  )) {
    const batchResult = await prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${TRANSACTION_LOCK_NAME}))`;
        let batchCreated = 0;
        let batchReused = 0;
        for (const definition of batch) {
          const existing = await transaction.inventoryUnit.findUnique({
            where: { inventoryCode: definition.inventoryCode },
            select: {
              id: true,
              serialHmac: true,
              variant: { select: { sku: true } },
              media: { select: { bucket: true, objectPath: true } },
            },
          });
          const expectedSerialHmac = identifierCodec.lookupHmac('SERIAL', definition.serial);
          const unitAssets = richUnitAssets(definition.inventoryCode);
          if (existing !== null) {
            if (
              existing.variant.sku !== definition.sku ||
              existing.serialHmac !== expectedSerialHmac ||
              !unitAssets.every((asset) =>
                existing.media.some(
                  ({ bucket, objectPath }) =>
                    bucket === publicBucket && objectPath === asset.objectPath,
                ),
              )
            ) {
              throw new RichCatalogProvisionError(
                `Existing manifest unit is incomplete or conflicting: ${definition.inventoryCode}.`,
              );
            }
            batchReused += 1;
            continue;
          }

          const variant = await transaction.productVariant.findUnique({
            where: { sku: definition.sku },
            select: {
              id: true,
              inventoryMode: true,
              status: true,
              archivedAt: true,
              product: { select: { slug: true, status: true, archivedAt: true } },
            },
          });
          if (
            variant === null ||
            variant.inventoryMode !== 'SERIALIZED' ||
            variant.status !== 'ACTIVE' ||
            variant.archivedAt !== null ||
            variant.product.slug !== definition.productSlug ||
            variant.product.status !== 'ACTIVE' ||
            variant.product.archivedAt !== null
          ) {
            throw new RichCatalogProvisionError(
              `Unit ${definition.inventoryCode} references an unavailable variant.`,
            );
          }
          const location = requiredMapValue(locationByCode, definition.locationCode, 'location');
          const protectedSerial = identifierCodec.protect('SERIAL', definition.serial);
          const optional = definition as RichUnit & {
            modelNumber?: string;
            regionCode?: string;
            warrantyDaysOverride?: number;
          };
          const unit = await transaction.inventoryUnit.create({
            data: {
              variantId: variant.id,
              locationId: location.id,
              inventoryCode: definition.inventoryCode,
              ...(optional.modelNumber === undefined ? {} : { modelNumber: optional.modelNumber }),
              ...(optional.regionCode === undefined ? {} : { regionCode: optional.regionCode }),
              simLockStatus: 'UNLOCKED',
              simConfiguration: 'PHYSICAL_AND_ESIM',
              serialEncrypted: protectedSerial.encrypted,
              serialHmac: protectedSerial.hmac,
              serialSuffix: protectedSerial.suffix,
              identifierKeyVersion: protectedSerial.keyVersion,
              lifecycleStatus: 'AVAILABLE',
              acquisitionCost: definition.acquisitionCost,
              additionalCost: definition.additionalCost,
              salePrice: definition.salePrice,
              compareAtPrice: definition.compareAtPrice,
              receivedAt: INSPECTED_AT,
              ...(optional.warrantyDaysOverride === undefined
                ? {}
                : { warrantyDaysOverride: optional.warrantyDaysOverride }),
            },
          });
          await transaction.inventoryInspection.create({
            data: {
              inventoryUnitId: unit.id,
              inspectionType: 'INTAKE',
              status: 'COMPLETED',
              batteryHealthPercent: definition.batteryHealthPercent,
              batteryCycleCount: definition.batteryCycleCount,
              batteryReplacementStatus: definition.batteryReplacementStatus,
              conditionGrade: definition.conditionGrade,
              cosmeticNotes: definition.cosmeticNotes,
              checks: passedChecks(),
              repairHistoryStatus: definition.repairHistoryStatus,
              repairNotes: null,
              replacedParts: Prisma.DbNull,
              overallResult: 'PASSED',
              inspectorId: employee.id,
              inspectedAt: INSPECTED_AT,
              isCurrent: true,
            },
          });
          for (const asset of unitAssets) {
            await createOrValidateUnitMedia(transaction, publicBucket, unit.id, asset);
          }
          batchCreated += 1;
        }
        return { created: batchCreated, reused: batchReused };
      },
      { isolationLevel: 'Serializable', maxWait: 5_000, timeout: 60_000 },
    );
    created += batchResult.created;
    reused += batchResult.reused;
  }
  return { created, reused };
}

async function postflight(
  prisma: PrismaClient,
  publicBucket: string,
  storage: StorageClient,
  localAssets: readonly LocalAsset[],
  apiPublicUrl: string | undefined,
): Promise<void> {
  const placeholders = await prisma.productVariant.count({
    where: { sku: { startsWith: 'CATALOG-' } },
  });
  if (placeholders !== 0) {
    throw new RichCatalogProvisionError('Postflight found remaining CATALOG placeholder variants.');
  }

  const variants = await prisma.productVariant.findMany({
    where: { sku: { in: RICH_IPHONE_VARIANTS.map(({ sku }) => sku) } },
    select: { sku: true, product: { select: { slug: true } } },
  });
  if (variants.length !== RICH_IPHONE_VARIANTS.length) {
    throw new RichCatalogProvisionError('Postflight rich variant coverage is incomplete.');
  }
  const expectedSlugBySku = new Map(
    RICH_IPHONE_VARIANTS.map(({ sku, productSlug }) => [sku, productSlug]),
  );
  if (variants.some((variant) => expectedSlugBySku.get(variant.sku) !== variant.product.slug)) {
    throw new RichCatalogProvisionError('Postflight found a variant/product ownership mismatch.');
  }

  const units = await prisma.inventoryUnit.findMany({
    where: {
      inventoryCode: { in: RICH_AVAILABLE_UNITS.map(({ inventoryCode }) => inventoryCode) },
    },
    select: {
      inventoryCode: true,
      lifecycleStatus: true,
      salePrice: true,
      serialHmac: true,
      variant: {
        select: {
          sku: true,
          status: true,
          archivedAt: true,
          product: { select: { status: true, archivedAt: true } },
        },
      },
      location: { select: { status: true } },
      media: {
        where: { bucket: publicBucket, visibility: 'PUBLIC' },
        select: { objectPath: true },
      },
      inspections: {
        where: { isCurrent: true },
        select: {
          status: true,
          overallResult: true,
          batteryHealthPercent: true,
          conditionGrade: true,
          checks: true,
        },
      },
      reservations: {
        where: { status: 'ACTIVE' },
        select: { id: true },
      },
    },
  });
  if (units.length !== RICH_AVAILABLE_UNITS.length) {
    throw new RichCatalogProvisionError('Postflight rich unit coverage is incomplete.');
  }
  for (const unit of units) {
    if (unit.lifecycleStatus !== 'AVAILABLE') continue;
    const currentInspection = unit.inspections[0];
    if (
      unit.salePrice === null ||
      unit.serialHmac === null ||
      unit.variant.status !== 'ACTIVE' ||
      unit.variant.archivedAt !== null ||
      unit.variant.product.status !== 'ACTIVE' ||
      unit.variant.product.archivedAt !== null ||
      unit.location.status !== 'ACTIVE' ||
      unit.media.length === 0 ||
      unit.reservations.length !== 0 ||
      unit.inspections.length !== 1 ||
      currentInspection?.status !== 'COMPLETED' ||
      currentInspection.overallResult !== 'PASSED' ||
      currentInspection.batteryHealthPercent === null ||
      currentInspection.conditionGrade === null ||
      !isCompletePassedChecklist(currentInspection.checks)
    ) {
      throw new RichCatalogProvisionError(
        `Postflight availability invariant failed for ${unit.inventoryCode}.`,
      );
    }
  }

  const mediaRows = await prisma.productMedia.findMany({
    where: {
      bucket: publicBucket,
      objectPath: { in: RICH_CATALOG_ASSETS.map(({ objectPath }) => objectPath) },
    },
    select: { objectPath: true },
  });
  if (mediaRows.length !== RICH_CATALOG_ASSETS.length) {
    throw new RichCatalogProvisionError('Postflight media metadata coverage is incomplete.');
  }

  const productAssets = RICH_CATALOG_ASSETS.filter(
    (asset) => asset.owner.type === 'PRODUCT' && asset.sortOrder === 0,
  );
  const products = await prisma.product.findMany({
    where: {
      slug: {
        in: productAssets.flatMap((asset) =>
          asset.owner.type === 'PRODUCT' ? [asset.owner.productSlug] : [],
        ),
      },
    },
    select: {
      slug: true,
      media: {
        where: { bucket: publicBucket, visibility: 'PUBLIC' },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        take: 1,
        select: { objectPath: true },
      },
    },
  });
  const coverBySlug = new Map(
    productAssets.flatMap((asset) =>
      asset.owner.type === 'PRODUCT' ? [[asset.owner.productSlug, asset.objectPath] as const] : [],
    ),
  );
  if (
    products.length !== coverBySlug.size ||
    products.some((product) => product.media[0]?.objectPath !== coverBySlug.get(product.slug))
  ) {
    throw new RichCatalogProvisionError(
      'Postflight found a product whose rich cover is not first.',
    );
  }

  await mapWithConcurrency(localAssets, STORAGE_CONCURRENCY, (asset) =>
    verifyRemoteAsset(storage, publicBucket, asset, false),
  );
  await optionalApiSmoke(apiPublicUrl, RICH_AVAILABLE_UNITS[0]);
}

async function assertMigrationsReady(prisma: PrismaClient): Promise<void> {
  const localMigrations = (await readdir(MIGRATIONS_DIRECTORY, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const deployed = await prisma.$queryRaw<MigrationRecord[]>`
    SELECT
      migration_name AS "migrationName",
      finished_at AS "finishedAt",
      rolled_back_at AS "rolledBackAt"
    FROM "_prisma_migrations"
    ORDER BY started_at ASC, id ASC
  `;
  const applied = deployed
    .filter(({ finishedAt, rolledBackAt }) => finishedAt !== null && rolledBackAt === null)
    .map(({ migrationName }) => migrationName)
    .sort();
  const incomplete = deployed.some(
    ({ finishedAt, rolledBackAt }) => finishedAt === null && rolledBackAt === null,
  );
  if (incomplete || applied.join('\n') !== localMigrations.join('\n')) {
    throw new RichCatalogProvisionError(
      'Database migrations are pending, incomplete or drifted; provisioning was not started.',
    );
  }
}

async function assertSeedDependencies(prisma: PrismaClient, employeeEmail: string): Promise<void> {
  const [employee, locations] = await Promise.all([
    prisma.user.findUnique({
      where: { normalizedEmail: employeeEmail },
      select: { role: true, status: true },
    }),
    prisma.inventoryLocation.findMany({
      where: {
        code: { in: uniqueSorted(RICH_AVAILABLE_UNITS.map(({ locationCode }) => locationCode)) },
      },
      select: { code: true, status: true },
    }),
  ]);
  if (
    employee === null ||
    !['EMPLOYEE', 'ADMIN'].includes(employee.role) ||
    employee.status !== 'ACTIVE'
  ) {
    throw new RichCatalogProvisionError('Run the baseline seed before rich provisioning.');
  }
  const activeCodes = new Set(
    locations.filter(({ status }) => status === 'ACTIVE').map(({ code }) => code),
  );
  if (RICH_AVAILABLE_UNITS.some(({ locationCode }) => !activeCodes.has(locationCode))) {
    throw new RichCatalogProvisionError('A required active inventory location is missing.');
  }
}

async function assertMediaPathCollisionsSafe(
  prisma: PrismaClient,
  publicBucket: string,
  productBySlug: ReadonlyMap<string, { id: string; slug: string }>,
  existingUnits: readonly {
    inventoryCode: string;
    variant: { sku: string; product: { slug: string } };
  }[],
): Promise<void> {
  const paths = RICH_CATALOG_ASSETS.map(({ objectPath }) => objectPath);
  const rows = await prisma.productMedia.findMany({
    where: { bucket: publicBucket, objectPath: { in: paths } },
    select: {
      objectPath: true,
      productId: true,
      variantId: true,
      inventoryUnitId: true,
      visibility: true,
      mimeType: true,
      width: true,
      height: true,
      fileSize: true,
      sortOrder: true,
      altText: true,
      product: { select: { slug: true } },
      inventoryUnit: { select: { inventoryCode: true } },
    },
  });
  const assetsByPath = new Map(RICH_CATALOG_ASSETS.map((asset) => [asset.objectPath, asset]));
  const existingCodes = new Set(existingUnits.map(({ inventoryCode }) => inventoryCode));
  const mediaPathsByUnitCode = new Map<string, Set<string>>();
  for (const row of rows) {
    const asset = requiredMapValue(assetsByPath, row.objectPath, 'asset');
    const ownerMatches =
      asset.owner.type === 'PRODUCT'
        ? row.product?.slug === asset.owner.productSlug &&
          row.productId === productBySlug.get(asset.owner.productSlug)?.id &&
          row.variantId === null &&
          row.inventoryUnitId === null
        : row.inventoryUnit?.inventoryCode === asset.owner.inventoryCode &&
          existingCodes.has(asset.owner.inventoryCode) &&
          row.productId === null &&
          row.variantId === null;
    const metadataMatches =
      row.visibility === 'PUBLIC' &&
      row.mimeType === asset.mimeType &&
      row.width === asset.width &&
      row.height === asset.height &&
      row.fileSize === asset.fileSize &&
      row.sortOrder === asset.sortOrder &&
      row.altText === asset.altText;
    if (!ownerMatches || !metadataMatches) {
      throw new RichCatalogProvisionError(`Media stable-key collision detected for ${asset.key}.`);
    }
    if (row.inventoryUnit?.inventoryCode !== undefined) {
      const paths = mediaPathsByUnitCode.get(row.inventoryUnit.inventoryCode) ?? new Set<string>();
      paths.add(row.objectPath);
      mediaPathsByUnitCode.set(row.inventoryUnit.inventoryCode, paths);
    }
  }
  for (const { inventoryCode } of existingUnits) {
    const existingPaths = mediaPathsByUnitCode.get(inventoryCode) ?? new Set<string>();
    if (richUnitAssets(inventoryCode).some(({ objectPath }) => !existingPaths.has(objectPath))) {
      throw new RichCatalogProvisionError(
        `Existing manifest unit is missing required media: ${inventoryCode}.`,
      );
    }
  }
}

async function assertProductCoverSlotsSafe(
  prisma: PrismaClient,
  publicBucket: string,
  products: readonly { id: string; slug: string }[],
): Promise<void> {
  const richCoverPaths = new Set(
    RICH_CATALOG_ASSETS.flatMap((asset) =>
      asset.owner.type === 'PRODUCT' && asset.sortOrder === 0 ? [asset.objectPath] : [],
    ),
  );
  const legacyPathBySlug = new Map<string, string>(
    LEGACY_MODEL_MEDIA.map(({ productSlug, objectPath }) => [productSlug, objectPath]),
  );
  const rows = await prisma.productMedia.findMany({
    where: {
      productId: { in: products.map(({ id }) => id) },
      bucket: publicBucket,
      visibility: 'PUBLIC',
      sortOrder: 0,
    },
    select: { objectPath: true, product: { select: { slug: true } } },
  });
  for (const row of rows) {
    if (
      !richCoverPaths.has(row.objectPath) &&
      legacyPathBySlug.get(row.product?.slug ?? '') !== row.objectPath
    ) {
      throw new RichCatalogProvisionError(
        `Product ${row.product?.slug ?? 'unknown'} already has an unmanaged primary cover; preserving it and stopping.`,
      );
    }
  }
}

async function inspectPlaceholders(
  client: PrismaClient | Prisma.TransactionClient,
): Promise<PlaceholderInspection> {
  const expected = expectedPlaceholderPairs();
  const expectedBySku = new Map(expected.map((entry) => [entry.sku, entry.productSlug]));
  const rows = await client.productVariant.findMany({
    where: { sku: { startsWith: 'CATALOG-' } },
    select: {
      id: true,
      sku: true,
      displayName: true,
      storageCapacityGb: true,
      colorName: true,
      colorHex: true,
      inventoryMode: true,
      salePrice: true,
      compareAtPrice: true,
      accessoryAttributes: true,
      warrantyPolicyId: true,
      status: true,
      archivedAt: true,
      product: { select: { slug: true, name: true, warrantyPolicyId: true } },
      _count: {
        select: {
          inventoryUnits: true,
          stockLevels: true,
          stockMovements: true,
          media: true,
          cartItems: true,
          wishlistItems: true,
          orderItems: true,
        },
      },
    },
    orderBy: { sku: 'asc' },
  });
  const expectedFingerprint = fingerprintPlaceholderPairs(expected);
  if (rows.length === 0) {
    return { state: 'ABSENT', ids: [], fingerprint: expectedFingerprint };
  }
  if (rows.length !== EXPECTED_PLACEHOLDER_VARIANTS) {
    throw new RichCatalogProvisionError(
      `Expected exactly ${EXPECTED_PLACEHOLDER_VARIANTS.toString()} untouched CATALOG placeholders or none.`,
    );
  }
  const actualPairs = rows.map(({ sku, product }) => ({ sku, productSlug: product.slug }));
  if (fingerprintPlaceholderPairs(actualPairs) !== expectedFingerprint) {
    throw new RichCatalogProvisionError(
      'CATALOG placeholder ownership fingerprint does not match.',
    );
  }
  for (const row of rows) {
    if (
      expectedBySku.get(row.sku) !== row.product.slug ||
      row.displayName !== row.product.name ||
      row.storageCapacityGb !== null ||
      row.colorName !== null ||
      row.colorHex !== null ||
      row.inventoryMode !== 'SERIALIZED' ||
      row.salePrice !== null ||
      row.compareAtPrice !== null ||
      row.accessoryAttributes !== null ||
      row.warrantyPolicyId !== row.product.warrantyPolicyId ||
      row.status !== 'ACTIVE' ||
      row.archivedAt !== null ||
      Object.values(row._count).some((count) => count !== 0)
    ) {
      throw new RichCatalogProvisionError(
        `CATALOG placeholder ${row.sku} is modified or referenced; refusing hard deletion.`,
      );
    }
  }
  return { state: 'PRESENT', ids: rows.map(({ id }) => id), fingerprint: expectedFingerprint };
}

async function createOrValidateProductMedia(
  transaction: Prisma.TransactionClient,
  publicBucket: string,
  productId: string,
  asset: RichAsset,
): Promise<void> {
  const existing = await transaction.productMedia.findUnique({
    where: { bucket_objectPath: { bucket: publicBucket, objectPath: asset.objectPath } },
    select: {
      productId: true,
      variantId: true,
      inventoryUnitId: true,
      visibility: true,
      mimeType: true,
      width: true,
      height: true,
      fileSize: true,
      sortOrder: true,
      altText: true,
    },
  });
  if (existing !== null) {
    if (
      existing.productId !== productId ||
      existing.variantId !== null ||
      existing.inventoryUnitId !== null ||
      existing.visibility !== 'PUBLIC' ||
      existing.mimeType !== asset.mimeType ||
      existing.width !== asset.width ||
      existing.height !== asset.height ||
      existing.fileSize !== asset.fileSize ||
      existing.sortOrder !== asset.sortOrder ||
      existing.altText !== asset.altText
    ) {
      throw new RichCatalogProvisionError(`Existing media metadata conflicts for ${asset.key}.`);
    }
    return;
  }
  await transaction.productMedia.create({
    data: {
      productId,
      bucket: publicBucket,
      objectPath: asset.objectPath,
      visibility: 'PUBLIC',
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      fileSize: asset.fileSize,
      sortOrder: asset.sortOrder,
      altText: asset.altText,
    },
  });
}

async function createOrValidateUnitMedia(
  transaction: Prisma.TransactionClient,
  publicBucket: string,
  inventoryUnitId: string,
  asset: RichAsset,
): Promise<void> {
  const existing = await transaction.productMedia.findUnique({
    where: { bucket_objectPath: { bucket: publicBucket, objectPath: asset.objectPath } },
    select: {
      productId: true,
      variantId: true,
      inventoryUnitId: true,
      visibility: true,
      mimeType: true,
      width: true,
      height: true,
      fileSize: true,
      sortOrder: true,
      altText: true,
    },
  });
  if (existing !== null) {
    if (
      existing.productId !== null ||
      existing.variantId !== null ||
      existing.inventoryUnitId !== inventoryUnitId ||
      existing.visibility !== 'PUBLIC' ||
      existing.mimeType !== asset.mimeType ||
      existing.width !== asset.width ||
      existing.height !== asset.height ||
      existing.fileSize !== asset.fileSize ||
      existing.sortOrder !== asset.sortOrder ||
      existing.altText !== asset.altText
    ) {
      throw new RichCatalogProvisionError(`Existing media metadata conflicts for ${asset.key}.`);
    }
    return;
  }
  await transaction.productMedia.create({
    data: {
      inventoryUnitId,
      bucket: publicBucket,
      objectPath: asset.objectPath,
      visibility: 'PUBLIC',
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      fileSize: asset.fileSize,
      sortOrder: asset.sortOrder,
      altText: asset.altText,
    },
  });
}

async function reorderKnownLegacyMedia(
  transaction: Prisma.TransactionClient,
  publicBucket: string,
  productBySlug: ReadonlyMap<string, { id: string; slug: string }>,
): Promise<number> {
  let changed = 0;
  for (const legacy of LEGACY_MODEL_MEDIA) {
    const product = requiredMapValue(productBySlug, legacy.productSlug, 'product');
    const row = await transaction.productMedia.findUnique({
      where: {
        bucket_objectPath: { bucket: publicBucket, objectPath: legacy.objectPath },
      },
      select: {
        id: true,
        productId: true,
        variantId: true,
        inventoryUnitId: true,
        visibility: true,
        mimeType: true,
        width: true,
        height: true,
        fileSize: true,
        altText: true,
        sortOrder: true,
      },
    });
    if (row === null) continue;
    if (
      row.productId !== product.id ||
      row.variantId !== null ||
      row.inventoryUnitId !== null ||
      row.visibility !== 'PUBLIC' ||
      row.mimeType !== 'image/png' ||
      row.width !== 1254 ||
      row.height !== 1254 ||
      row.fileSize !== legacy.fileSize ||
      row.altText !== legacy.altText ||
      ![0, 10].includes(row.sortOrder)
    ) {
      throw new RichCatalogProvisionError(
        `Known legacy media metadata changed for ${legacy.productSlug}; refusing reorder.`,
      );
    }
    if (row.sortOrder === 10) continue;
    const result = await transaction.productMedia.updateMany({
      where: {
        id: row.id,
        productId: product.id,
        variantId: null,
        inventoryUnitId: null,
        bucket: publicBucket,
        objectPath: legacy.objectPath,
        visibility: 'PUBLIC',
        sortOrder: 0,
      },
      data: { sortOrder: 10 },
    });
    if (result.count !== 1) {
      throw new RichCatalogProvisionError('Known legacy media changed concurrently.');
    }
    changed += 1;
  }
  return changed;
}

async function optionalApiSmoke(apiPublicUrl: string | undefined, unit: RichUnit | undefined) {
  if (apiPublicUrl === undefined || unit === undefined) return;
  try {
    const apiOrigin = parseUrl(apiPublicUrl, 'API_PUBLIC_URL').origin;
    const products = await fetch(
      `${apiOrigin}/api/v1/products?productType=IPHONE&page=1&pageSize=100`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!products.ok) {
      throw new RichCatalogProvisionError('Postflight public catalog API smoke failed.');
    }
    const detail = await fetch(
      `${apiOrigin}/api/v1/products/${encodeURIComponent(unit.productSlug)}/units/${encodeURIComponent(unit.inventoryCode)}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!detail.ok) {
      throw new RichCatalogProvisionError('Postflight exact-unit API smoke failed.');
    }
    await products.body?.cancel();
    await detail.body?.cancel();
  } catch (error) {
    if (error instanceof RichCatalogProvisionError) throw error;
    writeSafeEvent({ status: 'warning', check: 'api-smoke', reason: 'api-unavailable' });
  }
}

async function writeRunJournal(fingerprint: string, result: ProvisionResult): Promise<void> {
  await mkdir(RUN_JOURNAL_DIRECTORY, { recursive: true });
  const runId = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const path = resolve(RUN_JOURNAL_DIRECTORY, `${runId}.json`);
  const journal = {
    version: 1,
    targetFingerprint: fingerprint,
    completedAt: new Date().toISOString(),
    result,
    variantSkus: RICH_IPHONE_VARIANTS.map(({ sku }) => sku),
    inventoryCodes: RICH_AVAILABLE_UNITS.map(({ inventoryCode }) => inventoryCode),
    objectPaths: RICH_CATALOG_ASSETS.map(({ objectPath }) => objectPath),
  };
  await writeFile(path, `${JSON.stringify(journal, null, 2)}\n`, 'utf8');
}

function expectedPlaceholderPairs(): { sku: string; productSlug: string }[] {
  return uniqueSorted(RICH_IPHONE_VARIANTS.map(({ productSlug }) => productSlug))
    .filter((productSlug) => !BASELINE_REAL_VARIANT_PRODUCT_SLUGS.has(productSlug))
    .map((productSlug) => ({
      productSlug,
      sku: `CATALOG-${productSlug.toUpperCase()}`,
    }));
}

function fingerprintPlaceholderPairs(
  pairs: readonly { sku: string; productSlug: string }[],
): string {
  return sha256(
    Buffer.from(
      [...pairs]
        .sort((left, right) => left.sku.localeCompare(right.sku))
        .map(({ sku, productSlug }) => `${sku}|${productSlug}|ACTIVE|SERIALIZED|UNREFERENCED`)
        .join('\n'),
    ),
  ).slice(0, 12);
}

function richUnitAssets(inventoryCode: string): RichAsset[] {
  const assets = RICH_CATALOG_ASSETS.filter(
    (asset) => asset.owner.type === 'UNIT' && asset.owner.inventoryCode === inventoryCode,
  ).sort((left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key));
  if (assets.length === 0) {
    throw new RichCatalogProvisionError(`No media asset is defined for ${inventoryCode}.`);
  }
  return assets;
}

function passedChecks(): Prisma.InputJsonObject {
  return {
    schemaVersion: 1,
    items: Object.fromEntries(
      PASSED_CHECK_KEYS.map((key) => [key, { status: 'PASS', note: null }]),
    ),
  };
}

function isCompletePassedChecklist(value: Prisma.JsonValue): boolean {
  if (!isRecord(value) || value['schemaVersion'] !== 1 || !isRecord(value['items'])) return false;
  const items = value['items'];
  if (Object.keys(items).length !== PASSED_CHECK_KEYS.length) return false;
  return PASSED_CHECK_KEYS.every((key) => {
    const item = items[key];
    const status = isRecord(item) ? item['status'] : null;
    return typeof status === 'string' && ['PASS', 'NOT_APPLICABLE'].includes(status);
  });
}

function resolveManifestPath(filePath: string): string {
  if (isAbsolute(filePath)) {
    throw new RichCatalogProvisionError('Rich asset manifest paths must be workspace-relative.');
  }
  const absolutePath = resolve(WORKSPACE_ROOT, filePath);
  const workspaceRelative = relative(WORKSPACE_ROOT, absolutePath);
  if (workspaceRelative.startsWith('..') || isAbsolute(workspaceRelative)) {
    throw new RichCatalogProvisionError('Rich asset path escapes the workspace.');
  }
  return absolutePath;
}

function sharpFormatToMime(
  format: string | undefined,
): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'png') return 'image/png';
  if (format === 'webp') return 'image/webp';
  return null;
}

function supabaseProjectReference(url: URL): string {
  const usernameParts = decodeURIComponent(url.username).split('.');
  if (usernameParts.length > 1) return usernameParts.at(-1) ?? '';
  if (url.hostname.endsWith('.supabase.co')) {
    const hostnameParts = url.hostname.split('.');
    return hostnameParts[0] === 'db' ? (hostnameParts[1] ?? '') : (hostnameParts[0] ?? '');
  }
  return '';
}

function isOfficialSupabaseDatabaseHost(hostname: string): boolean {
  return hostname.endsWith('.supabase.co') || hostname.endsWith('.pooler.supabase.com');
}

function storageErrorStatus(error: unknown): number | null {
  if (!isRecord(error)) return null;
  const candidate = error['statusCode'] ?? error['status'];
  if (typeof candidate === 'number') return candidate;
  if (typeof candidate === 'string' && /^\d{3}$/.test(candidate)) return Number(candidate);
  return null;
}

function splitObjectPath(objectPath: string): { folder: string; fileName: string } {
  const separator = objectPath.lastIndexOf('/');
  if (separator <= 0 || separator === objectPath.length - 1) {
    throw new RichCatalogProvisionError('Rich asset object path must include a folder and name.');
  }
  return { folder: objectPath.slice(0, separator), fileName: objectPath.slice(separator + 1) };
}

function parseUrl(value: string, name: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new RichCatalogProvisionError(`${name} is not a valid URL.`);
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new RichCatalogProvisionError(`${name} is required for rich catalog provisioning.`);
  }
  return value;
}

function optionalEnvironment(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function requiredMapValue<K, V>(map: ReadonlyMap<K, V>, key: K, label: string): V {
  const value = map.get(key);
  if (value === undefined) throw new RichCatalogProvisionError(`Missing ${label} dependency.`);
  return value;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size));
  }
  return result;
}

async function mapWithConcurrency<T, U>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T, index: number) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value === undefined) {
        throw new RichCatalogProvisionError('Concurrent manifest iteration failed.');
      }
      results[index] = await operation(value, index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new RichCatalogProvisionError('Storage operation timed out.'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function writeSafeEvent(value: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && import.meta.url === pathToFileURL(resolve(entrypoint)).href;
}

if (isMainModule()) {
  try {
    await provisionRichCatalog();
  } catch (error) {
    const message =
      error instanceof RichCatalogProvisionError
        ? error.message
        : 'Rich catalog provisioning failed with an unexpected internal error.';
    process.stderr.write(`${JSON.stringify({ status: 'failed', message })}\n`);
    process.exitCode = 1;
  }
}
