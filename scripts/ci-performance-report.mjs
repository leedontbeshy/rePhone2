import assert from 'node:assert/strict';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validatePerformanceBuildProvenance } from './performance-source-revision.mjs';

const templates = new Set([
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
]);
const metricKeys = [
  'lcpMs',
  'cls',
  'interactionProxyMs',
  'navigationDurationMs',
  'requestCount',
  'transferredBytes',
  'clientJsBytes',
];
const numeric = (value) => {
  assert.ok(Number.isFinite(value) && value >= 0, 'Invalid performance number');
  return value;
};
const metrics = (input) => Object.fromEntries(metricKeys.map((key) => [key, numeric(input[key])]));

export function sanitizePerformanceReport(input, audit, expectedSha) {
  assert.equal(input.schema, 'rephone.release-performance.wp12');
  assert.equal(input.schemaVersion, 2);
  assert.equal(input.productionBuild, true);
  assert.equal(input.sourceMode, 'commit');
  assert.equal(input.workingTreeClean, true);
  assert.equal(input.reportType, 'after');
  assert.equal(input.commitSha, expectedSha);
  const provenance = validatePerformanceBuildProvenance(input.buildProvenance, {
    commitSha: expectedSha,
  });
  assert.equal(input.sourceFingerprint, provenance.sourceFingerprint);
  assert.equal(input.routeCount, templates.size);
  assert.equal(input.sampleCountPerRoute, 3);
  assert.equal(input.warmupCountPerRoute, 1);
  assert.deepEqual(input.thresholds, { lcpMs: 2500, cls: 0.1, interactionProxyMs: 200 });
  assert.equal(input.profile.browser, 'chromium');
  assert.equal(input.profile.clientPlatform, 'windows');
  assert.deepEqual(new Set(input.routes.map((route) => route.routeTemplate)), templates);
  assert.equal(input.routes.length, templates.size);
  assert.equal(audit.schemaVersion, 1);
  return {
    schema: 'rephone.ci-performance',
    schemaVersion: 1,
    commitSha: expectedSha,
    buildProvenance: provenance,
    profile: {
      browser: 'chromium',
      clientPlatform: 'windows',
      cpuSlowdownMultiplier: numeric(input.profile.cpuSlowdownMultiplier),
      latencyMs: numeric(input.profile.latencyMs),
      downloadMbps: numeric(input.profile.downloadMbps),
      uploadMbps: numeric(input.profile.uploadMbps),
      viewport: {
        width: numeric(input.profile.viewport.width),
        height: numeric(input.profile.viewport.height),
      },
    },
    thresholds: { lcpMs: 2500, cls: 0.1, interactionProxyMs: 200 },
    sampleCountPerRoute: 3,
    warmupCountPerRoute: 1,
    routes: input.routes.map((route) => {
      assert.equal(typeof route.passed, 'boolean');
      assert.equal(route.samples.length, 3);
      return {
        routeTemplate: route.routeTemplate,
        passed: route.passed,
        medians: metrics(route.medians),
        samples: route.samples.map(metrics),
      };
    }),
    clientMedia: Object.fromEntries(
      [
        'clientPageCount',
        'clientTsxCount',
        'rawImgConsumerCount',
        'rawImgOccurrenceCount',
        'layoutCount',
      ].map((key) => [key, numeric(audit.summary[key])]),
    ),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [source, auditFile, destination] = process.argv.slice(2);
    const input = JSON.parse(await readFile(source, 'utf8'));
    const audit = JSON.parse(await readFile(auditFile, 'utf8'));
    const report = sanitizePerformanceReport(input, audit, process.env.GITHUB_SHA);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, 'ready=true\n');
    process.stdout.write('Verified performance evidence staged.\n');
  } catch {
    process.stderr.write('Performance evidence verification failed; upload blocked.\n');
    process.exitCode = 1;
  }
}
