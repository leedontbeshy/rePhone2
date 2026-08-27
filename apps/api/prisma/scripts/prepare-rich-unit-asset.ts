import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const sourcePath = argumentValue('--source');
const fileName = argumentValue('--file-name');
if (!/^[a-z0-9-]+\.webp$/.test(fileName)) {
  throw new Error('Rich unit asset filename is invalid.');
}

const generatedRoot = resolve(
  process.env['CODEX_HOME'] ?? 'C:/Users/Lee/.codex',
  'generated_images',
);
const resolvedSource = resolve(sourcePath);
if (!resolvedSource.startsWith(`${generatedRoot}\\`) && resolvedSource !== generatedRoot) {
  throw new Error('Source must be a built-in ImageGen output under CODEX_HOME/generated_images.');
}

const outputDirectory = fileURLToPath(
  new URL('../demo-assets/rich-catalog/units/', import.meta.url),
);
const outputPath = resolve(outputDirectory, fileName);
const source = await readFile(resolvedSource);
const sourceMetadata = await sharp(source).metadata();
if (sourceMetadata.width === undefined || sourceMetadata.height === undefined) {
  throw new Error('Generated unit asset has no raster dimensions.');
}

const output = await sharp(source)
  .rotate()
  .flatten({ background: '#f8fafc' })
  .resize(1_000, 1_000, { fit: 'cover', position: 'centre' })
  .webp({ quality: 90, effort: 6, smartSubsample: true })
  .toBuffer();

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, output, { flag: 'wx' }).catch(async (error: unknown) => {
  if (!isNodeError(error) || error.code !== 'EEXIST') throw error;
  const existing = await readFile(outputPath);
  if (sha256(existing) !== sha256(output)) {
    throw new Error(`Refusing to overwrite changed unit asset ${basename(outputPath)}.`);
  }
});

console.log(
  JSON.stringify({
    fileName,
    width: 1_000,
    height: 1_000,
    fileSize: output.length,
    sha256: sha256(output),
  }),
);

function argumentValue(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
