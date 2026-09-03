import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifySharedReport } from './verify-playwright-shared-report.mjs';

const reportFixture = () => ({
  schemaVersion: 1,
  generatedAt: '2026-09-02T00:00:00.000Z',
  run: { status: 'passed', startTime: '2026-09-02T00:00:00.000Z', duration: 100 },
  stats: { total: 1, expected: 1, unexpected: 0, flaky: 0, skipped: 0 },
  projects: ['chromium'],
  tests: [
    {
      projectName: 'chromium',
      title: 'customer can sign in',
      location: { file: 'tests/browser/login.spec.ts', line: 10, column: 1 },
      expectedStatus: 'passed',
      outcome: 'expected',
      duration: 90,
      results: [{ status: 'passed', duration: 90, retry: 0 }],
    },
  ],
});

test('accepts an allowlisted shared report', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'rephone-verify-report-'));
  const file = path.join(folder, 'report.json');
  await writeFile(file, JSON.stringify(reportFixture()));
  try {
    await assert.doesNotReject(() => verifySharedReport(file));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('rejects detailed steps and sensitive identifiers', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'rephone-verify-report-'));
  await mkdir(folder, { recursive: true });
  const file = path.join(folder, 'report.json');

  try {
    const detailed = reportFixture();
    detailed.tests[0].steps = [{ title: 'Fill a value' }];
    await writeFile(file, JSON.stringify(detailed));
    await assert.rejects(() => verifySharedReport(file), /contains unsafe fields/);

    const identified = reportFixture();
    identified.tests[0].title = 'lookup 490154203237518';
    await writeFile(file, JSON.stringify(identified));
    await assert.rejects(() => verifySharedReport(file), /phone or device identifier/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
