import 'reflect-metadata';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
if (process.env.NODE_ENV !== 'test' || process.env.REPHONE_SKIP_ENV_FILE !== 'true') {
  throw new Error('Use pnpm api:generate to generate the contract with isolated configuration.');
}

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
