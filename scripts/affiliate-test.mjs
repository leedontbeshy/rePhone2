import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// A dedicated launcher: never inherits a DATABASE_URL, API URL or provider secret from .env.
const root = fileURLToPath(new URL('../', import.meta.url));
const apiRoot = resolve(root, 'apps/api');
const apiRequire = createRequire(resolve(apiRoot, 'package.json'));
const webRequire = createRequire(resolve(root, 'apps/web/package.json'));
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
const database = 'postgresql://rephone:rephone@127.0.0.1:5433/rephone_test';
const env = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => systemKeys.has(key.toLowerCase())),
  ),
  NODE_ENV: 'test',
  DATABASE_URL: database,
  DIRECT_URL: database,
  TEST_DATABASE_URL: database,
  API_PORT: '4001',
  API_PUBLIC_URL: 'http://localhost:4001',
  WEB_PUBLIC_URL: 'http://localhost:3001',
  WEB_ORIGIN: 'http://localhost:3001',
  NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4001/api/v1',
  API_INTERNAL_BASE_URL: 'http://localhost:4001/api/v1',
  JWT_ACCESS_SECRET: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
  IDENTIFIER_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  IDENTIFIER_HMAC_KEY: 'YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk=',
  ARGON2_MEMORY_KIB: '8192',
  ARGON2_TIME_COST: '1',
  ARGON2_PARALLELISM: '1',
  AFFILIATE_ENABLED: 'true',
  AFFILIATE_ENVIRONMENT: 'TEST',
  DEALER_ENABLED: 'false',
  SCHEDULER_ENABLED: 'true',
  LOG_LEVEL: 'warn',
  SUPABASE_URL: 'http://localhost:4001',
  SUPABASE_SERVICE_ROLE_KEY: 'local-test-no-external-storage',
  SUPABASE_PUBLIC_BUCKET: 'public-test',
  SUPABASE_PRIVATE_BUCKET: 'private-test',
  SUPABASE_STORE_BUCKET: 'store-test',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_SECURE: 'false',
  MAIL_FROM: 'rePhone Test <no-reply@rephone.local>',
  SEED_ADMIN_EMAIL: 'admin@rephone.local',
  SEED_ADMIN_PASSWORD: 'AdminDemo123',
  SEED_EMPLOYEE_EMAIL: 'employee@rephone.local',
  SEED_EMPLOYEE_PASSWORD: 'EmployeeDemo123',
  SEED_CUSTOMER_EMAIL: 'customer@rephone.local',
  SEED_CUSTOMER_PASSWORD: 'CustomerDemo123',
  SEED_DEMO_PHONE: '0900000000',
  REPHONE_SANDBOX_WEB: 'true',
  REPHONE_AFFILIATE_TEST: 'true',
};
mkdirSync(resolve(root, '.local/affiliate'), { recursive: true });
function run(args, cwd = apiRoot) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Affiliate test setup failed; check output above.');
}
const mode = process.argv[2] ?? 'start';
if (mode === 'prepare') {
  run([
    resolve(apiRequire.resolve('prisma/package.json'), '../build/index.js'),
    'migrate',
    'deploy',
  ]);
  run([apiRequire.resolve('tsx/cli'), 'prisma/scripts/affiliate-test-seed.ts']);
  run([apiRequire.resolve('@nestjs/cli/bin/nest.js'), 'build']);
} else if (mode === 'start') {
  const api = spawn(process.execPath, [resolve(root, 'scripts/affiliate-test-server.mjs')], {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  const web = spawn(
    process.execPath,
    [webRequire.resolve('next/dist/bin/next'), 'dev', '-H', '127.0.0.1', '-p', '3001'],
    {
      cwd: resolve(root, 'apps/web'),
      env: { ...env, NODE_ENV: 'development' },
      stdio: 'inherit',
      windowsHide: true,
    },
  );
  const stop = () => {
    api.kill();
    web.kill();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  api.once('exit', () => web.kill());
  web.once('exit', () => api.kill());
} else throw new Error('Use prepare or start');
