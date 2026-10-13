import { assertLocalDatabase, readEnvironment, run, start } from './environment.mjs';
import { spawnSync } from 'node:child_process';
const env = readEnvironment('.env');
if (env.NODE_ENV !== 'development')
  throw new Error('pnpm dev requires NODE_ENV=development in .env.');
assertLocalDatabase(env.DATABASE_URL, 'dev');
assertLocalDatabase(env.DIRECT_URL, 'dev');
env.REPHONE_SKIP_ENV_FILE = 'true';
env.API_HOST = '127.0.0.1';
run(
  'docker',
  ['compose', '--profile', 'dev', 'up', '-d', '--wait', 'postgres-dev', 'mailpit-dev'],
  { env },
);
run('pnpm', ['db:deploy'], { env });
run('pnpm', ['db:seed'], { env });
const children = [
  start('pnpm', ['--filter', '@rephone/api', 'dev'], { env }),
  start('pnpm', ['--filter', '@rephone/web', 'dev', '--hostname', '127.0.0.1'], { env }),
];
let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) {
    if (process.platform === 'win32' && child.pid && child.exitCode === null) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else child.kill('SIGTERM');
  }
  process.exitCode = code;
}
for (const child of children) {
  child.once('error', () => close(1));
  child.once('exit', (code) => close(code ?? 0));
}
process.once('SIGINT', () => close());
process.once('SIGTERM', () => close());
