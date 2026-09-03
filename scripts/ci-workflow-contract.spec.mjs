import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const prWorkflow = readFileSync('.github/workflows/pr-checks.yml', 'utf8');
const releaseWorkflow = readFileSync('.github/workflows/release-verification.yml', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

test('pull request checks keep expensive gates scoped to affected code', () => {
  assert.match(prWorkflow, /^name: Pull request checks$/m);
  assert.match(prWorkflow, /^ {2}pull_request:$/m);
  assert.match(prWorkflow, /if: needs\.changes\.outputs\.api == 'true'/);
  assert.match(prWorkflow, /if: needs\.changes\.outputs\.browser == 'true'/);
  assert.doesNotMatch(prWorkflow, /performance:release/);
  assert.doesNotMatch(prWorkflow, /test:coverage/);
});

test('release verification runs fully on main, manually, or for a labeled pull request', () => {
  assert.match(releaseWorkflow, /^ {2}workflow_dispatch:$/m);
  assert.match(releaseWorkflow, /^ {6}- main$/m);
  assert.match(releaseWorkflow, /types: \[labeled, synchronize\]/);
  assert.equal(
    releaseWorkflow.match(/contains\(github\.event\.pull_request\.labels\.\*\.name, 'full-ci'\)/g)
      ?.length,
    4,
  );
});

test('the pull request browser command stays a bounded Chromium smoke suite', () => {
  const command = packageJson.scripts['test:browser:pr-smoke'];
  assert.match(command, /skip-links-and-axe/);
  assert.match(command, /anonymous-fail-closed/);
  assert.match(command, /catalog-to-completed-shipping/);
  assert.doesNotMatch(command, /cross-browser/);
});
