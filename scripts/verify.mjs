import { run, testEnvironment } from './environment.mjs';
const env = testEnvironment();
for (const command of ['format:check', 'lint', 'typecheck', 'test', 'api:generate'])
  run('pnpm', [command], { env });
run('git', [
  'diff',
  '--exit-code',
  '--',
  'apps/api/openapi/openapi.json',
  'packages/api-client/src/schema.d.ts',
]);
run('pnpm', ['build'], { env });
for (const command of [
  'test:integration',
  'test:e2e',
  'test:coverage',
  'test:browser',
  'test:performance',
])
  run('pnpm', [command]);
