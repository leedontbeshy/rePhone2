import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

for (const target of [
  'postgresql://rephone:rephone@localhost:5432/rephone_dev',
  'postgresql://rephone:rephone@localhost:5432/rephone_ci',
  'postgresql://rephone:rephone@db.example.invalid:5432/rephone_test',
  'postgresql://rephone:rephone@localhost:5432/rephone_test?host=db.example.invalid',
]) {
  const result = spawnSync(
    'pnpm',
    ['--filter', '@rephone/api', 'exec', 'tsx', 'prisma/scripts/prepare-test-database.ts'],
    {
      env: { ...process.env, TEST_DATABASE_URL: target },
      encoding: 'utf8',
      shell: process.platform === 'win32',
      windowsHide: true,
      timeout: 30_000,
    },
  );
  assert.ifError(result.error);
  assert.notEqual(result.status, 0, 'Unsafe database target was accepted');
  assert.match(
    result.stderr,
    /Error: Refusing destructive test migration: (?:tests require a dedicated database ending _test|must target the dedicated local database|must not override the database target through query parameters)/,
    'Expected target validation before database connection; a connection failure is not evidence',
  );
}
process.stdout.write('All unsafe targets were rejected by validation before connecting.\n');
