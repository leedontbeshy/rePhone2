import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DEFAULT_TEST_DATABASE_URL = 'postgresql://rephone:rephone@localhost:5433/rephone_test';
const repositoryRoot = new URL('../', import.meta.url);

export function assertTestDatabaseUrl(databaseUrl) {
  const target = new URL(databaseUrl);
  const databaseName = target.pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing release verification for non-test database ${databaseName || '<empty>'}`,
    );
  }
  if (!isLocalTestDatabaseHost(target.hostname)) {
    throw new Error(`Refusing release verification for remote database host ${target.hostname}`);
  }
}

export function containerCleanupAction({
  externalDatabaseUrl,
  existingContainerId,
  runningContainerId,
}) {
  if (externalDatabaseUrl !== undefined) return 'none';
  if (existingContainerId.trim().length === 0) return 'remove';
  if (runningContainerId.trim().length === 0) return 'stop';
  return 'none';
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: options.capture ? 'utf8' : undefined,
    env: options.env ?? process.env,
    shell: process.platform === 'win32' && command === 'pnpm',
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${String(result.status)}`);
  }
  return options.capture ? String(result.stdout).trim() : '';
}

function isLocalTestDatabaseHost(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === 'postgres-test' ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

function restoreContainerState(cleanupAction) {
  if (cleanupAction === 'remove') {
    run('docker', ['compose', '--profile', 'test', 'rm', '--stop', '--force', 'postgres-test']);
  } else if (cleanupAction === 'stop') {
    run('docker', ['compose', '--profile', 'test', 'stop', 'postgres-test']);
  }
}

function main() {
  const suppliedDatabaseUrl = process.env.TEST_DATABASE_URL?.trim() || undefined;
  const databaseUrl = suppliedDatabaseUrl ?? DEFAULT_TEST_DATABASE_URL;
  assertTestDatabaseUrl(databaseUrl);

  let cleanupAction = 'none';
  let exitCode = 0;

  try {
    if (suppliedDatabaseUrl === undefined) {
      const existingContainerId = run(
        'docker',
        ['compose', '--profile', 'test', 'ps', '--all', '--quiet', 'postgres-test'],
        { capture: true },
      );
      const runningContainerId = run(
        'docker',
        ['compose', '--profile', 'test', 'ps', '--status', 'running', '--quiet', 'postgres-test'],
        { capture: true },
      );
      cleanupAction = containerCleanupAction({
        existingContainerId,
        externalDatabaseUrl: suppliedDatabaseUrl,
        runningContainerId,
      });
      run('docker', ['compose', '--profile', 'test', 'up', '-d', '--wait', 'postgres-test']);
    }

    const verificationEnvironment = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      TEST_DATABASE_URL: databaseUrl,
    };

    for (const pass of [1, 2]) {
      console.log(`\nRelease verification pass ${String(pass)}/2`);
      run('pnpm', ['verify:release:once'], { env: verificationEnvironment });
    }
  } catch (error) {
    exitCode = 1;
    console.error(error instanceof Error ? error.message : error);
  } finally {
    if (cleanupAction !== 'none') {
      try {
        restoreContainerState(cleanupAction);
      } catch (error) {
        exitCode = 1;
        console.error('Could not restore the PostgreSQL test container to its original state.');
        console.error(error instanceof Error ? error.message : error);
      }
    }
  }

  process.exitCode = exitCode;
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href) {
  main();
}
