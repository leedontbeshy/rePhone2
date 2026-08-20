import 'reflect-metadata';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { loadWorkspaceEnvironment } from '../config/load-environment.js';

loadWorkspaceEnvironment();
loadDotenv({ path: resolve(process.cwd(), '../../.env.example'), quiet: true });
process.env.NODE_ENV = 'development';

const { createApplication } = await import('../application.js');
const { createOpenApiDocument, sortOpenApiDocument, validateOpenApiDocument } =
  await import('./openapi.js');
const app = await createApplication({ enableSwagger: false });
try {
  const document = sortOpenApiDocument(createOpenApiDocument(app));
  validateOpenApiDocument(document);
  const outputPath = resolve(process.cwd(), 'openapi/openapi.json');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  process.stdout.write(`OpenAPI written to ${outputPath}\n`);
} finally {
  await app.close();
}
