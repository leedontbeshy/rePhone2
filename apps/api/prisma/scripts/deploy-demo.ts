import { randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, mkdir, access, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { userInfo } from 'node:os';
import { Client } from 'pg';
import { argon2id, hash, verify } from 'argon2';
import {
  IdentifierCodec,
  parseIdentifierKeyVersion,
} from '../../src/modules/inventory/identifier-protection.js';
import { databaseUrlSecurityIssue } from '../../src/config/database-url-security.js';
import { environmentSchema } from '../../src/config/app-config.js';
import { IDENTIFIER_FIELDS, planIdentifierRotation, type RotationRow } from './demo-rotation.js';
import {
  applicationTables,
  assertSnapshot,
  loadEncrypted,
  privateWrite,
  quoteIdentifier,
  saveEncrypted,
  sha256,
  snapshot,
  type Snapshot,
} from './demo-backup.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const argv = process.argv.slice(2);
const command = argv.shift() ?? 'status';
function option(name: string, fallback?: string): string {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : fallback;
  if (!value || value.startsWith('--')) throw new Error(`Missing ${name}.`);
  return value;
}
const sourcePath = resolve(root, option('--env', '.env.production'));
const caPath = resolve(root, option('--ca', 'secrets/supabase-prod-ca.crt'));
const secretDir = resolve(root, 'secrets/demo');
const manifestPath = resolve(secretDir, 'manifest.json');
interface Credential {
  id: string;
  email: string;
  role: string;
  password: string;
  passwordHash: string;
}
interface Manifest {
  format: 1;
  backupDir: string;
  backupKey: string;
  sourcePath: string;
  targetFingerprint: string;
  major: number;
  baseline: Snapshot;
  fullBaseline: Snapshot;
  verified: boolean;
  applied: boolean;
  backupDigests: Record<string, string>;
  storageObjects: number;
  storageBytes: number;
}
const json = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
const report = (stage: string, detail: Record<string, unknown> = {}): void => {
  process.stdout.write(JSON.stringify({ stage, ...detail }) + '\n');
};
const exists = async (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );
function parseEnvironment(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(parseEnv(text)))
    if (value !== undefined) result[name] = value;
  return result;
}
const readEnv = async (path: string): Promise<Record<string, string>> =>
  parseEnvironment(await readFile(path, 'utf8'));
const required = (env: Record<string, string>, name: string): string => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

async function secureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') {
    execFileSync(
      'icacls',
      [
        path,
        '/inheritance:r',
        '/grant:r',
        `${userInfo().username}:(OI)(CI)F`,
        '*S-1-5-18:(OI)(CI)F',
        '*S-1-5-32-544:(OI)(CI)F',
      ],
      { stdio: 'pipe', windowsHide: true },
    );
  }
}
function databaseUrl(env: Record<string, string>, name = 'DIRECT_URL'): URL {
  const raw = required(env, name);
  const issue = databaseUrlSecurityIssue(raw, {
    allowUnencryptedLoopback: false,
    requireCertificateVerification: true,
  });
  if (issue) throw new Error(`${name}: ${issue}`);
  const url = new URL(raw);
  url.searchParams.set('sslrootcert', caPath);
  return url;
}
function fingerprint(env: Record<string, string>): string {
  const url = databaseUrl(env);
  return sha256(`${url.hostname}:${url.port || '5432'}${url.pathname}`);
}
async function connect(env: Record<string, string>): Promise<Client> {
  const client = new Client({
    connectionString: databaseUrl(env).href,
    connectionTimeoutMillis: 10000,
    query_timeout: 120000,
    application_name: 'rephone-demo-preserving-migration',
  });
  await client.connect();
  return client;
}
function docker(args: string[], input?: Buffer, env = process.env): Buffer {
  const result = spawnSync('docker', args, {
    input,
    env,
    encoding: null,
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024,
    timeout: 240000,
  });
  if (result.status !== 0)
    throw new Error(
      `Docker ${args[0] ?? 'operation'} failed (${String(result.status ?? 'unavailable')}).`,
    );
  return result.stdout;
}
function assertLocalDocker(): void {
  const endpoint = docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])
    .toString()
    .trim();
  if (!/^(npipe|unix):\/\//.test(endpoint) || process.env.DOCKER_HOST)
    throw new Error('A local Docker context is required.');
}
async function readManifest(): Promise<Manifest> {
  return JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
}
async function writeManifest(manifest: Manifest): Promise<void> {
  await privateWrite(manifestPath, json(manifest), false);
}
function codec(env: Record<string, string>): IdentifierCodec {
  return new IdentifierCodec(
    required(env, 'IDENTIFIER_ENCRYPTION_KEY'),
    required(env, 'IDENTIFIER_HMAC_KEY'),
    parseIdentifierKeyVersion(env.IDENTIFIER_KEY_VERSION),
  );
}
async function identifierRows(client: Client): Promise<RotationRow[]> {
  return (
    await client.query<RotationRow>(
      `SELECT id,identifier_key_version,${IDENTIFIER_FIELDS.flatMap((field) => [field.encrypted, field.hmac, field.suffix]).join(',')} FROM public.inventory_units ORDER BY id`,
    )
  ).rows;
}
async function storageList(
  client: Client,
  env: Record<string, string>,
): Promise<{ bucket_id: string; name: string; metadata: Record<string, unknown> }[]> {
  return (
    await client.query<{ bucket_id: string; name: string; metadata: Record<string, unknown> }>(
      'SELECT bucket_id,name,metadata FROM storage.objects WHERE bucket_id=ANY($1::text[]) ORDER BY bucket_id,name',
      [
        ['SUPABASE_PUBLIC_BUCKET', 'SUPABASE_PRIVATE_BUCKET', 'SUPABASE_STORE_BUCKET'].map((name) =>
          required(env, name),
        ),
      ],
    )
  ).rows;
}
async function storageFetch(env: Record<string, string>, path: string): Promise<Buffer> {
  const key = required(env, 'SUPABASE_SERVICE_ROLE_KEY');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(new URL(path, required(env, 'SUPABASE_URL')), {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error('Storage backup request failed.');
      return Buffer.from(await response.arrayBuffer());
    } catch {
      if (attempt === 2) throw new Error('Storage backup failed; database remains unchanged.');
    }
  }
  throw new Error('Storage backup failed.');
}
async function prepare(): Promise<void> {
  if (await exists(manifestPath))
    throw new Error(
      'A demo preparation already exists. Use status/rehearse/apply; original backups will not be overwritten.',
    );
  assertLocalDocker();
  const env = await readEnv(sourcePath);
  await access(caPath);
  const runtime = new URL(required(env, 'DATABASE_URL'));
  const direct = databaseUrl(env);
  if (runtime.hostname !== direct.hostname || runtime.pathname !== direct.pathname)
    throw new Error('Runtime and administration database targets differ.');
  const client = await connect(env);
  try {
    await client.query('BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ');
    const major = Math.floor(
      Number(
        (
          await client.query<{ version: string }>(
            "SELECT current_setting('server_version_num') AS version",
          )
        ).rows[0]?.version,
      ) / 10000,
    );
    if (!Number.isInteger(major) || major < 17 || major > 20)
      throw new Error('Unsupported PostgreSQL backup version.');
    const sourceCodec = codec(env);
    if (sourceCodec.keyVersion !== 1)
      throw new Error('Source identifiers must use key version 1 before first preparation.');
    const target = {
      ...env,
      JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
      IDENTIFIER_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      IDENTIFIER_HMAC_KEY: randomBytes(32).toString('base64'),
      IDENTIFIER_KEY_VERSION: '2',
      DEMO_MODE: 'true',
      MAIL_ENABLED: 'false',
      SCHEDULER_ENABLED: 'false',
      DEALER_WORKER_ENABLED: 'false',
      REPHONE_SKIP_ENV_FILE: 'true',
      API_PORT: '10000',
      DB_POOL_MAX: '5',
      NODE_OPTIONS: '--max-old-space-size=256',
      APP_VERSION: 'demo',
    };
    planIdentifierRotation(await identifierRows(client), sourceCodec, codec(target));
    const baseline = await snapshot(client);
    const fullBaseline = await snapshot(client, true);
    const objects = await storageList(client, env);
    const users = (
      await client.query<{ id: string; email: string; role: string }>(
        "SELECT id,email,role FROM public.users WHERE normalized_email LIKE '%@rephone.local' ORDER BY id",
      )
    ).rows;
    await secureDirectory(secretDir);
    const nonce = randomBytes(8).toString('hex');
    const backupDir = resolve(root, '.local/demo-backups', nonce);
    await secureDirectory(backupDir);
    const key = randomBytes(32);
    const backupKey = resolve(secretDir, 'backup-key.txt');
    await privateWrite(backupKey, key.toString('base64') + '\n');
    const backupDigests: Record<string, string> = {};
    async function backup(name: string, bytes: Buffer) {
      await saveEncrypted(resolve(backupDir, name), bytes, key);
      backupDigests[name] = sha256(bytes);
    }
    await backup('source-env.enc', await readFile(sourcePath));
    await backup('ca.enc', await readFile(caPath));
    report('backing-up-database', { major, tables: Object.keys(baseline).length });
    const pgEnv = {
      ...process.env,
      PGHOST: direct.hostname,
      PGPORT: direct.port || '5432',
      PGDATABASE: decodeURIComponent(direct.pathname.slice(1)),
      PGUSER: decodeURIComponent(direct.username),
      PGPASSWORD: decodeURIComponent(direct.password),
      PGSSLMODE: 'verify-full',
      PGSSLROOTCERT: '/backup-ca.crt',
    };
    const dump = docker(
      [
        'run',
        '--rm',
        '--mount',
        `type=bind,source=${caPath},target=/backup-ca.crt,readonly`,
        ...[
          'PGHOST',
          'PGPORT',
          'PGDATABASE',
          'PGUSER',
          'PGPASSWORD',
          'PGSSLMODE',
          'PGSSLROOTCERT',
        ].flatMap((name) => ['-e', name]),
        `postgres:${major.toString()}-alpine`,
        'pg_dump',
        '--format=custom',
        '--schema=public',
        '--no-owner',
        '--no-acl',
      ],
      undefined,
      pgEnv,
    );
    await backup('database.dump.enc', dump);
    const buckets = [];
    for (const name of [
      'SUPABASE_PUBLIC_BUCKET',
      'SUPABASE_PRIVATE_BUCKET',
      'SUPABASE_STORE_BUCKET',
    ])
      buckets.push(
        JSON.parse(
          (
            await storageFetch(env, '/storage/v1/bucket/' + encodeURIComponent(required(env, name)))
          ).toString(),
        ) as unknown,
      );
    await backup('storage-index.enc', Buffer.from(json({ buckets, objects })));
    let storageBytes = 0;
    for (let offset = 0; offset < objects.length; offset += 4) {
      await Promise.all(
        objects.slice(offset, offset + 4).map(async (object, index) => {
          const path =
            '/storage/v1/object/authenticated/' +
            encodeURIComponent(object.bucket_id) +
            '/' +
            object.name.split('/').map(encodeURIComponent).join('/');
          const bytes = await storageFetch(env, path);
          storageBytes += bytes.length;
          await backup(`object-${(offset + index).toString()}.enc`, bytes);
        }),
      );
      if (offset % 20 === 0)
        report('backing-up-storage', {
          completed: Math.min(offset + 4, objects.length),
          total: objects.length,
        });
    }
    const credentials: Credential[] = [];
    for (const user of users) {
      const password = randomBytes(24).toString('base64url');
      credentials.push({
        ...user,
        password,
        passwordHash: await hash(password, {
          type: argon2id,
          memoryCost: 65536,
          timeCost: 3,
          parallelism: 1,
        }),
      });
    }
    await privateWrite(resolve(secretDir, 'credentials.json'), json(credentials));
    await privateWrite(
      resolve(secretDir, 'target.env'),
      Object.entries(target)
        .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
        .join('\n') + '\n',
    );
    const manifest: Manifest = {
      format: 1,
      backupDir,
      backupKey,
      sourcePath,
      targetFingerprint: fingerprint(env),
      major,
      baseline,
      fullBaseline,
      verified: false,
      applied: false,
      backupDigests,
      storageObjects: objects.length,
      storageBytes,
    };
    await client.query('ROLLBACK');
    assertSnapshot(fullBaseline, await snapshot(client, true));
    await writeManifest(manifest);
    report('prepared-no-database-writes', {
      backupDir,
      storageObjects: objects.length,
      storageBytes,
      demoAccounts: users.length,
    });
  } finally {
    await client.end();
  }
}

async function applyTransaction(
  client: Client,
  source: Record<string, string>,
  target: Record<string, string>,
  credentials: Credential[],
  expected: Snapshot,
  forceRollback = false,
): Promise<void> {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query(
      `LOCK TABLE ${(await applicationTables(client)).map((table) => 'public.' + quoteIdentifier(table)).join(',')} IN EXCLUSIVE MODE`,
    );
    assertSnapshot(expected, await snapshot(client, true));
    const beforeBusiness = await snapshot(client);
    const rows = await identifierRows(client);
    const updates = planIdentifierRotation(rows, codec(source), codec(target));
    const catalogTrigger = await client.query<{ enabled: string; definition: string }>(
      `SELECT t.tgenabled AS enabled, pg_get_triggerdef(t.oid) AS definition
       FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
       WHERE t.tgrelid='public.inventory_units'::regclass
         AND t.tgname='dealer_catalog_unit' AND NOT t.tgisinternal
         AND p.proname='dealer_catalog_event'`,
    );
    if (catalogTrigger.rowCount !== 1 || catalogTrigger.rows[0]?.enabled !== 'O')
      throw new Error('Unexpected inventory catalog trigger; stopped.');
    // Re-encryption changes no catalog data. Suppress only this event trigger while
    // all application tables are locked; transactional DDL also rolls back on error.
    await client.query('ALTER TABLE public.inventory_units DISABLE TRIGGER dealer_catalog_unit');
    const columns = IDENTIFIER_FIELDS.flatMap((field) => [field.encrypted, field.hmac]);
    for (const update of updates) {
      await client.query(
        `UPDATE public.inventory_units SET ${columns.map((column, index) => `${column}=$${(index + 1).toString()}`).join(',')},identifier_key_version=$${(columns.length + 1).toString()} WHERE id=$${(columns.length + 2).toString()}`,
        [...columns.map((column) => update.values[column]), 2, update.id],
      );
    }
    await client.query('ALTER TABLE public.inventory_units ENABLE TRIGGER dealer_catalog_unit');
    const restoredTrigger = await client.query<{ enabled: string; definition: string }>(
      `SELECT tgenabled AS enabled, pg_get_triggerdef(oid) AS definition FROM pg_trigger
       WHERE tgrelid='public.inventory_units'::regclass AND tgname='dealer_catalog_unit'`,
    );
    if (JSON.stringify(restoredTrigger.rows) !== JSON.stringify(catalogTrigger.rows))
      throw new Error('Inventory catalog trigger verification failed.');
    for (const credential of credentials) {
      const updated = await client.query(
        'UPDATE public.users SET password_hash=$1,password_changed_at=clock_timestamp() WHERE id=$2 AND normalized_email=$3',
        [credential.passwordHash, credential.id, credential.email.trim().toLowerCase()],
      );
      if (updated.rowCount !== 1) throw new Error('A demo account changed after backup.');
    }
    const ids = credentials.map((value) => value.id);
    await client.query(
      'UPDATE public.auth_sessions SET revoked_at=clock_timestamp() WHERE user_id=ANY($1::uuid[]) AND revoked_at IS NULL',
      [ids],
    );
    await client.query(
      'UPDATE public.auth_tokens SET consumed_at=clock_timestamp() WHERE user_id=ANY($1::uuid[]) AND consumed_at IS NULL',
      [ids],
    );
    if (forceRollback) await client.query('SELECT 1/0');
    // Business fingerprints deliberately exclude only the fields changed above.
    const afterRows = await identifierRows(client);
    for (const row of afterRows) {
      if (row.identifier_key_version !== 2)
        throw new Error('Identifier version verification failed.');
      for (const field of IDENTIFIER_FIELDS) {
        const encrypted = row[field.encrypted];
        if (typeof encrypted === 'string') {
          const plaintext = codec(target).decrypt(encrypted, 2);
          if (codec(target).lookupHmac(field.type, plaintext) !== row[field.hmac])
            throw new Error('Identifier lookup verification failed.');
        }
      }
    }
    assertSnapshot(beforeBusiness, await snapshot(client));
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function verifyBackup(manifest: Manifest, key: Buffer): Promise<void> {
  for (const [name, digest] of Object.entries(manifest.backupDigests)) {
    if (sha256(await loadEncrypted(resolve(manifest.backupDir, name), key)) !== digest)
      throw new Error('Backup verification failed.');
  }
}
async function rehearse(): Promise<void> {
  assertLocalDocker();
  const manifest = await readManifest();
  if (manifest.applied) throw new Error('Already applied. Use status.');
  const key = Buffer.from((await readFile(manifest.backupKey, 'utf8')).trim(), 'base64');
  await verifyBackup(manifest, key);
  const source = parseEnvironment(
    (await loadEncrypted(resolve(manifest.backupDir, 'source-env.enc'), key)).toString(),
  );
  const target = await readEnv(resolve(secretDir, 'target.env'));
  const credentials = JSON.parse(
    await readFile(resolve(secretDir, 'credentials.json'), 'utf8'),
  ) as Credential[];
  const nonce = randomBytes(10).toString('hex');
  const password = randomBytes(32).toString('hex');
  const id = docker(
    [
      'run',
      '-d',
      '--name',
      `rephone-demo-rehearsal-${nonce}`,
      '--label',
      `com.rephone.demo-rehearsal=${nonce}`,
      '-e',
      'POSTGRES_DB=rephone_demo_rehearsal_test',
      '-e',
      'POSTGRES_USER=demo',
      '-e',
      'POSTGRES_PASSWORD',
      '-p',
      '127.0.0.1::5432',
      '--tmpfs',
      '/var/lib/postgresql/data',
      `postgres:${manifest.major.toString()}-alpine`,
    ],
    undefined,
    { ...process.env, POSTGRES_PASSWORD: password },
  )
    .toString()
    .trim();
  let client: Client | undefined;
  try {
    const port = Number(
      docker([
        'inspect',
        id,
        '--format',
        '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
      ])
        .toString()
        .trim(),
    );
    if (!Number.isInteger(port) || port < 1) throw new Error('Invalid local rehearsal port.');
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const candidate = new Client({
        host: '127.0.0.1',
        port,
        user: 'demo',
        password,
        database: 'rephone_demo_rehearsal_test',
        connectionTimeoutMillis: 1000,
      });
      try {
        await candidate.connect();
        client = candidate;
        break;
      } catch {
        await candidate.end().catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    if (!client) throw new Error('Local rehearsal database did not start.');
    report('restoring-isolated-backup');
    docker(
      [
        'exec',
        '-i',
        id,
        'pg_restore',
        '--clean',
        '--if-exists',
        '--exit-on-error',
        '--no-owner',
        '--no-acl',
        '--username=demo',
        '--dbname=rephone_demo_rehearsal_test',
      ],
      await loadEncrypted(resolve(manifest.backupDir, 'database.dump.enc'), key),
    );
    assertSnapshot(manifest.fullBaseline, await snapshot(client, true));
    try {
      await applyTransaction(client, source, target, credentials, manifest.fullBaseline, true);
      throw new Error('Rollback rehearsal did not fail.');
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === '22012')) throw error;
    }
    assertSnapshot(manifest.fullBaseline, await snapshot(client, true));
    report('rollback-rehearsal-passed');
    await applyTransaction(client, source, target, credentials, manifest.fullBaseline);
    assertSnapshot(manifest.baseline, await snapshot(client));
    for (const credential of credentials) {
      const stored = (
        await client.query<{ password_hash: string }>(
          'SELECT password_hash FROM public.users WHERE id=$1',
          [credential.id],
        )
      ).rows[0]?.password_hash;
      if (!stored || !(await verify(stored, credential.password)))
        throw new Error('Demo credential verification failed.');
    }
    manifest.verified = true;
    await writeManifest(manifest);
    report('rehearsal-passed', {
      tables: Object.keys(manifest.baseline).length,
      demoAccounts: credentials.length,
      storageObjects: manifest.storageObjects,
    });
  } finally {
    await client?.end();
    cleanupRehearsal(id, nonce);
  }
}

function cleanupRehearsal(id: string, nonce: string): void {
  const label = docker([
    'inspect',
    id,
    '--format',
    '{{index .Config.Labels "com.rephone.demo-rehearsal"}}',
  ])
    .toString()
    .trim();
  if (label !== nonce) throw new Error('Refusing cleanup of an unrelated container.');
  docker(['rm', '-f', id]);
}

async function apply(): Promise<void> {
  const manifest = await readManifest();
  if (!manifest.verified) throw new Error('Restore and rollback rehearsal must pass before apply.');
  if (!argv.includes('--apply')) throw new Error('Use --apply only after stopping all writers.');
  const source = await readEnv(sourcePath);
  if (
    manifest.targetFingerprint !== fingerprint(source) ||
    resolve(manifest.sourcePath) !== sourcePath
  )
    throw new Error('Database target does not match the verified backup.');
  const key = Buffer.from((await readFile(manifest.backupKey, 'utf8')).trim(), 'base64');
  await verifyBackup(manifest, key);
  const target = await readEnv(resolve(secretDir, 'target.env'));
  const validated = environmentSchema.safeParse(target);
  if (!validated.success) throw new Error('Prepared runtime configuration is invalid.');
  const credentials = JSON.parse(
    await readFile(resolve(secretDir, 'credentials.json'), 'utf8'),
  ) as Credential[];
  const client = await connect(source);
  try {
    if (manifest.applied) {
      // Recover exports after an interruption without rotating again or overwriting edited URLs.
      if (!(await exists(resolve(secretDir, 'render.env')))) await exportEnvironment(target);
      report('already-applied');
      return;
    }
    report('applying-verified-credential-and-identifier-rotation');
    const rows = await identifierRows(client);
    const storedCredentials = await client.query<{ id: string; password_hash: string }>(
      'SELECT id,password_hash FROM public.users WHERE id=ANY($1::uuid[])',
      [credentials.map((credential) => credential.id)],
    );
    const committed =
      rows.every((row) => row.identifier_key_version === 2) &&
      credentials.length > 0 &&
      credentials.every((credential) =>
        storedCredentials.rows.some(
          (row) => row.id === credential.id && row.password_hash === credential.passwordHash,
        ),
      );
    if (committed) {
      assertSnapshot(manifest.baseline, await snapshot(client));
      for (const row of rows)
        for (const field of IDENTIFIER_FIELDS) {
          const encrypted = row[field.encrypted];
          if (typeof encrypted === 'string') codec(target).decrypt(encrypted, 2);
        }
      report('recovering-committed-operation');
    } else await applyTransaction(client, source, target, credentials, manifest.fullBaseline);
    assertSnapshot(manifest.baseline, await snapshot(client));
    const current = { ...source };
    for (const name of [
      'JWT_ACCESS_SECRET',
      'IDENTIFIER_ENCRYPTION_KEY',
      'IDENTIFIER_HMAC_KEY',
      'IDENTIFIER_KEY_VERSION',
    ])
      current[name] = required(target, name);
    await privateWrite(
      sourcePath,
      Object.entries(current)
        .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
        .join('\n') + '\n',
      false,
    );
    await exportEnvironment(target);
    // Record completion only after the local key configuration and exports exist.
    // A prior interruption is recovered via the committed-operation check above.
    manifest.applied = true;
    await writeManifest(manifest);
    report('applied-and-business-data-preserved', {
      demoAccounts: credentials.length,
      storageObjects: manifest.storageObjects,
      privateFiles: 'secrets/demo',
    });
  } finally {
    await client.end();
  }
}

async function exportEnvironment(target: Record<string, string>): Promise<void> {
  const render = Object.fromEntries(
    Object.entries(target).filter(
      ([name]) =>
        !name.startsWith('SEED_') &&
        !name.startsWith('NEXT_PUBLIC_') &&
        !name.startsWith('SMTP_') &&
        ![
          'DIRECT_URL',
          'REPHONE_RUNTIME_DB_PASSWORD',
          'SITE_DOMAIN',
          'CADDY_ACME_EMAIL',
          'API_INTERNAL_BASE_URL',
        ].includes(name),
    ),
  );
  render.API_PUBLIC_URL = 'https://YOUR-PROJECT.vercel.app';
  render.WEB_PUBLIC_URL = render.API_PUBLIC_URL;
  render.WEB_ORIGIN = render.API_PUBLIC_URL;
  const db = new URL(required(render, 'DATABASE_URL'));
  db.searchParams.set('sslrootcert', '/etc/secrets/supabase-prod-ca.crt');
  render.DATABASE_URL = db.href;
  await privateWrite(
    resolve(secretDir, 'render.env'),
    Object.entries(render)
      .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
      .join('\n') + '\n',
    false,
  );
  await privateWrite(
    resolve(secretDir, 'vercel.env'),
    'NODE_ENV="production"\nREPHONE_SKIP_ENV_FILE="true"\nNEXT_PUBLIC_DEMO_MODE="true"\nNEXT_PUBLIC_API_BASE_URL="/api/v1"\nDEALER_ENVIRONMENT="LIVE"\nAPI_PUBLIC_URL="https://YOUR-PROJECT.vercel.app"\nAPI_PROXY_ORIGIN="https://YOUR-API.onrender.com"\nAPI_INTERNAL_BASE_URL="https://YOUR-API.onrender.com/api/v1"\n',
    false,
  );
  await copyFile(caPath, resolve(secretDir, 'supabase-prod-ca.crt'));
}

async function status(): Promise<void> {
  if (!(await exists(manifestPath))) {
    report('not-prepared');
    return;
  }
  const manifest = await readManifest();
  report('status', {
    verified: manifest.verified,
    applied: manifest.applied,
    storageObjects: manifest.storageObjects,
    storageBytes: manifest.storageBytes,
    backupDir: manifest.backupDir,
  });
}

try {
  if (command === 'prepare') await prepare();
  else if (command === 'rehearse') await rehearse();
  else if (command === 'apply') await apply();
  else if (command === 'status') await status();
  else throw new Error('Supported commands: prepare, rehearse, apply --apply, status.');
} catch (error) {
  const message = error instanceof Error ? error.message : 'Demo preparation failed.';
  // Database errors can contain values; only known operational errors are printed.
  process.stderr.write(
    json({
      failed: true,
      errorCode:
        error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined,
      message:
        error && typeof error === 'object' && ('code' in error || 'severity' in error)
          ? 'Database operation failed; no secret values are logged.'
          : message,
    }),
  );
  process.exitCode = 1;
}
