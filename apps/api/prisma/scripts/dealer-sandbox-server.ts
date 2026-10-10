import 'reflect-metadata';
import type { Request, Response } from 'express';
import type { INestApplication } from '@nestjs/common';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_CATALOG_UPLOADS } from '../demo-catalog-assets.js';

if (
  process.env['NODE_ENV'] !== 'test' ||
  process.env['DEALER_ENVIRONMENT'] !== 'TEST' ||
  new URL(process.env['DATABASE_URL'] ?? 'postgresql://invalid/invalid').pathname !==
    '/rephone_dealer_sandbox'
)
  throw new Error('Local sandbox configuration is required. Use pnpm dealer:sandbox:prepare.');
const compiled: unknown = await import(
  new URL('../../.sandbox-dist/application.js', import.meta.url).href
);
if (
  typeof compiled !== 'object' ||
  compiled === null ||
  !('createApplication' in compiled) ||
  typeof compiled.createApplication !== 'function'
)
  throw new Error('Build sandbox API before starting.');
const app = await (
  compiled.createApplication as (options: { enableSwagger: boolean }) => Promise<INestApplication>
)({ enableSwagger: true });
const assets = new Map(DEMO_CATALOG_UPLOADS.map((asset) => [asset.objectPath, asset.assetKey]));
app.use('/storage/v1/object/public/public-sandbox', (req: Request, res: Response) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  const key = assets.get(req.path.replace(/^\//, ''));
  if (!key) {
    res.sendStatus(404);
    return;
  }
  res.sendFile(
    resolve(fileURLToPath(new URL('../demo-assets/catalog/', import.meta.url)), `${key}.png`),
  );
});
await app.listen(4002, '127.0.0.1');
process.stdout.write('Sandbox API ready on 127.0.0.1:4002; LIVE configuration is not loaded.\n');
