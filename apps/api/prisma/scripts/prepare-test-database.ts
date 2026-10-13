import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { databaseTargetIssue } from '../../src/config/database-target.js';

const defaultTestUrl = 'postgresql://rephone:rephone@localhost:5434/rephone_test';
const databaseUrl = process.env.TEST_DATABASE_URL ?? defaultTestUrl;
const target = new URL(databaseUrl);
const targetIssue = databaseTargetIssue(databaseUrl, 'test');
if (targetIssue) throw new Error(`Refusing destructive test migration: ${targetIssue}`);

if (process.env.TEST_DATABASE_URL === undefined)
  throw new Error(
    'Run a test suite through the root test runner to prepare its isolated database.',
  );

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  const actual = await client.query<{ name: string }>('SELECT current_database() AS name');
  if (actual.rows[0]?.name !== decodeURIComponent(target.pathname.slice(1))) {
    throw new Error('Refusing test reset: the connected database differs from the isolated target');
  }
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
