import assert from 'node:assert/strict';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderReport } from './playwright-shared-artifact-reporter.mjs';

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
  assert.equal(typeof value, 'string', `${context} must be a string`);
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
  assert.doesNotMatch(
    value,
    /https?:\/\/|[?&](?:token|signature|key)=/i,
    `${context} contains a URL`,
  );
};

const number = (value) => assert.ok(Number.isFinite(value) && value >= 0, 'Invalid report number');
const enumValue = (value, choices) => assert.ok(choices.includes(value), 'Invalid report status');
const timestamp = (value) =>
  assert.ok(
    typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value),
    'Invalid report timestamp',
  );

export const verifySharedReport = async (reportFile) => {
  const report = JSON.parse(await readFile(reportFile, 'utf8'));
  assertKeys(report, TOP_LEVEL_KEYS, 'report');
  assert.equal(report.schemaVersion, 1);
  timestamp(report.generatedAt);
  assertKeys(report.run, RUN_KEYS, 'run');
  timestamp(report.run.startTime);
  number(report.run.duration);
  enumValue(report.run.status, ['passed', 'failed', 'timedout', 'interrupted']);
  assertKeys(report.stats, STATS_KEYS, 'stats');
  Object.values(report.stats).forEach(number);
  assert.ok(Array.isArray(report.tests) && Array.isArray(report.projects), 'Invalid report arrays');
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
    assert.ok(
      !path.isAbsolute(browserTest.location.file) &&
        !browserTest.location.file.split(/[\\/]/).includes('..'),
      'Unsafe report location',
    );
    number(browserTest.location.line);
    number(browserTest.location.column);
    number(browserTest.duration);
    enumValue(browserTest.expectedStatus, [
      'passed',
      'failed',
      'timedOut',
      'skipped',
      'interrupted',
    ]);
    enumValue(browserTest.outcome, ['expected', 'unexpected', 'flaky', 'skipped']);
    assert.ok(Array.isArray(browserTest.results), 'Invalid test results');
    for (const [resultIndex, result] of browserTest.results.entries()) {
      assertKeys(result, RESULT_KEYS, `tests[${index}].results[${resultIndex}]`);
      enumValue(result.status, ['passed', 'failed', 'timedOut', 'skipped', 'interrupted']);
      number(result.duration);
      number(result.retry);
    }
  }

  return report;
};

export async function verifySharedReportFolder(folder) {
  const entries = await readdir(folder);
  assert.deepEqual(
    entries.sort(),
    ['index.html', 'report.json'],
    'Unexpected files in shared report',
  );
  for (const name of entries)
    assert.ok(
      (await lstat(path.join(folder, name))).isFile(),
      'Report files must be regular files',
    );
  const report = await verifySharedReport(path.join(folder, 'report.json'));
  assert.ok(
    (await readFile(path.join(folder, 'index.html'), 'utf8')) === renderReport(report),
    'Shared HTML does not match verified JSON',
  );
  return report;
}

export const verifySharedReportFolders = async (folders) =>
  Promise.all(folders.map(verifySharedReportFolder));

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const folders = process.argv.slice(2);
  if (folders.length === 0) {
    throw new Error('Pass at least one shared Playwright report folder');
  }
  await verifySharedReportFolders(folders);
  process.stdout.write(`Verified ${folders.length} sanitized browser report(s).\n`);
}
