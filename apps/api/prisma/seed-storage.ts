import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { DEMO_CATALOG_ASSETS, DEMO_CATALOG_UPLOADS } from './demo-catalog-assets.js';
import { RICH_CATALOG_ASSETS } from './rich-catalog-assets.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function seedDevelopmentStorage(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') return;
  const names = ['SUPABASE_PUBLIC_BUCKET', 'SUPABASE_PRIVATE_BUCKET', 'SUPABASE_STORE_BUCKET'].map(
    required,
  );
  if (new Set(names).size !== 3 || names.some((name) => !name.endsWith('-dev'))) {
    throw new Error('Development storage requires three distinct buckets ending -dev.');
  }
  const client = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const [index, name] of names.entries()) {
    const publicBucket = index !== 1;
    const result = await client.storage.getBucket(name);
    if (result.error) {
      if (![400, 404].includes(Number(result.error.status)))
        throw new Error(`Cannot read development storage bucket ${name}.`);
      const created = await client.storage.createBucket(name, {
        public: publicBucket,
        fileSizeLimit: 10 * 1024 * 1024,
      });
      if (created.error) throw new Error(`Cannot create development storage bucket ${name}.`);
    } else if (result.data.public !== publicBucket) {
      throw new Error(
        `Development storage bucket ${name} has an unexpected public/private setting.`,
      );
    }
  }
  const publicBucket = names[0];
  if (!publicBucket) throw new Error('Public development bucket is required.');
  for (const upload of DEMO_CATALOG_UPLOADS) {
    const asset = DEMO_CATALOG_ASSETS[upload.assetKey];
    const bytes = await readFile(
      new URL(`./demo-assets/catalog/${asset.fileName}`, import.meta.url),
    );
    const existing = await client.storage.from(publicBucket).info(upload.objectPath);
    if (!existing.error) continue;
    const result = await client.storage
      .from(publicBucket)
      .upload(upload.objectPath, bytes, { contentType: asset.mimeType, upsert: false });
    if (result.error && ![409].includes(Number(result.error.status)))
      throw new Error(`Cannot upload development catalog image ${upload.objectPath}.`);
  }
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  for (let offset = 0; offset < RICH_CATALOG_ASSETS.length; offset += 4) {
    await Promise.all(
      RICH_CATALOG_ASSETS.slice(offset, offset + 4).map(async (asset) => {
        const existing = await client.storage.from(publicBucket).info(asset.objectPath);
        if (!existing.error) return;
        const result = await client.storage
          .from(publicBucket)
          .upload(asset.objectPath, await readFile(resolve(root, asset.filePath)), {
            contentType: asset.mimeType,
            upsert: false,
          });
        if (result.error && Number(result.error.status) !== 409)
          throw new Error(`Cannot upload development catalog image ${asset.objectPath}.`);
      }),
    );
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || /placeholder|replace-with|example\.supabase/.test(value))
    throw new Error(`Fill ${name} before starting development.`);
  return value;
}
