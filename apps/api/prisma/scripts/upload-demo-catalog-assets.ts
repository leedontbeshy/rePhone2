import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import {
  DEMO_CATALOG_ASSETS,
  DEMO_CATALOG_UPLOADS,
  type DemoCatalogAsset,
} from '../demo-catalog-assets.js';

loadDotenv({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });

const storageUrl = new URL(requiredEnvironment('SUPABASE_URL')).origin;
const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
const publicBucket = requiredEnvironment('SUPABASE_PUBLIC_BUCKET');
const requestHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
};

await ensurePublicBucket();
for (const upload of DEMO_CATALOG_UPLOADS) {
  const asset = DEMO_CATALOG_ASSETS[upload.assetKey];
  await uploadAsset(upload.objectPath, asset);
  await verifyPublicAsset(upload.objectPath, asset.mimeType);
}

console.log(
  `Catalog demo media ready: ${String(DEMO_CATALOG_UPLOADS.length)} objects in ${new URL(storageUrl).host}/${publicBucket}.`,
);

async function ensurePublicBucket(): Promise<void> {
  const response = await storageRequest(`/storage/v1/bucket/${encodeURIComponent(publicBucket)}`, {
    method: 'GET',
  });
  if (response.status === 404) {
    const created = await storageRequest('/storage/v1/bucket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: publicBucket,
        name: publicBucket,
        public: true,
        file_size_limit: 8 * 1024 * 1024,
        allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'],
      }),
    });
    await expectStorageSuccess(created, 'create configured public bucket');
    return;
  }
  await expectStorageSuccess(response, 'read configured public bucket');
  const bucket = await response.json();
  if (!isPublicBucket(bucket)) {
    throw new Error('Configured catalog bucket exists but is not public; refusing to change it.');
  }
}

async function uploadAsset(objectPath: string, asset: DemoCatalogAsset): Promise<void> {
  const localPath = fileURLToPath(
    new URL(`../demo-assets/catalog/${asset.fileName}`, import.meta.url),
  );
  const file = await readFile(localPath);
  const metadata = await stat(localPath);
  if (metadata.size !== asset.fileSize) {
    throw new Error(`Demo asset size mismatch for ${asset.fileName}.`);
  }
  const response = await storageRequest(
    `/storage/v1/object/${encodeURIComponent(publicBucket)}/${encodeObjectPath(objectPath)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': asset.mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'x-upsert': 'true',
      },
      body: file,
    },
  );
  await expectStorageSuccess(response, `upload ${objectPath}`);
}

async function verifyPublicAsset(objectPath: string, expectedMimeType: string): Promise<void> {
  const response = await fetch(
    `${storageUrl}/storage/v1/object/public/${encodeURIComponent(publicBucket)}/${encodeObjectPath(objectPath)}`,
    { method: 'GET', signal: AbortSignal.timeout(15_000) },
  );
  if (!response.ok || response.headers.get('content-type')?.startsWith(expectedMimeType) !== true) {
    throw new Error(
      `Public verification failed for ${objectPath}: HTTP ${String(response.status)}.`,
    );
  }
  await response.body?.cancel();
}

function storageRequest(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(requestHeaders);
  new Headers(init.headers).forEach((value, key) => {
    headers.set(key, value);
  });
  return fetch(`${storageUrl}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(15_000),
  });
}

async function expectStorageSuccess(response: Response, operation: string): Promise<void> {
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Unable to ${operation}: HTTP ${String(response.status)} ${detail}`);
  }
}

function encodeObjectPath(objectPath: string): string {
  return objectPath.split('/').map(encodeURIComponent).join('/');
}

function isPublicBucket(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>)['public'] === true
  );
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
