import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOP_LEVEL_KEYS = ['generatedAt', 'projects', 'run', 'schemaVersion', 'stats', 'tests'];
const RUN_KEYS = ['duration', 'startTime', 'status'];
const STATS_KEYS = ['expected', 'flaky', 'skipped', 'total', 'unexpected'];
const TEST_KEYS = [
  'duration',
  'expectedStatus',
  'location',
  'outcome',
  'projectName',
  'results',
  'title',
];
const LOCATION_KEYS = ['column', 'file', 'line'];
const RESULT_KEYS = ['duration', 'retry', 'status'];

const assertKeys = (value, expected, context) => {
  assert.deepEqual(
    Object.keys(value).sort(),
    [...expected].sort(),
    `${context} contains unsafe fields`,
  );
};

const assertSafeString = (value, context) => {
  assert.doesNotMatch(
    value,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    `${context} contains an email`,
  );
  assert.doesNotMatch(value, /\b\d{10,19}\b/, `${context} contains a phone or device identifier`);
  assert.doesNotMatch(
    value,
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
    `${context} contains a JWT`,
  );
  assert.doesNotMatch(value, /:\/\/[^\s/:]+:[^\s/@]+@/, `${context} contains URL credentials`);
  assert.doesNotMatch(
    value,
    /\b(?:password|secret|token|imei|phone|email)\s*[:=]\s*[^\s]+/i,
    `${context} contains a labelled sensitive value`,
  );
};

export const verifySharedReport = async (reportFile) => {
  const report = JSON.parse(await readFile(reportFile, 'utf8'));
  assertKeys(report, TOP_LEVEL_KEYS, 'report');
  assert.equal(report.schemaVersion, 1);
  assertKeys(report.run, RUN_KEYS, 'run');
  assertKeys(report.stats, STATS_KEYS, 'stats');
  assert.equal(report.stats.total, report.tests.length);

  for (const [index, project] of report.projects.entries()) {
    assertSafeString(project, `projects[${index}]`);
  }
  for (const [index, browserTest] of report.tests.entries()) {
    assertKeys(browserTest, TEST_KEYS, `tests[${index}]`);
    assertKeys(browserTest.location, LOCATION_KEYS, `tests[${index}].location`);
    assertSafeString(browserTest.projectName, `tests[${index}].projectName`);
    assertSafeString(browserTest.title, `tests[${index}].title`);
    assertSafeString(browserTest.location.file, `tests[${index}].location.file`);
    for (const [resultIndex, result] of browserTest.results.entries()) {
      assertKeys(result, RESULT_KEYS, `tests[${index}].results[${resultIndex}]`);
    }
  }

  return report;
};

export const verifySharedReportFolders = async (folders) =>
  Promise.all(folders.map((folder) => verifySharedReport(path.join(folder, 'report.json'))));

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const folders = process.argv.slice(2);
  if (folders.length === 0) {
    throw new Error('Pass at least one shared Playwright report folder');
  }
  await verifySharedReportFolders(folders);
  process.stdout.write(`Verified ${folders.length} sanitized browser report(s).\n`);
}
