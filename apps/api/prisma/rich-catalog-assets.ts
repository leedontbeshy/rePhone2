import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RICH_AVAILABLE_UNITS,
  RICH_IPHONE_PRODUCTS,
  type RichAvailableUnitDefinition,
} from './rich-catalog-data.js';
import { APPLE_IPHONE_MODEL_SOURCES } from './rich-catalog-model-sources.js';

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ASSET_ROOT = 'apps/api/prisma/demo-assets/rich-catalog';
const EXPECTED_PRODUCT_ASSETS = 47;
const EXPECTED_UNIT_ASSETS = 96;

export type RichCatalogAssetOwner =
  | { readonly type: 'PRODUCT'; readonly productSlug: string }
  | { readonly type: 'UNIT'; readonly inventoryCode: string };

export interface RichCatalogAssetDefinition {
  readonly key: string;
  readonly owner: RichCatalogAssetOwner;
  readonly filePath: string;
  readonly objectPath: string;
  readonly mimeType: 'image/webp';
  readonly width: 1000;
  readonly height: 1000;
  readonly fileSize: number;
  readonly sha256: string;
  readonly sortOrder: number;
  readonly altText: string;
  readonly provenance?: {
    readonly provider: 'APPLE';
    readonly sourcePageUrl: string;
    readonly originalUrl: string;
    readonly usageBasis: 'EDUCATIONAL_DEMO';
    readonly retrievedAt: '2026-08-27';
  };
}

const sourceByProductSlug = new Map(
  APPLE_IPHONE_MODEL_SOURCES.map((source) => [source.productSlug, source]),
);

const productAssets = RICH_IPHONE_PRODUCTS.map((product): RichCatalogAssetDefinition => {
  const source = sourceByProductSlug.get(product.slug);
  const filePath = `${ASSET_ROOT}/models/${product.slug}.webp`;
  const metadata = localFileMetadata(filePath);
  return {
    key: `product-${product.slug}`,
    owner: { type: 'PRODUCT', productSlug: product.slug },
    filePath,
    objectPath: `demo/rich-catalog/v1/products/${product.slug}/${metadata.sha256.slice(0, 12)}.webp`,
    mimeType: 'image/webp',
    width: 1000,
    height: 1000,
    fileSize: metadata.fileSize,
    sha256: metadata.sha256,
    sortOrder: 0,
    altText: `${product.name} - ảnh đại diện model`,
    ...(source === undefined
      ? {}
      : {
          provenance: {
            provider: 'APPLE' as const,
            sourcePageUrl: source.sourcePageUrl,
            originalUrl: source.originalUrl,
            usageBasis: source.usageBasis,
            retrievedAt: source.retrievedAt,
          },
        }),
  };
});

const unitAssets = RICH_AVAILABLE_UNITS.map((unit): RichCatalogAssetDefinition => {
  const filePath = `${ASSET_ROOT}/units/${unit.imageFileName}`;
  const metadata = localFileMetadata(filePath);
  return {
    key: unit.imageAssetKey,
    owner: { type: 'UNIT', inventoryCode: unit.inventoryCode },
    filePath,
    objectPath: `demo/rich-catalog/v1/units/${unit.inventoryCode.toLowerCase()}/${metadata.sha256.slice(0, 12)}.webp`,
    mimeType: 'image/webp',
    width: 1000,
    height: 1000,
    fileSize: metadata.fileSize,
    sha256: metadata.sha256,
    sortOrder: 0,
    altText: unitAltText(unit),
  };
});

export const RICH_CATALOG_ASSETS = Object.freeze([...productAssets, ...unitAssets]);

export function validateRichCatalogAssets(): string[] {
  const errors: string[] = [];
  if (productAssets.length !== EXPECTED_PRODUCT_ASSETS) {
    errors.push(
      `Expected ${EXPECTED_PRODUCT_ASSETS.toString()} product assets, received ${productAssets.length.toString()}`,
    );
  }
  if (unitAssets.length !== EXPECTED_UNIT_ASSETS) {
    errors.push(
      `Expected ${EXPECTED_UNIT_ASSETS.toString()} unit assets, received ${unitAssets.length.toString()}`,
    );
  }

  const keys = new Set<string>();
  const paths = new Set<string>();
  const digests = new Set<string>();
  for (const asset of RICH_CATALOG_ASSETS) {
    const absolutePath = resolve(WORKSPACE_ROOT, asset.filePath);
    if (!existsSync(absolutePath)) errors.push(`Missing asset file: ${asset.filePath}`);
    if (asset.fileSize <= 0) errors.push(`Invalid file size for ${asset.key}`);
    if (!/^[a-f0-9]{64}$/.test(asset.sha256)) errors.push(`Invalid SHA-256 for ${asset.key}`);
    addUnique(errors, keys, asset.key, 'asset key');
    addUnique(errors, paths, asset.objectPath, 'object path');
    addUnique(errors, digests, asset.sha256, 'asset digest');
  }

  for (const product of RICH_IPHONE_PRODUCTS) {
    const assets = productAssets.filter(
      (asset) => asset.owner.type === 'PRODUCT' && asset.owner.productSlug === product.slug,
    );
    if (assets.length !== 1) errors.push(`Product ${product.slug} must own exactly one asset`);
    if (!sourceByProductSlug.has(product.slug)) {
      errors.push(`Product ${product.slug} is missing Apple provenance`);
    }
  }
  for (const unit of RICH_AVAILABLE_UNITS) {
    const assets = unitAssets.filter(
      (asset) => asset.owner.type === 'UNIT' && asset.owner.inventoryCode === unit.inventoryCode,
    );
    if (assets.length !== 1) errors.push(`Unit ${unit.inventoryCode} must own exactly one asset`);
  }
  return errors;
}

function localFileMetadata(filePath: string): { fileSize: number; sha256: string } {
  const absolutePath = resolve(WORKSPACE_ROOT, filePath);
  if (!existsSync(absolutePath)) return { fileSize: 0, sha256: '0'.repeat(64) };
  const bytes = readFileSync(absolutePath);
  return {
    fileSize: statSync(absolutePath).size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function unitAltText(unit: RichAvailableUnitDefinition): string {
  const product = RICH_IPHONE_PRODUCTS.find(({ slug }) => slug === unit.productSlug);
  return `${product?.name ?? unit.productSlug} ${unit.conditionGrade} - ${unit.inventoryCode}`;
}

function addUnique(errors: string[], values: Set<string>, value: string, label: string): void {
  if (values.has(value)) errors.push(`Duplicate ${label}: ${value}`);
  values.add(value);
}
