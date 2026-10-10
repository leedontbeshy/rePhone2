import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, symlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const directory = resolve(root, '.local/dealer-sandbox');
const configFile = resolve(directory, 'environment.json');
mkdirSync(directory, { recursive: true });
if (!existsSync(configFile)) {
  const secret = () => randomBytes(32).toString('base64');
  writeFileSync(
    configFile,
    JSON.stringify(
      {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://rephone:rephone@127.0.0.1:5433/rephone_dealer_sandbox',
        DIRECT_URL: 'postgresql://rephone:rephone@127.0.0.1:5433/rephone_dealer_sandbox',
        API_PORT: '4002',
        API_PUBLIC_URL: 'http://127.0.0.1:4002',
        WEB_PUBLIC_URL: 'http://127.0.0.1:3002',
        WEB_ORIGIN: 'http://127.0.0.1:3002',
        NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4002/api/v1',
        API_INTERNAL_BASE_URL: 'http://127.0.0.1:4002/api/v1',
        JWT_ACCESS_SECRET: secret(),
        IDENTIFIER_ENCRYPTION_KEY: secret(),
        IDENTIFIER_HMAC_KEY: secret(),
        DEALER_ENCRYPTION_KEY: secret(),
        SUPABASE_URL: 'http://127.0.0.1:4002',
        SUPABASE_SERVICE_ROLE_KEY: 'local-sandbox-no-external-storage',
        SUPABASE_PUBLIC_BUCKET: 'public-sandbox',
        SUPABASE_PRIVATE_BUCKET: 'private-sandbox',
        SUPABASE_STORE_BUCKET: 'store-sandbox',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: '1025',
        SMTP_SECURE: 'false',
        SMTP_REQUIRE_TLS: 'false',
        MAIL_FROM: 'rePhone Sandbox <sandbox@rephone.local>',
        LOG_LEVEL: 'warn',
        SCHEDULER_ENABLED: 'false',
        DEALER_ENABLED: 'true',
        DEALER_ENVIRONMENT: 'TEST',
        DEALER_WORKER_ENABLED: 'true',
        DEALER_LIVE_WEB_URL: 'http://localhost:3000',
        DEALER_SANDBOX_WEB_URL: 'http://127.0.0.1:3002',
        DEALER_SANDBOX_API_URL: 'http://127.0.0.1:4002/api/v1',
        REPHONE_SANDBOX_WEB: 'true',
        ARGON2_MEMORY_KIB: '8192',
        ARGON2_TIME_COST: '1',
        ARGON2_PARALLELISM: '1',
        SEED_ADMIN_EMAIL: 'admin@sandbox.rephone.local',
        SEED_ADMIN_PASSWORD: 'AdminSandbox123',
        SEED_EMPLOYEE_EMAIL: 'employee@sandbox.rephone.local',
        SEED_EMPLOYEE_PASSWORD: 'EmployeeSandbox123',
        SEED_CUSTOMER_EMAIL: 'dealer@sandbox.rephone.local',
        SEED_CUSTOMER_PASSWORD: 'DealerSandbox123',
        SEED_DEMO_PHONE: '0900000000',
      },
      null,
      2,
    ),
  );
}
const settings = JSON.parse(readFileSync(configFile, 'utf8'));
const target = new URL(settings.DATABASE_URL);
if (
  !['127.0.0.1', 'localhost'].includes(target.hostname) ||
  target.pathname !== '/rephone_dealer_sandbox' ||
  settings.DIRECT_URL !== settings.DATABASE_URL ||
  settings.DEALER_ENVIRONMENT !== 'TEST'
)
  throw new Error(
    'Sandbox runner only supports the dedicated local rephone_dealer_sandbox database.',
  );
// Deliberately do not inherit workspace credentials or dotenv values into the local sandbox.
const systemKeys = new Set([
  'path',
  'pathext',
  'systemroot',
  'windir',
  'comspec',
  'temp',
  'tmp',
  'userprofile',
  'appdata',
  'localappdata',
  'home',
  'homedrive',
  'homepath',
  'programfiles',
  'programfiles(x86)',
  'number_of_processors',
  'processor_architecture',
]);
const env = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => systemKeys.has(key.toLowerCase())),
  ),
  ...settings,
  REPHONE_LOCAL_SANDBOX: 'true',
};
const apiDirectory = resolve(root, 'apps/api');
const webSource = resolve(root, 'apps/web');
const webDirectory = resolve(directory, 'web');
const tsx = require.resolve('tsx/cli');
const prismaCli = resolve(require.resolve('prisma/package.json'), '../build/index.js');
const webRequire = createRequire(resolve(webSource, 'package.json'));
function run(command, args, cwd = root, overrides = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...env, ...overrides },
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Sandbox setup failed; no live data was changed.');
}
const mode = process.argv[2] ?? 'start';
if (mode === 'prepare') {
  run('docker', ['compose', '--profile', 'test', 'up', '-d', '--wait', 'postgres-test']);
  const { Client } = require('pg');
  const adminTarget = new URL(target);
  adminTarget.pathname = '/postgres';
  const db = new Client({ connectionString: adminTarget.toString() });
  await db.connect();
  try {
    const existing = await db.query('SELECT 1 FROM pg_database WHERE datname=$1', [
      'rephone_dealer_sandbox',
    ]);
    if (!existing.rowCount) await db.query('CREATE DATABASE rephone_dealer_sandbox');
  } finally {
    await db.end();
  }
  run(process.execPath, [prismaCli, 'migrate', 'deploy'], apiDirectory);
  run(process.execPath, [tsx, 'prisma/scripts/dealer-sandbox-seed.ts'], apiDirectory, {
    DEALER_WORKER_ENABLED: 'false',
  });
  writeFileSync(
    resolve(directory, 'accounts.txt'),
    `LOCAL SANDBOX ONLY\nPortal: ${settings.WEB_PUBLIC_URL}/dealer\nAPI: ${settings.API_PUBLIC_URL}/api/v1\nDealer: ${settings.SEED_CUSTOMER_EMAIL} / ${settings.SEED_CUSTOMER_PASSWORD}\nAdmin: ${settings.SEED_ADMIN_EMAIL} / ${settings.SEED_ADMIN_PASSWORD}\n\nStart: pnpm dealer:sandbox\nStop: Ctrl+C in that terminal. Database is preserved.\nThese demo accounts must not be exposed on a public deployment.\n`,
  );
  console.log('Sandbox prepared. Account instructions: .local/dealer-sandbox/accounts.txt');
} else if (mode === 'start') {
  // Next rewrites next-env.d.ts even with a separate distDir. Keep a local web
  // snapshot so concurrent Live and Sandbox servers never rewrite each other's types.
  mkdirSync(webDirectory, { recursive: true });
  for (const name of [
    'app',
    'components',
    'lib',
    'styles',
    'public',
    'package.json',
    'next.config.ts',
  ]) {
    const source = resolve(webSource, name);
    if (existsSync(source)) cpSync(source, resolve(webDirectory, name), { recursive: true });
  }
  const webTsconfig = JSON.parse(readFileSync(resolve(webSource, 'tsconfig.json'), 'utf8'));
  webTsconfig.extends = relative(
    webDirectory,
    resolve(root, 'packages/typescript-config/nextjs.json'),
  ).replaceAll('\\', '/');
  writeFileSync(resolve(webDirectory, 'tsconfig.json'), JSON.stringify(webTsconfig, null, 2));
  if (!existsSync(resolve(webDirectory, 'node_modules')))
    symlinkSync(
      resolve(webSource, 'node_modules'),
      resolve(webDirectory, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  // Compile Nest decorators exactly as in the live app; tsx alone omits DTO metadata.
  run(
    process.execPath,
    [
      require.resolve('typescript/bin/tsc'),
      '-p',
      'tsconfig.build.json',
      '--outDir',
      '.sandbox-dist',
      '--tsBuildInfoFile',
      '.sandbox-dist/.tsbuildinfo',
    ],
    apiDirectory,
  );
  const children = [];
  const start = (args, cwd, overrides = {}) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: { ...env, ...overrides },
      stdio: 'inherit',
      windowsHide: true,
    });
    children.push(child);
    child.on('exit', (code) => {
      if (!closing) {
        console.error('Sandbox process stopped:', code);
        stop();
      }
    });
    return child;
  };
  let closing = false;
  function stop() {
    closing = true;
    for (const child of children) child.kill('SIGTERM');
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  start([tsx, 'prisma/scripts/dealer-sandbox-server.ts'], apiDirectory);
  start(
    [webRequire.resolve('next/dist/bin/next'), 'dev', '-H', '127.0.0.1', '-p', '3002'],
    webDirectory,
    { NODE_ENV: 'development' },
  );
  console.log('Sandbox: http://127.0.0.1:3002/dealer · API: http://127.0.0.1:4002/api/v1');
} else throw new Error('Use prepare or start.');
