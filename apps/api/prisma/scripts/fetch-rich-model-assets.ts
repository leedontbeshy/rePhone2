import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  APPLE_IPHONE_MODEL_SOURCES,
  validateAppleIphoneModelSources,
} from '../rich-catalog-model-sources.js';

const outputDirectory = fileURLToPath(
  new URL('../demo-assets/rich-catalog/models/', import.meta.url),
);
const refresh = process.argv.includes('--refresh');
const concurrency = 4;

validateAppleIphoneModelSources();
await mkdir(outputDirectory, { recursive: true });

const queue = [...APPLE_IPHONE_MODEL_SOURCES];
const results: ModelAssetResult[] = [];
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const source = queue.shift();
      if (source === undefined) return;
      results.push(await prepareAsset(source));
    }
  }),
);

results.sort((left, right) => left.productSlug.localeCompare(right.productSlug));
const digestCount = new Set(results.map(({ sha256 }) => sha256)).size;
if (digestCount !== results.length) {
  throw new Error('Apple model assets must have a unique normalized digest per product.');
}

console.log(
  JSON.stringify(
    {
      count: results.length,
      outputDirectory,
      refreshed: refresh,
      assets: results,
    },
    null,
    2,
  ),
);

interface ModelAssetResult {
  productSlug: string;
  fileName: string;
  mimeType: 'image/webp';
  width: number;
  height: number;
  fileSize: number;
  sha256: string;
}

async function prepareAsset(
  source: (typeof APPLE_IPHONE_MODEL_SOURCES)[number],
): Promise<ModelAssetResult> {
  const fileName = `${source.productSlug}.webp`;
  const outputPath = fileURLToPath(
    new URL(`../demo-assets/rich-catalog/models/${fileName}`, import.meta.url),
  );
  let output: Buffer;
  if (!refresh) {
    try {
      output = await readFile(outputPath);
      return await inspectOutput(source.productSlug, fileName, output);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }

  const original = await downloadAppleAsset(source.originalUrl);
  const metadata = await sharp(original).metadata();
  if (metadata.width !== source.expectedWidth || metadata.height !== source.expectedHeight) {
    throw new Error(`Unexpected source dimensions for ${source.productSlug}.`);
  }
  if (`image/${metadata.format}` !== source.expectedMimeType) {
    throw new Error(`Unexpected source MIME for ${source.productSlug}.`);
  }

  output = await sharp(original)
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize(1_000, 1_000, {
      fit: 'contain',
      background: '#ffffff',
      withoutEnlargement: false,
    })
    .webp({ quality: 90, effort: 6, smartSubsample: true })
    .toBuffer();
  await writeFile(outputPath, output, { flag: 'wx' }).catch(async (error: unknown) => {
    if (!isExistingFile(error)) throw error;
    const existing = await readFile(outputPath);
    if (sha256(existing) !== sha256(output)) {
      throw new Error(`Refusing to overwrite changed model asset ${fileName}.`);
    }
  });
  return inspectOutput(source.productSlug, fileName, output);
}

async function downloadAppleAsset(urlValue: string): Promise<Buffer> {
  const url = new URL(urlValue);
  if (url.protocol !== 'https:' || !isAppleHost(url.hostname)) {
    throw new Error('Model source must use an official Apple HTTPS host.');
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'rePhone educational catalog asset provisioner/1.0' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        if (response.status !== 429 && response.status < 500) {
          throw new Error(`Apple asset returned HTTP ${String(response.status)}.`);
        }
        throw new RetryableDownloadError(response.status);
      }
      const contentLength = Number(response.headers.get('content-length') ?? '0');
      if (contentLength > 8 * 1024 * 1024) throw new Error('Apple asset is larger than 8 MiB.');
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length === 0 || body.length > 8 * 1024 * 1024) {
        throw new Error('Apple asset has an invalid file size.');
      }
      return body;
    } catch (error) {
      lastError = error;
      if (!(error instanceof RetryableDownloadError) && !(error instanceof TypeError)) throw error;
      if (attempt < 3) await delay(250 * attempt);
    }
  }
  throw new Error('Apple asset download failed after three attempts.', { cause: lastError });
}

async function inspectOutput(
  productSlug: string,
  fileName: string,
  output: Buffer,
): Promise<ModelAssetResult> {
  const metadata = await sharp(output).metadata();
  if (metadata.format !== 'webp' || metadata.width !== 1_000 || metadata.height !== 1_000) {
    throw new Error(`Normalized model asset is invalid for ${productSlug}.`);
  }
  return {
    productSlug,
    fileName,
    mimeType: 'image/webp',
    width: metadata.width,
    height: metadata.height,
    fileSize: output.length,
    sha256: sha256(output),
  };
}

function isAppleHost(hostname: string): boolean {
  return hostname === 'apple.com' || hostname.endsWith('.apple.com');
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function isMissingFile(error: unknown): boolean {
  return isNodeError(error) && error.code === 'ENOENT';
}

function isExistingFile(error: unknown): boolean {
  return isNodeError(error) && error.code === 'EEXIST';
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class RetryableDownloadError extends Error {
  public constructor(status: number) {
    super(`Retryable Apple asset response HTTP ${String(status)}.`);
  }
}
