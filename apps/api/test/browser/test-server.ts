import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTestEnvironment } from '../support/test-environment.js';

setTestEnvironment();
Object.assign(process.env, {
  DEALER_ENABLED: 'true',
  DEALER_ENVIRONMENT: 'TEST',
  DEALER_WORKER_ENABLED: 'false',
});

const workspaceRoot = fileURLToPath(new URL('../../../../', import.meta.url));
run(['test:db:prepare']);
run(['--filter', '@rephone/api', 'exec', 'tsx', 'test/browser/seed.ts']);
if (process.env.DEALER_ENABLED === 'true' && process.env.DEALER_ENVIRONMENT === 'TEST') {
  run(['dealer:sandbox:seed']);
}
run(['--filter', '@rephone/api', 'build']);

const compiledModule: unknown = await import(
  new URL('../../dist/application.js', import.meta.url).href
);
if (!isCompiledApplicationModule(compiledModule)) {
  throw new Error('Compiled API application entrypoint is invalid');
}
const app = await compiledModule.createApplication();
await app.listen(4001, '127.0.0.1');

let closing = false;
async function close(): Promise<void> {
  if (closing) return;
  closing = true;
  await app.close();
}

process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());

function run(arguments_: string[]): void {
  const result = spawnSync('pnpm', arguments_, {
    cwd: workspaceRoot,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Browser server setup failed with exit code ${String(result.status)}`);
  }
}

function isCompiledApplicationModule(
  value: unknown,
): value is { createApplication: () => Promise<INestApplication> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'createApplication' in value &&
    typeof value.createApplication === 'function'
  );
}
