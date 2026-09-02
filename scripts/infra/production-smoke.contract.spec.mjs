import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const composeUrl = new URL('./production-smoke.compose.yaml', import.meta.url);
const runnerUrl = new URL('./Invoke-ProductionSmoke.ps1', import.meta.url);
const probeUrl = new URL('./production-smoke-probe.mjs', import.meta.url);

test('isolates exact production image targets behind an internal network', async () => {
  const [compose, runner] = await Promise.all([
    readFile(composeUrl, 'utf8'),
    readFile(runnerUrl, 'utf8'),
  ]);
  assert.match(compose, /image: postgres:17\.6-alpine/);
  assert.match(compose, /POSTGRES_DB: rephone_smoke_test/);
  assert.doesNotMatch(compose, /POSTGRES_DB: rephone_smoke\s*$/m);
  assert.match(compose, /tmpfs:\s*\n\s+- \/var\/lib\/postgresql\/data/);
  assert.match(compose, /target: api-operations/);
  assert.match(compose, /target: api-runtime/);
  assert.match(compose, /target: web-runtime/);
  assert.match(compose, /\n\s+internal: true/);
  assert.doesNotMatch(compose, /^\s*ports\s*:/m);
  assert.match(runner, /sslmode=verify-full/);
  assert.match(compose, /ssl_cert_file=\/certs\/server\.crt/);
  assert.match(compose, /cert-init:[\s\S]*target: api-operations/);
  assert.match(compose, /cert-init: \{ condition: service_completed_successfully \}/);
  assert.match(compose, /cert-init:[\s\S]*openssl req/);
  assert.doesNotMatch(compose.match(/database:[\s\S]*?\n\s+migrate:/)?.[0] ?? '', /openssl req/);
});

test('keeps external providers inert and secrets ephemeral', async () => {
  const [compose, runner] = await Promise.all([
    readFile(composeUrl, 'utf8'),
    readFile(runnerUrl, 'utf8'),
  ]);
  assert.match(compose, /SUPABASE_URL: https:\/\/storage\.example\.invalid/);
  assert.match(compose, /SCHEDULER_ENABLED: 'false'/);
  assert.doesNotMatch(compose, /supabase\.co/i);
  assert.doesNotMatch(runner, /--env-file|\.env\.docker|Get-Content\s+.*\.env/i);
  assert.match(runner, /RandomNumberGenerator/);
  assert.match(runner, /Remove-Item -Path "Env:\$name"/);
});

test('fails closed before cleanup and covers the critical production probes', async () => {
  const [runner, probe] = await Promise.all([
    readFile(runnerUrl, 'utf8'),
    readFile(probeUrl, 'utf8'),
  ]);
  assert.match(runner, /status --porcelain/);
  assert.match(runner, /\^npipe:\/\//);
  assert.match(runner, /Assert-CleanupTargets/);
  assert.match(runner, /'ls', '--all', '-q'/);
  assert.match(runner, /com\.rephone\.production-smoke/);
  assert.match(probe, /\/health\/live/);
  assert.match(probe, /\/health\/ready/);
  assert.match(probe, /Anonymous account denied/);
  assert.match(probe, /Customer backoffice denied/);
  assert.match(probe, /Admin overview/);
  assert.match(probe, /Admin system health/);
  assert.match(probe, /Web health/);
});
