import { Prisma, type PrismaClient } from '../src/generated/prisma/client.js';
import { IPHONE_CHECKLIST_V1 } from '../src/common/domain/iphone-inspection-checklist.js';
import { IdentifierCodec } from '../src/modules/inventory/identifier-protection.js';
import { RICH_AVAILABLE_UNITS, RICH_IPHONE_VARIANTS } from './rich-catalog-data.js';
import { RICH_CATALOG_ASSETS, type RichCatalogAssetDefinition } from './rich-catalog-assets.js';

/** Add sample inventory without changing existing stock, inspection or sale records. */
export async function seedDevelopmentInventory(prisma: PrismaClient): Promise<void> {
  const bucket = process.env.SUPABASE_PUBLIC_BUCKET;
  const encryptionKey = process.env.IDENTIFIER_ENCRYPTION_KEY;
  const hmacKey = process.env.IDENTIFIER_HMAC_KEY;
  if (!bucket || !encryptionKey || !hmacKey)
    throw new Error('Development inventory configuration is missing');
  const codec = new IdentifierCodec(encryptionKey, hmacKey);
  const inspector = await prisma.user.findUniqueOrThrow({
    where: { normalizedEmail: process.env.SEED_EMPLOYEE_EMAIL?.trim().toLowerCase() ?? '' },
  });
  const policy = await prisma.warrantyPolicy.findUniqueOrThrow({ where: { code: 'IPHONE-90D' } });
  for (const definition of RICH_IPHONE_VARIANTS) {
    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: definition.productSlug },
    });
    await prisma.productVariant.upsert({
      where: { sku: definition.sku },
      update: {},
      create: {
        productId: product.id,
        sku: definition.sku,
        displayName: definition.displayName,
        storageCapacityGb: definition.storageCapacityGb,
        colorName: definition.colorName,
        colorHex: definition.colorHex,
        inventoryMode: 'SERIALIZED',
        warrantyPolicyId: policy.id,
        status: 'ACTIVE',
      },
    });
  }
  for (const asset of RICH_CATALOG_ASSETS) {
    if (asset.owner.type !== 'PRODUCT') continue;
    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: asset.owner.productSlug },
    });
    await seedMedia(prisma, bucket, asset, { productId: product.id });
  }
  for (const definition of RICH_AVAILABLE_UNITS) {
    await prisma.$transaction(async (transaction) => {
      const existing = await transaction.inventoryUnit.findUnique({
        where: { inventoryCode: definition.inventoryCode },
      });
      if (existing) return;
      const variant = await transaction.productVariant.findUniqueOrThrow({
        where: { sku: definition.sku },
      });
      const location = await transaction.inventoryLocation.findUniqueOrThrow({
        where: { code: definition.locationCode },
      });
      const serial = codec.protect('SERIAL', definition.serial);
      const receivedAt = new Date('2026-08-26T03:00:00.000Z');
      const unit = await transaction.inventoryUnit.create({
        data: {
          variantId: variant.id,
          locationId: location.id,
          inventoryCode: definition.inventoryCode,
          serialEncrypted: serial.encrypted,
          serialHmac: serial.hmac,
          serialSuffix: serial.suffix,
          identifierKeyVersion: serial.keyVersion,
          simLockStatus: 'UNLOCKED',
          simConfiguration: 'PHYSICAL_AND_ESIM',
          lifecycleStatus: 'AVAILABLE',
          acquisitionCost: definition.acquisitionCost,
          additionalCost: definition.additionalCost,
          salePrice: definition.salePrice,
          compareAtPrice: definition.compareAtPrice,
          receivedAt,
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
          repairHistoryStatus: definition.repairHistoryStatus,
          replacedParts: Prisma.DbNull,
          checks: {
            schemaVersion: 1,
            items: Object.fromEntries(
              IPHONE_CHECKLIST_V1.map(([key]) => [key, { status: 'PASS', note: null }]),
            ),
          },
          overallResult: 'PASSED',
          inspectorId: inspector.id,
          inspectedAt: receivedAt,
          isCurrent: true,
        },
      });
      for (const asset of RICH_CATALOG_ASSETS.filter(
        (asset) =>
          asset.owner.type === 'UNIT' && asset.owner.inventoryCode === definition.inventoryCode,
      )) {
        await seedMedia(transaction, bucket, asset, { inventoryUnitId: unit.id });
      }
    });
  }
}

async function seedMedia(
  prisma: Prisma.TransactionClient,
  bucket: string,
  asset: RichCatalogAssetDefinition,
  owner: { productId?: string; inventoryUnitId?: string },
): Promise<void> {
  await prisma.productMedia.upsert({
    where: { bucket_objectPath: { bucket, objectPath: asset.objectPath } },
    update: {},
    create: {
      ...owner,
      bucket,
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
