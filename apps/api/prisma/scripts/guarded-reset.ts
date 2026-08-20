import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';

loadWorkspaceEnvironment();

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error('DIRECT_URL or DATABASE_URL is required');
}

const target = new URL(databaseUrl);
const databaseName = target.pathname.replace(/^\//, '');
const allowedDatabases = new Set(['rephone_dev', 'rephone_test', 'rephone_demo']);
if (process.env.NODE_ENV === 'production' || !allowedDatabases.has(databaseName)) {
  throw new Error(`Refusing reset for database ${databaseName || '<empty>'}`);
}
if (!process.argv.includes('--confirm-reset')) {
  throw new Error(
    `Reset target is ${target.hostname}/${databaseName}. Re-run with --confirm-reset to continue.`,
  );
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
} finally {
  await client.end();
}

const migrate = spawnSync(
  'pnpm',
  ['exec', 'prisma', 'migrate', 'deploy', '--config', 'prisma.config.ts'],
  { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' },
);
if (migrate.error !== undefined) {
  throw migrate.error;
}
if (migrate.status !== 0) {
  process.exit(migrate.status ?? 1);
}

const seed = spawnSync('pnpm', ['exec', 'prisma', 'db', 'seed', '--config', 'prisma.config.ts'], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});
if (seed.error !== undefined) {
  throw seed.error;
}
process.exit(seed.status ?? 1);
