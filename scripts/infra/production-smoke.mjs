import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { run, testEnvironment, workspaceRoot } from '../environment.mjs';

const nonce = randomBytes(12).toString('hex');
const project = `rephone-smoke-${nonce}`;
const env = testEnvironment();
const capture = (command, args) =>
  execFileSync(command, args, {
    cwd: workspaceRoot,
    env,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const endpoint = capture('docker', [
  'context',
  'inspect',
  '--format',
  '{{.Endpoints.docker.Host}}',
]);
if (!/^(npipe|unix):\/\//.test(endpoint) || process.env.DOCKER_HOST) {
  throw new Error('Production smoke requires a local Docker context.');
}
const secret = () => randomBytes(32).toString('hex');
const dbPassword = secret();
const runtimePassword = secret();
Object.assign(env, {
  SMOKE_PROJECT: project,
  SMOKE_NONCE: nonce,
  SMOKE_OPS_IMAGE: `${project}-ops`,
  SMOKE_API_IMAGE: `${project}-api`,
  SMOKE_WEB_IMAGE: `${project}-web`,
  SMOKE_DB_PASSWORD: dbPassword,
  SMOKE_RUNTIME_DB_PASSWORD: runtimePassword,
  SMOKE_DIRECT_URL: `postgresql://smoke_owner:${dbPassword}@smoke-database:5432/rephone_test?sslmode=verify-full&sslrootcert=/certs/ca.crt`,
  SMOKE_RUNTIME_URL: `postgresql://rephone_runtime:${runtimePassword}@smoke-database:5432/rephone_test?sslmode=verify-full&sslrootcert=/certs/ca.crt`,
  SMOKE_JWT_SECRET: secret(),
  SMOKE_STORAGE_KEY: secret(),
  SMOKE_IDENTIFIER_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  SMOKE_IDENTIFIER_HMAC_KEY: randomBytes(32).toString('base64'),
  SMOKE_ADMIN_EMAIL: `admin-${nonce}@example.invalid`,
  SMOKE_ADMIN_PASSWORD: `A9!${secret()}`,
  SMOKE_CUSTOMER_EMAIL: `customer-${nonce}@example.invalid`,
  SMOKE_CUSTOMER_PASSWORD: `C9!${secret()}`,
  SMOKE_RELEASE_SHA: capture('git', ['rev-parse', 'HEAD']),
});
const compose = ['compose', '--env-file', '.env.example', '-p', project, '--profile', 'test'];
try {
  run('docker', [...compose, 'config', '--quiet'], { env });
  for (const service of ['smoke-migrate', 'smoke-api', 'smoke-web'])
    run('docker', [...compose, 'build', service], { env });
  run(
    'docker',
    [...compose, 'up', '-d', '--wait', '--wait-timeout', '180', 'smoke-api', 'smoke-web'],
    { env },
  );
  run('docker', [...compose, 'run', '--rm', '--no-deps', 'smoke-probe'], { env });
  console.log('Production image smoke passed.');
} finally {
  cleanup();
}
function cleanup() {
  // Only this invocation's ephemeral resources can be removed.
  for (const kind of ['container', 'network', 'volume']) {
    const ids = capture('docker', [
      kind,
      'ls',
      ...(kind === 'container' ? ['--all'] : []),
      '-q',
      '--filter',
      `label=com.docker.compose.project=${project}`,
    ])
      .split(/\s+/)
      .filter(Boolean);
    for (const id of ids) {
      const labels = JSON.parse(
        capture('docker', [
          kind,
          'inspect',
          id,
          '--format',
          kind === 'container' ? '{{json .Config.Labels}}' : '{{json .Labels}}',
        ]),
      );
      if (
        labels['com.docker.compose.project'] !== project ||
        labels['com.rephone.production-smoke'] !== nonce
      )
        throw new Error(`Refusing cleanup of unrecognized ${kind}.`);
    }
  }
  run('docker', [...compose, 'down', '--volumes', '--timeout', '20'], { env });
  for (const tag of [env.SMOKE_OPS_IMAGE, env.SMOKE_API_IMAGE, env.SMOKE_WEB_IMAGE]) {
    if (!capture('docker', ['image', 'ls', '-q', tag])) continue;
    const label = capture('docker', [
      'image',
      'inspect',
      tag,
      '--format',
      '{{index .Config.Labels "com.rephone.production-smoke"}}',
    ]);
    if (label !== nonce) throw new Error('Refusing cleanup of unrecognized smoke image.');
    run('docker', ['image', 'rm', tag], { env });
  }
}
