import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { stageBrowserReport } from './ci-browser-report.mjs';
import { renderReport } from './playwright-shared-artifact-reporter.mjs';
import { sanitizePerformanceReport } from './ci-performance-report.mjs';

const fixture = () => ({
  schemaVersion: 1,
  generatedAt: '2026-10-14T00:00:00.000Z',
  run: { status: 'failed', startTime: '2026-10-14T00:00:00.000Z', duration: 1 },
  stats: { total: 1, expected: 0, unexpected: 1, flaky: 0, skipped: 0 },
  projects: ['chromium'],
  tests: [
    {
      projectName: 'chromium',
      title: 'checkout fails safely',
      location: { file: 'checkout.spec.ts', line: 1, column: 1 },
      expectedStatus: 'passed',
      outcome: 'unexpected',
      duration: 1,
      results: [{ duration: 1, retry: 0, status: 'failed' }],
    },
  ],
});

test('stages failed browser reports independently and blocks unsafe/missing evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rephone-ci-artifact-'));
  const source = join(root, 'source');
  const dest = join(root, 'staged');
  const write = async (report) => {
    await writeFile(join(source, 'report.json'), JSON.stringify(report));
    await writeFile(join(source, 'index.html'), renderReport(report));
  };
  try {
    assert.equal(await stageBrowserReport(source, dest, 'failure'), false);
    assert.equal(await stageBrowserReport(source, dest, 'skipped'), false);
    await assert.rejects(() => stageBrowserReport(source, dest, 'success'), /did not produce/);
    await mkdir(source);
    await write(fixture());
    assert.equal(await stageBrowserReport(source, dest, 'failure'), true);
    assert.equal(
      JSON.parse(await readFile(join(dest, 'report.json'), 'utf8')).run.status,
      'failed',
    );
    await assert.rejects(() => stageBrowserReport(source, dest, 'success'), /incomplete/);
    await writeFile(join(source, 'index.html'), 'password=private');
    await assert.rejects(() => stageBrowserReport(source, dest, 'failure'), /HTML/);
    const report = fixture();
    report.tests[0].title = 'email=person@example.com';
    await write(report);
    await assert.rejects(() => stageBrowserReport(source, dest, 'failure'), /email/);
    await write(fixture());
    await writeFile(join(source, 'trace.zip'), 'private');
    await assert.rejects(() => stageBrowserReport(source, dest, 'failure'), /Unexpected files/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('performance evidence only contains numeric metrics, templates and validated provenance', () => {
  const sha = 'a'.repeat(40);
  const paths = [
    '/products/[slug]',
    '/products/[slug]/units/[inventoryCode]',
    '/login',
    '/account',
    '/cart',
    '/checkout',
    '/orders/[orderNumber]',
    '/backoffice/catalog/products/[id]',
    '/backoffice/inventory/intake',
    '/backoffice/orders/[id]',
    '/backoffice/audit-logs',
    '/backoffice/system/health',
  ];
  const values = {
    lcpMs: 1,
    cls: 0,
    interactionProxyMs: 1,
    navigationDurationMs: 1,
    requestCount: 1,
    transferredBytes: 1,
    clientJsBytes: 1,
    runtimeIssues: [{ message: 'password=private' }],
    requestPaths: [{ path: '/orders/private' }],
  };
  const input = {
    schema: 'rephone.release-performance.wp12',
    schemaVersion: 2,
    productionBuild: true,
    sourceMode: 'commit',
    workingTreeClean: true,
    reportType: 'after',
    commitSha: sha,
    sourceFingerprint: 'b'.repeat(64),
    buildProvenance: {
      schema: 'rephone.performance-build',
      schemaVersion: 1,
      commitSha: sha,
      sourceFingerprint: 'b'.repeat(64),
      runtimeFingerprint: 'c'.repeat(64),
      sourceFileCount: 1,
      buildId: 'build1',
    },
    routeCount: 12,
    sampleCountPerRoute: 3,
    warmupCountPerRoute: 1,
    thresholds: { lcpMs: 2500, cls: 0.1, interactionProxyMs: 200 },
    profile: {
      browser: 'chromium',
      clientPlatform: 'windows',
      cpuSlowdownMultiplier: 4,
      latencyMs: 40,
      downloadMbps: 10,
      uploadMbps: 5,
      viewport: { width: 390, height: 844 },
    },
    routes: paths.map((routeTemplate) => ({
      routeTemplate,
      passed: true,
      medians: values,
      samples: [values, values, values],
    })),
  };
  const audit = {
    schemaVersion: 1,
    summary: {
      clientPageCount: 1,
      clientTsxCount: 1,
      rawImgConsumerCount: 1,
      rawImgOccurrenceCount: 1,
      layoutCount: 1,
    },
    source: 'password=private',
  };
  assert.doesNotMatch(
    JSON.stringify(sanitizePerformanceReport(input, audit, sha)),
    /private|runtimeIssues|requestPaths|source"/,
  );
  assert.throws(() => sanitizePerformanceReport(input, audit, 'd'.repeat(40)));
  input.routes[0].medians = { ...values, lcpMs: 'secret' };
  assert.throws(() => sanitizePerformanceReport(input, audit, sha));
});
