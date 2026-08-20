import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEMO_CATALOG_ASSETS, DEMO_CATALOG_UPLOADS } from '../../../prisma/demo-catalog-assets.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('catalog demo asset manifest', () => {
  it('contains valid P0 raster assets with locked metadata', async () => {
    for (const asset of Object.values(DEMO_CATALOG_ASSETS)) {
      const assetPath = fileURLToPath(
        new URL(`../../../prisma/demo-assets/catalog/${asset.fileName}`, import.meta.url),
      );
      const [file, metadata] = await Promise.all([readFile(assetPath), stat(assetPath)]);

      expect(file.subarray(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE);
      expect(file.readUInt32BE(16)).toBe(asset.width);
      expect(file.readUInt32BE(20)).toBe(asset.height);
      expect(metadata.size).toBe(asset.fileSize);
      expect(metadata.size).toBeLessThanOrEqual(8 * 1024 * 1024);
    }
  });

  it('maps every seeded object to a unique PNG path', () => {
    const objectPaths = DEMO_CATALOG_UPLOADS.map(({ objectPath }) => objectPath);

    expect(DEMO_CATALOG_UPLOADS).toHaveLength(14);
    expect(new Set(objectPaths).size).toBe(objectPaths.length);
    expect(objectPaths.every((objectPath) => objectPath.endsWith('.png'))).toBe(true);
  });
});
