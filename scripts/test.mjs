import { mkdirSync, openSync, closeSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { run, testEnvironment, workspaceRoot } from './environment.mjs';
const suite = process.argv[2];
const args = process.argv.slice(3);
if (
  !['integration', 'e2e', 'coverage', 'browser', 'performance', 'docker', 'container'].includes(
    suite,
  )
)
  throw new Error('Unknown test suite.');
const env = testEnvironment();
const ownsDatabase = !process.env.TEST_DATABASE_URL && suite !== 'container';
const compose = [
  'compose',
  '--env-file',
  '.env.example',
  '-p',
  'rephone-tests',
  '--profile',
  'test',
];
mkdirSync(resolve(workspaceRoot, '.local'), { recursive: true });
const lock = resolve(workspaceRoot, '.local/test-run.lock');
let locked = false;
try {
  if (ownsDatabase) {
    const fd = openSync(lock, 'wx');
    writeFileSync(fd, String(process.pid));
    closeSync(fd);
    locked = true;
  }
  if (suite === 'docker') {
    run('docker', [...compose, 'run', '--build', '--rm', 'api-test'], { env });
  } else {
    if (ownsDatabase) run('docker', [...compose, 'up', '-d', '--wait', 'postgres-test'], { env });
    const api = (...command) => run('pnpm', ['--filter', '@rephone/api', ...command], { env });
    api('exec', 'tsx', 'prisma/scripts/prepare-test-database.ts');
    if (['integration', 'coverage'].includes(suite)) api('db:check');
    if (suite === 'container') {
      run('pnpm', ['test'], { env });
      api('test:integration');
      api('test:e2e');
    } else if (['integration', 'e2e', 'coverage'].includes(suite)) {
      api(`test:${suite}`, ...args);
      if (suite === 'integration' && args.length === 0)
        api('exec', 'tsx', 'test/migrations/dealer-upgrade.ts');
    } else {
      const webEnv = {
        ...env,
        NODE_ENV: 'production',
        REPHONE_WEB_DIST_DIR: suite === 'performance' ? '.next-performance' : '.next-test',
      };
      if (suite === 'performance') {
        run('node', ['scripts/build-performance-web.mjs'], {
          env: {
            ...webEnv,
            PERFORMANCE_SOURCE_MODE: env.PERFORMANCE_SOURCE_MODE ?? 'working-tree',
          },
        });
        run(
          'node',
          ['scripts/audit-client-media.mjs', '--output', '.local/performance/client-media.json'],
          { env: webEnv },
        );
      } else run('pnpm', ['--filter', '@rephone/web', 'build'], { env: webEnv });
      run(
        'pnpm',
        [
          'exec',
          'playwright',
          'test',
          ...(suite === 'performance' ? ['--config', 'playwright.performance.config.ts'] : []),
          ...args,
        ],
        {
          env: {
            ...env,
            REPHONE_WEB_DIST_DIR: webEnv.REPHONE_WEB_DIST_DIR,
            PLAYWRIGHT_WEB_SERVER: 'production',
            PERFORMANCE_SOURCE_MODE: env.PERFORMANCE_SOURCE_MODE ?? 'working-tree',
          },
        },
      );
    }
  }
} finally {
  if (ownsDatabase && locked) {
    try {
      run('docker', [...compose, 'down'], { env });
    } finally {
      unlinkSync(lock);
    }
  }
}
