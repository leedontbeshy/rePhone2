import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  RICH_CATALOG_ASSETS,
  validateRichCatalogAssets,
} from '../../../prisma/rich-catalog-assets.js';
import {
  RICH_AVAILABLE_MODEL_SLUGS,
  RICH_AVAILABLE_UNITS,
  RICH_IPHONE_PRODUCTS,
  RICH_IPHONE_VARIANTS,
  validateRichCatalogData,
} from '../../../prisma/rich-catalog-data.js';
import {
  APPLE_IPHONE_MODEL_SOURCES,
  validateAppleIphoneModelSources,
} from '../../../prisma/rich-catalog-model-sources.js';

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

describe('rich catalog fixtures', () => {
  it('locks the approved product, variant and AVAILABLE-unit cardinality', () => {
    expect(validateRichCatalogData()).toEqual([]);
    expect(() => {
      validateAppleIphoneModelSources();
    }).not.toThrow();
    expect(validateRichCatalogAssets()).toEqual([]);

    expect(RICH_IPHONE_PRODUCTS).toHaveLength(47);
    expect(RICH_IPHONE_VARIANTS).toHaveLength(90);
    expect(RICH_AVAILABLE_MODEL_SLUGS).toHaveLength(24);
    expect(RICH_AVAILABLE_UNITS).toHaveLength(96);
    expect(APPLE_IPHONE_MODEL_SOURCES).toHaveLength(47);
    expect(RICH_CATALOG_ASSETS).toHaveLength(143);

    const countByModel = new Map<string, number>();
    for (const { productSlug } of RICH_AVAILABLE_UNITS) {
      countByModel.set(productSlug, (countByModel.get(productSlug) ?? 0) + 1);
    }
    expect(
      RICH_AVAILABLE_MODEL_SLUGS.every((productSlug) => countByModel.get(productSlug) === 4),
    ).toBe(true);
  });

  it('contains unique, immutable 1000px WebP assets matching the manifest', async () => {
    const digests = new Set<string>();
    for (const asset of RICH_CATALOG_ASSETS) {
      const bytes = await readFile(resolve(WORKSPACE_ROOT, asset.filePath));
      const metadata = await sharp(bytes, { failOn: 'error' }).metadata();
      const digest = createHash('sha256').update(bytes).digest('hex');

      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBe(asset.width);
      expect(metadata.height).toBe(asset.height);
      expect(bytes.byteLength).toBe(asset.fileSize);
      expect(bytes.byteLength).toBeLessThanOrEqual(8 * 1024 * 1024);
      expect(digest).toBe(asset.sha256);
      expect(digests.has(digest)).toBe(false);
      digests.add(digest);
    }
  }, 15_000);

  it('maps exactly one cover to every product and one photo to every unit', () => {
    for (const product of RICH_IPHONE_PRODUCTS) {
      const covers = RICH_CATALOG_ASSETS.filter(
        (asset) =>
          asset.owner.type === 'PRODUCT' &&
          asset.owner.productSlug === product.slug &&
          asset.sortOrder === 0,
      );
      expect(covers).toHaveLength(1);
      expect(covers[0]?.provenance?.provider).toBe('APPLE');
    }

    for (const unit of RICH_AVAILABLE_UNITS) {
      const photos = RICH_CATALOG_ASSETS.filter(
        (asset) => asset.owner.type === 'UNIT' && asset.owner.inventoryCode === unit.inventoryCode,
      );
      expect(photos).toHaveLength(1);
      expect(photos[0]?.key).toBe(unit.imageAssetKey);
    }
  });
});
