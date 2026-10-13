import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { spawn, spawnSync } from 'node:child_process';

export const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));

export function readEnvironment(file, inherited = process.env) {
  const path = resolve(workspaceRoot, file);
  if (!existsSync(path))
    throw new Error(`Missing ${file}. Copy its example and fill the required settings.`);
  return { ...parseEnv(readFileSync(path, 'utf8')), ...inherited };
}

export function assertLocalDatabase(value, purpose) {
  const url = new URL(value ?? 'postgresql://invalid/invalid');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const local =
    ['localhost', '::1', purpose === 'dev' ? 'postgres-dev' : 'postgres-test'].includes(host) ||
    /^127(?:\.\d{1,3}){3}$/.test(host);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !local ||
    url.hash ||
    [...url.searchParams.keys()].some((key) =>
      /^(host|hostaddr|port|user|password|database|dbname|service|servicefile)$/i.test(key),
    ) ||
    (purpose === 'dev' ? url.pathname !== '/rephone_dev' : !url.pathname.endsWith('_test'))
  ) {
    throw new Error(
      `Refusing ${purpose} operation: a dedicated local ${purpose === 'dev' ? 'rephone_dev' : '*_test'} database is required.`,
    );
  }
  return url;
}

export function testEnvironment(inherited = process.env) {
  const system = Object.fromEntries(
    Object.entries(inherited).filter(
      ([key]) =>
        /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|SYSTEMDRIVE|COMSPEC|TEMP|TMP|TMPDIR|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|NUMBER_OF_PROCESSORS|PNPM_HOME|NODE_OPTIONS|CI|TERM|COLORTERM|FORCE_COLOR|npm_execpath|npm_node_execpath)$/i.test(
          key,
        ) || /^(PLAYWRIGHT_|PERFORMANCE_|TEST_)/.test(key),
    ),
  );
  const database =
    inherited.TEST_DATABASE_URL ?? 'postgresql://rephone:rephone@localhost:5434/rephone_test';
  assertLocalDatabase(database, 'test');
  const defaults = parseEnv(readFileSync(resolve(workspaceRoot, '.env.example'), 'utf8'));
  return {
    ...defaults,
    ...system,
    NODE_ENV: 'test',
    REPHONE_SKIP_ENV_FILE: 'true',
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
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-placeholder-service-role-key',
    SUPABASE_PUBLIC_BUCKET: 'public-test',
    SUPABASE_PRIVATE_BUCKET: 'private-test',
    SUPABASE_STORE_BUCKET: 'store-test',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    SMTP_USER: '',
    SMTP_PASSWORD: '',
    SCHEDULER_ENABLED: 'false',
    DEALER_ENABLED: 'false',
    AFFILIATE_ENABLED: 'false',
    DEALER_WORKER_ENABLED: 'false',
    DEALER_ENVIRONMENT: 'TEST',
    AFFILIATE_ENVIRONMENT: 'TEST',
    DEALER_ENCRYPTION_KEY: '',
    AFFILIATE_ENCRYPTION_KEY: '',
    ARGON2_MEMORY_KIB: '8192',
    ARGON2_TIME_COST: '1',
    LOG_LEVEL: 'silent',
  };
}

function invocation(command, args) {
  if (command === 'pnpm' && process.env.npm_execpath)
    return [process.execPath, [process.env.npm_execpath, ...args], false];
  return [command, args, command === 'pnpm' && process.platform === 'win32'];
}
export function run(command, args, options = {}) {
  const [executable, parameters, shell] = invocation(command, args);
  const result = spawnSync(executable, parameters, {
    cwd: workspaceRoot,
    stdio: 'inherit',
    windowsHide: true,
    shell,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args[0] ?? ''} failed (${result.status ?? result.signal}).`);
}
export function start(command, args, options = {}) {
  const [executable, parameters, shell] = invocation(command, args);
  return spawn(executable, parameters, {
    cwd: workspaceRoot,
    stdio: 'inherit',
    windowsHide: true,
    shell,
    ...options,
  });
}
