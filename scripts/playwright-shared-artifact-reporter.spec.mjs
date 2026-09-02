import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import PlaywrightSharedArtifactReporter from './playwright-shared-artifact-reporter.mjs';

test('writes an allowlisted HTML and JSON report without step values or Git metadata', async () => {
  const outputFolder = await mkdtemp(path.join(os.tmpdir(), 'rephone-browser-report-'));
  const reporter = new PlaywrightSharedArtifactReporter({ outputFolder });
  const testCase = {
    id: 'safe-test-id',
    title: 'customer can sign in',
    location: {
      file: path.join(process.cwd(), 'tests/browser/login.spec.ts'),
      line: 12,
      column: 3,
    },
    expectedStatus: 'passed',
    parent: { project: () => ({ name: 'chromium' }) },
    outcome: () => 'expected',
  };

  reporter.onConfigure({ rootDir: process.cwd(), metadata: { gitDiff: 'private diff' } });
  reporter.onTestEnd(testCase, {
    status: 'passed',
    duration: 125,
    retry: 0,
    steps: [{ title: 'Fill "customer@example.com"' }],
    errors: [{ message: 'password was private-value' }],
    stdout: ['private stdout'],
    attachments: [{ name: 'trace', path: 'trace.zip' }],
  });
  await reporter.onEnd({
    status: 'passed',
    startTime: new Date('2026-09-02T00:00:00.000Z'),
    duration: 200,
  });

  try {
    const json = await readFile(path.join(outputFolder, 'report.json'), 'utf8');
    const html = await readFile(path.join(outputFolder, 'index.html'), 'utf8');
    const report = JSON.parse(json);

    assert.equal(report.stats.total, 1);
    assert.equal(report.stats.expected, 1);
    assert.equal(report.tests[0].title, 'customer can sign in');
    assert.equal(report.tests[0].duration, 125);
    assert.deepEqual(report.tests[0].results, [{ status: 'passed', duration: 125, retry: 0 }]);
    for (const value of [json, html]) {
      assert.doesNotMatch(value, /customer@example\.com/);
      assert.doesNotMatch(value, /private-value/);
      assert.doesNotMatch(value, /private diff/);
      assert.doesNotMatch(value, /private stdout/);
      assert.doesNotMatch(value, /trace\.zip/);
    }
  } finally {
    await rm(outputFolder, { recursive: true, force: true });
  }
});
