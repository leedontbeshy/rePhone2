import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  PERFORMANCE_COMPARISON_EXIT_CODES,
  PerformanceComparisonInputError,
  comparePerformanceReports,
  formatPerformanceComparisonMarkdown,
} from './fe09-compare-performance.mjs';

const comparatorPath = fileURLToPath(new URL('./fe09-compare-performance.mjs', import.meta.url));
const BASELINE_SHA = '1111111111111111111111111111111111111111';
const AFTER_SHA = '2222222222222222222222222222222222222222';

test('passes identical reports and allows a regression of exactly ten percent', () => {
  const baseline = report();
  const after = report({
    commitSha: AFTER_SHA,
    medians: {
      clientJsBytes: 55_000,
      cls: 0.04,
      interactionProxyMs: 110,
      lcpMs: 1_100,
      navigationDurationMs: 550,
      requestCount: 22,
      transferredBytes: 110_000,
    },
  });

  const comparison = comparePerformanceReports(baseline, after);

  assert.equal(comparison.status, 'pass');
  assert.deepEqual(comparison.failures, []);
  assert.equal(
    comparison.routes[0].relative.every(({ passed }) => passed),
    true,
  );
  assert.match(comparison.profileFingerprint, /^sha256:[a-f0-9]{16}$/);
});

test('fails every relative metric only when it regresses by more than ten percent', () => {
  const comparison = comparePerformanceReports(
    report(),
    report({
      commitSha: AFTER_SHA,
      medians: {
        clientJsBytes: 55_001,
        cls: 0.04,
        interactionProxyMs: 110.01,
        lcpMs: 1_100.01,
        navigationDurationMs: 550.01,
        requestCount: 23,
        transferredBytes: 110_001,
      },
    }),
  );

  assert.equal(comparison.status, 'fail');
  assert.deepEqual(comparison.failures.map(({ code, metric }) => `${code}:${metric}`).sort(), [
    'RELATIVE_REGRESSION:clientJsBytes',
    'RELATIVE_REGRESSION:interactionProxyMs',
    'RELATIVE_REGRESSION:lcpMs',
    'RELATIVE_REGRESSION:navigationDurationMs',
    'RELATIVE_REGRESSION:requestCount',
    'RELATIVE_REGRESSION:transferredBytes',
  ]);
});

test('keeps baseline budget breaches informational when after is within budget', () => {
  const comparison = comparePerformanceReports(
    report({ medians: { cls: 0.101, interactionProxyMs: 201, lcpMs: 2_501 } }),
    report({
      commitSha: AFTER_SHA,
      medians: { cls: 0.09, interactionProxyMs: 190, lcpMs: 2_400 },
    }),
  );

  assert.equal(comparison.status, 'pass');
  assert.deepEqual(comparison.failures, []);
  assert.deepEqual(comparison.baselineBudgetFindings.map(({ metric }) => metric).sort(), [
    'cls',
    'interactionProxyMs',
    'lcpMs',
  ]);
  assert.equal(
    comparison.routes[0].absolute.every(({ afterPassed }) => afterPassed),
    true,
  );
  assert.equal(
    comparison.routes[0].absolute.every(({ baselinePassed }) => !baselinePassed),
    true,
  );

  const markdown = formatPerformanceComparisonMarkdown(comparison);
  assert.match(markdown, /Baseline vượt ngân sách \(thông tin\)/);
  assert.match(markdown, /After đạt · baseline vượt/);
  assert.match(markdown, /Kết quả: \*\*ĐẠT\*\*/);
});

test('fails absolute LCP, CLS and interaction budgets for the after report', () => {
  const comparison = comparePerformanceReports(
    report({ medians: { cls: 0.101, lcpMs: 2_501 } }),
    report({
      commitSha: AFTER_SHA,
      medians: { cls: 0.11, interactionProxyMs: 201, lcpMs: 2_600 },
    }),
  );

  assert.equal(comparison.status, 'fail');
  assert.deepEqual(
    comparison.failures
      .filter(({ code }) => code === 'ABSOLUTE_BUDGET')
      .map(({ metric, phase }) => `${phase}:${metric}`)
      .sort(),
    ['after:cls', 'after:interactionProxyMs', 'after:lcpMs'],
  );
  assert.deepEqual(comparison.baselineBudgetFindings.map(({ metric }) => metric).sort(), [
    'cls',
    'lcpMs',
  ]);
});

test('rejects schema, profile, route-set and zero-metric mismatches with stable codes', () => {
  assertInputError(
    () => comparePerformanceReports(report(), report({ commitSha: AFTER_SHA, schemaVersion: 3 })),
    'SCHEMA_MISMATCH',
  );
  assertInputError(
    () =>
      comparePerformanceReports(
        report(),
        report({
          commitSha: AFTER_SHA,
          profile: { media: 'another-deterministic-profile' },
        }),
      ),
    'PROFILE_MISMATCH',
  );
  assertInputError(
    () =>
      comparePerformanceReports(report(), report({ commitSha: AFTER_SHA, route: 'another-route' })),
    'ROUTE_SET_MISMATCH',
  );
  assertInputError(
    () =>
      comparePerformanceReports(report(), report({ commitSha: AFTER_SHA, medians: { lcpMs: 0 } })),
    'METRIC_INVALID',
  );
});

test('rejects changed median schemas and unsafe route labels', () => {
  const after = report({ commitSha: AFTER_SHA });
  after.routes[0].medians.unversionedMetric = 1;
  assertInputError(() => comparePerformanceReports(report(), after), 'SCHEMA_MISMATCH');

  assertInputError(
    () =>
      comparePerformanceReports(
        report(),
        report({ commitSha: AFTER_SHA, route: 'order|customer@example.com' }),
      ),
    'REPORT_INVALID',
  );
});

test('accepts the existing routeClientBundleBytes report field without weakening schema matching', () => {
  const baseline = report({ clientJsField: 'routeClientBundleBytes', schemaVersion: 1 });
  const after = report({
    clientJsField: 'routeClientBundleBytes',
    commitSha: AFTER_SHA,
    schemaVersion: 1,
  });
  assert.equal(comparePerformanceReports(baseline, after).status, 'pass');

  assertInputError(
    () => comparePerformanceReports(baseline, report({ commitSha: AFTER_SHA, schemaVersion: 1 })),
    'SCHEMA_MISMATCH',
  );
});

test('renders a Markdown-friendly summary without copying untrusted profile fields', () => {
  const baseline = report({
    profile: { databaseUrl: 'postgresql://secret', media: 'fixture-media' },
  });
  const after = report({
    commitSha: AFTER_SHA,
    profile: { databaseUrl: 'postgresql://secret', media: 'fixture-media' },
  });
  const comparison = comparePerformanceReports(baseline, after);
  const json = JSON.stringify(comparison);
  const markdown = formatPerformanceComparisonMarkdown(comparison);

  assert.doesNotMatch(json, /postgresql|secret/i);
  assert.doesNotMatch(markdown, /postgresql|secret/i);
  assert.match(markdown, /\| model-detail \| LCP \|/);
  assert.match(markdown, /Kết quả: \*\*ĐẠT\*\*/);
});

test('CLI uses exit 0 for pass, 1 for regression and 2 for input errors without leaking paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fe09-performance-'));
  const baselinePath = join(directory, 'baseline.json');
  const passPath = join(directory, 'after-pass.json');
  const failPath = join(directory, 'after-fail.json');
  const invalidPath = join(directory, 'contains-private-name.json');

  try {
    await Promise.all([
      writeFile(baselinePath, JSON.stringify(report()), 'utf8'),
      writeFile(passPath, JSON.stringify(report({ commitSha: AFTER_SHA })), 'utf8'),
      writeFile(
        failPath,
        JSON.stringify(report({ commitSha: AFTER_SHA, medians: { requestCount: 23 } })),
        'utf8',
      ),
      writeFile(invalidPath, '{not-json', 'utf8'),
    ]);

    const passing = runComparator(baselinePath, passPath, '--format=markdown');
    assert.equal(passing.status, PERFORMANCE_COMPARISON_EXIT_CODES.pass);
    assert.match(passing.stdout, /Kết quả: \*\*ĐẠT\*\*/);

    const regression = runComparator(baselinePath, failPath);
    assert.equal(regression.status, PERFORMANCE_COMPARISON_EXIT_CODES.regression);
    assert.equal(JSON.parse(regression.stdout).status, 'fail');

    const invalid = runComparator(baselinePath, invalidPath);
    assert.equal(invalid.status, PERFORMANCE_COMPARISON_EXIT_CODES.inputError);
    assert.match(invalid.stderr, /REPORT_PARSE_FAILED/);
    assert.doesNotMatch(invalid.stderr, /contains-private-name|fe09-performance-/);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

function report({
  clientJsField = 'clientJsBytes',
  commitSha = BASELINE_SHA,
  medians = {},
  profile = {},
  route = 'model-detail',
  schemaVersion = 2,
} = {}) {
  const clientJsMetric = { [clientJsField]: 50_000 };
  return {
    commitSha,
    productionBuild: true,
    profile: {
      cpuSlowdownMultiplier: 4,
      downloadMbps: 10,
      latencyMs: 40,
      media: 'fixture-media',
      uploadMbps: 5,
      ...profile,
    },
    routes: [
      {
        medians: {
          ...clientJsMetric,
          cls: 0.04,
          interactionProxyMs: 100,
          lcpMs: 1_000,
          navigationDurationMs: 500,
          requestCount: 20,
          transferredBytes: 100_000,
          ...medians,
        },
        route,
      },
    ],
    runCount: 3,
    schemaVersion,
    thresholds: { cls: 0.1, interactionProxyMs: 200, lcpMs: 2_500 },
    viewport: { height: 844, width: 390 },
  };
}

function assertInputError(callback, code) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof PerformanceComparisonInputError);
    assert.equal(error.code, code);
    return true;
  });
}

function runComparator(...args) {
  return spawnSync(process.execPath, [comparatorPath, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
}
