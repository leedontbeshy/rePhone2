import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateGate, gateSummary } from './ci-status.mjs';

const pr = () => ({
  changes: { result: 'success', outputs: { api: 'true', browser: 'false' } },
  validation: { result: 'success' },
  database: { result: 'success' },
  'browser-smoke': { result: 'skipped' },
});
test('PR gate only permits skips confirmed by successful classification', () => {
  assert.deepEqual(evaluateGate('pr', pr()), []);
  for (const status of ['skipped', 'cancelled', 'failure', undefined]) {
    for (const job of ['changes', 'validation', 'database']) {
      const needs = pr();
      needs[job].result = status;
      assert.ok(evaluateGate('pr', needs).length, `${job}: ${status}`);
    }
  }
  for (const flag of ['true', '', undefined, 'yes']) {
    const needs = pr();
    needs.changes.outputs.browser = flag;
    assert.ok(evaluateGate('pr', needs).length);
  }
  const missing = pr();
  delete missing['browser-smoke'];
  assert.ok(evaluateGate('pr', missing).length);
});
test('release requires every suite and summaries only include known status fields', () => {
  const needs = Object.fromEntries(
    ['production-images', 'fast-gates', 'database-gates', 'browser-gate', 'performance-gate'].map(
      (job) => [job, { result: 'success' }],
    ),
  );
  assert.deepEqual(evaluateGate('release', needs), []);
  for (const status of ['skipped', 'cancelled', 'failure', undefined]) {
    needs['browser-gate'].result = status;
    assert.ok(evaluateGate('release', needs).length);
  }
  needs['browser-gate'] = { result: 'secret=unsafe', outputs: { token: 'private' } };
  const summary = gateSummary('release', needs, {
    sha: 'a'.repeat(40),
    runId: '123',
    attempt: '1',
  });
  assert.doesNotMatch(summary, /unsafe|private/);
  assert.match(summary, /missing/);
});
