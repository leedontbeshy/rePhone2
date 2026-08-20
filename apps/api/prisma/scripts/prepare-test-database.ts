import { spawnSync } from 'node:child_process';
import { Client } from 'pg';

const defaultTestUrl = 'postgresql://rephone:rephone@localhost:5433/rephone_test';
const databaseUrl = process.env.TEST_DATABASE_URL ?? defaultTestUrl;
const target = new URL(databaseUrl);
const databaseName = target.pathname.replace(/^\//, '');
if (!databaseName.endsWith('_test')) {
  throw new Error(`Refusing test migration for non-test database ${databaseName || '<empty>'}`);
}

if (process.env.TEST_DATABASE_URL === undefined) {
  const compose = spawnSync(
    'docker',
    ['compose', '--profile', 'test', 'up', '-d', '--wait', 'postgres-test'],
    { stdio: 'inherit', cwd: new URL('../../../../', import.meta.url) },
  );
  if (compose.status !== 0) {
    process.exit(compose.status ?? 1);
  }
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
} finally {
  await client.end();
}

const environment = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  DIRECT_URL: databaseUrl,
};
const migrate = spawnSync(
  'pnpm',
  ['exec', 'prisma', 'migrate', 'deploy', '--config', 'prisma.config.ts'],
  { stdio: 'inherit', env: environment, shell: process.platform === 'win32' },
);
if (migrate.error !== undefined) {
  throw migrate.error;
}
process.exit(migrate.status ?? 1);
