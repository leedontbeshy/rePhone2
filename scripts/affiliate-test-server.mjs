import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalTestTarget } from './local-test-target.mjs';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
require('reflect-metadata');
const root = fileURLToPath(new URL('../', import.meta.url));
assertLocalTestTarget(process.env);
const publicApi = process.env.API_PUBLIC_URL.replace(/\/$/, '');
const { createApplication } = await import('../apps/api/dist/application.js');
const { MAIL_PROVIDER } = await import('../apps/api/dist/common/providers/mail-provider.js');
const { STORAGE_PROVIDER } = await import('../apps/api/dist/common/providers/storage-provider.js');
const app = await createApplication({ enableSwagger: true });
const mails = [];
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const mail = app.get(MAIL_PROVIDER);
mail.probe = async () => {};
mail.send = async (message) => {
  mails.unshift({ to: message.to, subject: message.subject, text: message.text });
  mails.splice(100);
};
app.use('/__test/mail', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(
    `<html lang="vi"><title>Hộp thư test rePhone</title><body><h1>Hộp thư test rePhone</h1><p>Chỉ có thư giả lập trên máy này. Tải lại để xem thư mới.</p>${mails.map((m) => `<article><h2>${escape(m.subject)}</h2><p>${escape(m.to)}</p><pre style="white-space:pre-wrap">${escape(m.text)}</pre></article>`).join('')}</body></html>`,
  );
});
const storageDirectory = resolve(root, '.local/affiliate/storage');
await mkdir(storageDirectory, { recursive: true });
const diskPath = (bucket, objectPath) =>
  resolve(storageDirectory, createHash('sha256').update(`${bucket}/${objectPath}`).digest('hex'));
const storage = app.get(STORAGE_PROVIDER);
storage.probe = async () => {
  await mkdir(storageDirectory, { recursive: true });
};
const links = new Map();
storage.upload = async (input) => {
  await writeFile(diskPath(input.bucket, input.objectPath), input.bytes);
  await writeFile(
    `${diskPath(input.bucket, input.objectPath)}.json`,
    JSON.stringify({ mimeType: input.mimeType }),
  );
  return {
    bucket: input.bucket,
    objectPath: input.objectPath,
    mimeType: input.mimeType,
    fileSize: input.bytes.length,
  };
};
storage.delete = async (bucket, objectPath) => {
  await unlink(diskPath(bucket, objectPath)).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  await unlink(`${diskPath(bucket, objectPath)}.json`).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
};
storage.createSignedReadUrl = async (bucket, objectPath, ttl) => {
  const key = randomBytes(32).toString('hex');
  links.set(key, { path: diskPath(bucket, objectPath), expires: Date.now() + ttl * 1000 });
  return `${publicApi}/__test/evidence/${key}`;
};
app.use('/__test/evidence', async (req, res) => {
  const key = req.path.slice(1);
  const link = links.get(key);
  if (!link || link.expires < Date.now()) {
    links.delete(key);
    res.sendStatus(404);
    return;
  }
  try {
    const bytes = await readFile(link.path);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', 'attachment; filename="evidence"');
    res.type('application/octet-stream').send(bytes);
  } catch {
    res.sendStatus(404);
  }
});
// Demo catalogue assets remain local; no uploads to Supabase are made.
const { DEMO_CATALOG_UPLOADS } = await import('../apps/api/prisma/demo-catalog-assets.ts');
const assets = new Map(DEMO_CATALOG_UPLOADS.map((a) => [a.objectPath, a.assetKey]));
app.use('/storage/v1/object/public', async (req, res) => {
  const [bucket, ...segments] = req.path.slice(1).split('/');
  // Private evidence is only available through expiring signed links above.
  if (!['public-test', 'store-test'].includes(bucket)) {
    res.sendStatus(404);
    return;
  }
  const objectPath = segments.join('/');
  const key = bucket === 'public-test' ? assets.get(objectPath) : undefined;
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (key) {
    res.sendFile(resolve(root, 'apps/api/prisma/demo-assets/catalog', `${key}.png`));
    return;
  }
  try {
    const path = diskPath(bucket, objectPath);
    const [bytes, metadata] = await Promise.all([readFile(path), readFile(`${path}.json`, 'utf8')]);
    const { mimeType } = JSON.parse(metadata);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(mimeType).send(bytes);
  } catch {
    res.sendStatus(404);
  }
});
await app.listen(4001, process.env.REPHONE_LOCAL_DOCKER === 'true' ? '0.0.0.0' : '127.0.0.1');
process.stdout.write(
  `Local TEST: ${process.env.WEB_PUBLIC_URL} | Mail: ${publicApi}/__test/mail | Database: rephone_test\n`,
);
