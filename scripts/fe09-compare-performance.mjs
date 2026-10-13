import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validatePerformanceBuildProvenance } from './performance-source-revision.mjs';

export const PERFORMANCE_COMPARISON_EXIT_CODES = Object.freeze({
  pass: 0,
  regression: 1,
  inputError: 2,
});

export const FE09_ABSOLUTE_PERFORMANCE_BUDGETS = Object.freeze({
  cls: 0.1,
  interactionProxyMs: 200,
  lcpMs: 2_500,
});

export const FE09_REGRESSION_LIMIT_PERCENT = 10;

const RELATIVE_METRICS = Object.freeze([
  { key: 'lcpMs', label: 'LCP', unit: 'ms' },
  { key: 'interactionProxyMs', label: 'Tương tác', unit: 'ms' },
  { key: 'navigationDurationMs', label: 'Điều hướng', unit: 'ms' },
  { key: 'transferredBytes', label: 'Dung lượng truyền', unit: 'byte' },
  { key: 'clientJsBytes', label: 'JavaScript phía trình duyệt', unit: 'byte' },
  { key: 'requestCount', label: 'Số yêu cầu', unit: 'yêu cầu' },
]);

const CLIENT_JS_KEYS = Object.freeze(['clientJsBytes', 'routeClientBundleBytes']);
const SAFE_ROUTE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_./:[\]-]{0,159}$/;
const SAFE_SHA_PATTERN = /^[a-fA-F0-9]{7,64}$/;

export class PerformanceComparisonInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PerformanceComparisonInputError';
    this.code = code;
  }
}

export function comparePerformanceReports(baselineInput, afterInput) {
  const baseline = normalizeReport(baselineInput, 'baseline');
  const after = normalizeReport(afterInput, 'after');

  assertEqual(
    baseline.schemaVersion,
    after.schemaVersion,
    'SCHEMA_MISMATCH',
    'Baseline and after reports use different schema versions.',
  );
  assertEqual(
    baseline.clientJsSourceKey,
    after.clientJsSourceKey,
    'SCHEMA_MISMATCH',
    'Baseline and after reports use different client JavaScript metric fields.',
  );
  assertEqual(
    baseline.metricShape,
    after.metricShape,
    'SCHEMA_MISMATCH',
    'Baseline and after reports use different median metric fields.',
  );
  assertEqual(
    baseline.profileCanonical,
    after.profileCanonical,
    'PROFILE_MISMATCH',
    'Baseline and after reports use different measurement profiles.',
  );
  assertEqual(
    baseline.thresholdsCanonical,
    after.thresholdsCanonical,
    'THRESHOLD_MISMATCH',
    'Baseline and after reports declare different absolute thresholds.',
  );
  assertSameRouteSet(baseline.routeNames, after.routeNames);

  const baselineBudgetFindings = [];
  const failures = [];
  const routes = baseline.routeNames.map((routeName) => {
    const baselineMetrics = baseline.routes.get(routeName);
    const afterMetrics = after.routes.get(routeName);
    if (baselineMetrics === undefined || afterMetrics === undefined) {
      throw new PerformanceComparisonInputError(
        'ROUTE_SET_MISMATCH',
        'Baseline and after reports use different route sets.',
      );
    }

    const absolute = absoluteBudgetChecks(
      routeName,
      baselineMetrics,
      afterMetrics,
      baselineBudgetFindings,
      failures,
    );
    const relative = RELATIVE_METRICS.map((metric) => {
      const baselineValue = baselineMetrics[metric.key];
      const afterValue = afterMetrics[metric.key];
      const changePercent = round(((afterValue - baselineValue) / baselineValue) * 100, 2);
      const passed = afterValue <= baselineValue * (1 + FE09_REGRESSION_LIMIT_PERCENT / 100);
      if (!passed) {
        failures.push({
          after: afterValue,
          baseline: baselineValue,
          code: 'RELATIVE_REGRESSION',
          limitPercent: FE09_REGRESSION_LIMIT_PERCENT,
          metric: metric.key,
          route: routeName,
        });
      }
      return {
        after: afterValue,
        baseline: baselineValue,
        changePercent,
        label: metric.label,
        metric: metric.key,
        passed,
        unit: metric.unit,
      };
    });

    return {
      absolute,
      passed:
        absolute.every((check) => check.afterPassed) && relative.every((check) => check.passed),
      relative,
      route: routeName,
    };
  });

  return {
    afterCommitSha: after.commitSha,
    baselineCommitSha: baseline.commitSha,
    afterSourceMode: after.sourceMode,
    baselineSourceMode: baseline.sourceMode,
    afterSourceFingerprint: after.sourceFingerprint,
    baselineSourceFingerprint: baseline.sourceFingerprint,
    afterBuildId: after.buildProvenance?.buildId ?? null,
    baselineBuildId: baseline.buildProvenance?.buildId ?? null,
    afterRuntimeFingerprint: after.buildProvenance?.runtimeFingerprint ?? null,
    baselineRuntimeFingerprint: baseline.buildProvenance?.runtimeFingerprint ?? null,
    baselineBudgetFindings,
    comparisonSchemaVersion: 1,
    failures,
    performanceReportSchemaVersion: baseline.schemaVersion,
    profileFingerprint: profileFingerprint(baseline.profileCanonical),
    regressionLimitPercent: FE09_REGRESSION_LIMIT_PERCENT,
    routes,
    status: failures.length === 0 ? 'pass' : 'fail',
  };
}

export function formatPerformanceComparisonMarkdown(comparison) {
  const lines = [
    '# FE-09 — So sánh hiệu năng',
    '',
    `- Kết quả: **${comparison.status === 'pass' ? 'ĐẠT' : 'KHÔNG ĐẠT'}**`,
    `- Baseline: \`${comparison.baselineCommitSha}\``,
    `- After: \`${comparison.afterCommitSha}\``,
    `- Nguồn baseline (${comparison.baselineSourceMode}): \`${comparison.baselineSourceFingerprint ?? 'legacy clean commit'}\``,
    `- Nguồn after (${comparison.afterSourceMode}): \`${comparison.afterSourceFingerprint ?? 'legacy clean commit'}\``,
    `- Build baseline: \`${comparison.baselineBuildId ?? 'legacy report'}\``,
    `- Build after: \`${comparison.afterBuildId ?? 'legacy report'}\``,
    `- Runtime baseline: \`${comparison.baselineRuntimeFingerprint ?? 'legacy report'}\``,
    `- Runtime after: \`${comparison.afterRuntimeFingerprint ?? 'legacy report'}\``,
    `- Profile: \`${comparison.profileFingerprint}\``,
    `- Ngưỡng hồi quy: > ${String(comparison.regressionLimitPercent)}%`,
    '',
    '| Route | Chỉ số | Baseline | After | Thay đổi | Kết quả |',
    '| --- | --- | ---: | ---: | ---: | --- |',
  ];

  for (const route of comparison.routes) {
    for (const metric of route.relative) {
      lines.push(
        `| ${escapeMarkdownCell(route.route)} | ${escapeMarkdownCell(metric.label)} | ${formatMetric(metric.baseline, metric.unit)} | ${formatMetric(metric.after, metric.unit)} | ${formatPercent(metric.changePercent)} | ${metric.passed ? 'Đạt' : 'Hồi quy'} |`,
      );
    }
  }

  lines.push('', '## Ngân sách tuyệt đối', '');
  lines.push('| Route | Chỉ số | Baseline | After | Ngân sách | Kết quả |');
  lines.push('| --- | --- | ---: | ---: | ---: | --- |');
  for (const route of comparison.routes) {
    for (const check of route.absolute) {
      lines.push(
        `| ${escapeMarkdownCell(route.route)} | ${escapeMarkdownCell(check.label)} | ${formatMetric(check.baseline, check.unit)} | ${formatMetric(check.after, check.unit)} | <= ${formatMetric(check.budget, check.unit)} | ${absoluteResultLabel(check)} |`,
      );
    }
  }

  if (comparison.baselineBudgetFindings.length > 0) {
    lines.push('', '## Baseline vượt ngân sách (thông tin)', '');
    for (const finding of comparison.baselineBudgetFindings) {
      lines.push(
        `- ${escapeMarkdownCell(finding.route)} — ${escapeMarkdownCell(finding.metric)} vượt ngân sách ở baseline; bản after mới quyết định kết quả gate.`,
      );
    }
  }

  if (comparison.failures.length > 0) {
    lines.push('', '## Vi phạm', '');
    for (const failure of comparison.failures) lines.push(`- ${failureSummary(failure)}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function comparePerformanceReportFiles(baselinePath, afterPath) {
  const [baseline, after] = await Promise.all([
    readJsonReport(baselinePath, 'baseline'),
    readJsonReport(afterPath, 'after'),
  ]);
  return comparePerformanceReports(baseline, after);
}

function normalizeReport(input, label) {
  const report = requirePlainObject(input, label, 'REPORT_INVALID', 'report');
  const schemaVersion = requirePositiveInteger(report.schemaVersion, label, 'schemaVersion');
  const commitSha = requireSafeSha(report.commitSha, label);
  const provenance = normalizeProvenance(report, label, commitSha);
  const thresholds = normalizeThresholds(report.thresholds, label);
  const profile = normalizeProfile(report, label);
  const routeEntries = requireArray(report.routes, label, 'routes');
  if (routeEntries.length === 0) {
    throw inputError('REPORT_INVALID', `${label} report must contain at least one route.`);
  }

  const clientJsSourceKey = detectClientJsSourceKey(routeEntries, label);
  const routes = new Map();
  let metricShape;
  for (const [index, routeInput] of routeEntries.entries()) {
    const route = requirePlainObject(
      routeInput,
      label,
      'REPORT_INVALID',
      `routes[${String(index)}]`,
    );
    const routeName = requireSafeRoute(route.route, label, index);
    if (routes.has(routeName)) {
      throw inputError('DUPLICATE_ROUTE', `${label} report contains a duplicate route.`);
    }
    const medians = requirePlainObject(
      route.medians,
      label,
      'REPORT_INVALID',
      `routes[${String(index)}].medians`,
    );
    const currentShape = Object.keys(medians).sort().join('|');
    if (metricShape === undefined) metricShape = currentShape;
    else if (metricShape !== currentShape) {
      throw inputError(
        'SCHEMA_MISMATCH',
        `${label} report routes do not use one median metric schema.`,
      );
    }
    routes.set(routeName, normalizeMetrics(medians, clientJsSourceKey, label, routeName));
  }

  return {
    clientJsSourceKey,
    commitSha,
    ...provenance,
    metricShape: metricShape ?? '',
    profileCanonical: canonicalJson(profile),
    routeNames: [...routes.keys()].sort(),
    routes,
    schemaVersion,
    thresholdsCanonical: canonicalJson(thresholds),
  };
}

function normalizeProvenance(report, label, commitSha) {
  const hasMetadata = [
    'sourceMode',
    'sourceFingerprint',
    'sourceFileCount',
    'buildProvenance',
  ].some((field) => report[field] !== undefined);
  if (!hasMetadata && (report.workingTreeClean === undefined || report.workingTreeClean === true)) {
    // Older clean-commit reports predate build manifests. Do not invent their fingerprint.
    return { sourceMode: 'commit', sourceFingerprint: null, buildProvenance: null };
  }
  if (
    !['commit', 'working-tree'].includes(report.sourceMode) ||
    typeof report.workingTreeClean !== 'boolean' ||
    (report.sourceMode === 'commit' && !report.workingTreeClean) ||
    typeof report.sourceFingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(report.sourceFingerprint) ||
    !Number.isSafeInteger(report.sourceFileCount) ||
    report.sourceFileCount <= 0
  ) {
    throw inputError('PROVENANCE_INVALID', `${label} report has invalid source provenance.`);
  }
  let buildProvenance;
  try {
    buildProvenance = validatePerformanceBuildProvenance(report.buildProvenance, {
      commitSha,
      sourceFingerprint: report.sourceFingerprint,
      sourceFileCount: report.sourceFileCount,
    });
  } catch {
    throw inputError(
      'PROVENANCE_INVALID',
      `${label} report must identify a production build matching its source provenance.`,
    );
  }
  return {
    sourceMode: report.sourceMode,
    sourceFingerprint: report.sourceFingerprint,
    buildProvenance,
  };
}

function normalizeProfile(report, label) {
  const profile = requirePlainObject(report.profile, label, 'PROFILE_INVALID', 'profile');
  const viewportSource = report.viewport ?? profile.viewport;
  const viewport = requirePlainObject(viewportSource, label, 'PROFILE_INVALID', 'viewport');
  const width = requirePositiveNumber(viewport.width, label, 'viewport.width');
  const height = requirePositiveNumber(viewport.height, label, 'viewport.height');
  if (width !== 390 || height !== 844) {
    throw inputError('PROFILE_INVALID', `${label} report must use the 390×844 viewport.`);
  }

  const cpuSlowdownMultiplier = requirePositiveNumber(
    profile.cpuSlowdownMultiplier,
    label,
    'profile.cpuSlowdownMultiplier',
  );
  const latencyMs = requireNonNegativeNumber(profile.latencyMs, label, 'profile.latencyMs');
  const downloadMbps = requirePositiveNumber(profile.downloadMbps, label, 'profile.downloadMbps');
  const uploadMbps = requirePositiveNumber(profile.uploadMbps, label, 'profile.uploadMbps');
  if (cpuSlowdownMultiplier !== 4 || latencyMs !== 40 || downloadMbps !== 10 || uploadMbps !== 5) {
    throw inputError('PROFILE_INVALID', `${label} report does not use the approved WP-12 profile.`);
  }
  if (typeof profile.media !== 'string' || profile.media.trim().length === 0) {
    throw inputError(
      'PROFILE_INVALID',
      `${label} report must name its deterministic media profile.`,
    );
  }

  const runCount = requirePositiveInteger(report.runCount, label, 'runCount');
  if (runCount < 3) {
    throw inputError('PROFILE_INVALID', `${label} report must contain at least three samples.`);
  }
  if (report.productionBuild !== true) {
    throw inputError('PROFILE_INVALID', `${label} report must come from a production build.`);
  }

  return {
    ...profile,
    cpuSlowdownMultiplier,
    downloadMbps,
    latencyMs,
    media: profile.media.trim(),
    productionBuild: true,
    runCount,
    uploadMbps,
    viewport: { height, width },
  };
}

function normalizeThresholds(input, label) {
  const thresholds = requirePlainObject(input, label, 'THRESHOLD_INVALID', 'thresholds');
  const normalized = {
    cls: requireNonNegativeNumber(thresholds.cls, label, 'thresholds.cls'),
    interactionProxyMs: requirePositiveNumber(
      thresholds.interactionProxyMs,
      label,
      'thresholds.interactionProxyMs',
    ),
    lcpMs: requirePositiveNumber(thresholds.lcpMs, label, 'thresholds.lcpMs'),
  };
  for (const [key, budget] of Object.entries(FE09_ABSOLUTE_PERFORMANCE_BUDGETS)) {
    if (normalized[key] !== budget) {
      throw inputError(
        'THRESHOLD_INVALID',
        `${label} report does not declare the approved absolute performance budgets.`,
      );
    }
  }
  return normalized;
}

function normalizeMetrics(medians, clientJsSourceKey, label, routeName) {
  return {
    clientJsBytes: requirePositiveNumber(
      medians[clientJsSourceKey],
      label,
      `${routeName}.${clientJsSourceKey}`,
    ),
    cls: requireNonNegativeNumber(medians.cls, label, `${routeName}.cls`),
    interactionProxyMs: requirePositiveNumber(
      medians.interactionProxyMs,
      label,
      `${routeName}.interactionProxyMs`,
    ),
    lcpMs: requirePositiveNumber(medians.lcpMs, label, `${routeName}.lcpMs`),
    navigationDurationMs: requirePositiveNumber(
      medians.navigationDurationMs,
      label,
      `${routeName}.navigationDurationMs`,
    ),
    requestCount: requirePositiveInteger(medians.requestCount, label, `${routeName}.requestCount`),
    transferredBytes: requirePositiveNumber(
      medians.transferredBytes,
      label,
      `${routeName}.transferredBytes`,
    ),
  };
}

function detectClientJsSourceKey(routeEntries, label) {
  let detected;
  for (const [index, routeInput] of routeEntries.entries()) {
    const route = requirePlainObject(
      routeInput,
      label,
      'REPORT_INVALID',
      `routes[${String(index)}]`,
    );
    const medians = requirePlainObject(
      route.medians,
      label,
      'REPORT_INVALID',
      `routes[${String(index)}].medians`,
    );
    const keys = CLIENT_JS_KEYS.filter((key) => Object.hasOwn(medians, key));
    if (keys.length !== 1) {
      throw inputError(
        'SCHEMA_MISMATCH',
        `${label} report must contain exactly one client JavaScript metric field.`,
      );
    }
    if (detected === undefined) detected = keys[0];
    else if (detected !== keys[0]) {
      throw inputError(
        'SCHEMA_MISMATCH',
        `${label} report routes do not use one client JavaScript metric field.`,
      );
    }
  }
  return detected;
}

function absoluteBudgetChecks(route, baseline, after, baselineBudgetFindings, failures) {
  return [
    { key: 'lcpMs', label: 'LCP', unit: 'ms' },
    { key: 'cls', label: 'CLS', unit: '' },
    { key: 'interactionProxyMs', label: 'Tương tác', unit: 'ms' },
  ].map(({ key, label, unit }) => {
    const budget = FE09_ABSOLUTE_PERFORMANCE_BUDGETS[key];
    const baselineValue = baseline[key];
    const afterValue = after[key];
    const baselinePassed = baselineValue <= budget;
    const afterPassed = afterValue <= budget;
    if (!baselinePassed) {
      baselineBudgetFindings.push({
        budget,
        code: 'BASELINE_ABSOLUTE_BUDGET',
        metric: key,
        route,
        value: baselineValue,
      });
    }
    if (!afterPassed) {
      failures.push({
        budget,
        code: 'ABSOLUTE_BUDGET',
        metric: key,
        phase: 'after',
        route,
        value: afterValue,
      });
    }
    return {
      after: afterValue,
      afterPassed,
      baseline: baselineValue,
      baselinePassed,
      budget,
      label,
      metric: key,
      unit,
    };
  });
}

function assertSameRouteSet(baselineRoutes, afterRoutes) {
  if (baselineRoutes.length !== afterRoutes.length) {
    throw inputError('ROUTE_SET_MISMATCH', 'Baseline and after reports use different route sets.');
  }
  for (const [index, route] of baselineRoutes.entries()) {
    if (route !== afterRoutes[index]) {
      throw inputError(
        'ROUTE_SET_MISMATCH',
        'Baseline and after reports use different route sets.',
      );
    }
  }
}

function assertEqual(left, right, code, message) {
  if (left !== right) throw inputError(code, message);
}

function requirePlainObject(value, label, code, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw inputError(code, `${label} report has an invalid ${field} field.`);
  }
  return value;
}

function requireArray(value, label, field) {
  if (!Array.isArray(value)) {
    throw inputError('REPORT_INVALID', `${label} report has an invalid ${field} field.`);
  }
  return value;
}

function requirePositiveInteger(value, label, field) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw inputError('REPORT_INVALID', `${label} report has an invalid ${field} field.`);
  }
  return value;
}

function requirePositiveNumber(value, label, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw inputError('METRIC_INVALID', `${label} report has an invalid ${field} metric.`);
  }
  return value;
}

function requireNonNegativeNumber(value, label, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw inputError('METRIC_INVALID', `${label} report has an invalid ${field} metric.`);
  }
  return value;
}

function requireSafeSha(value, label) {
  if (typeof value !== 'string' || !SAFE_SHA_PATTERN.test(value)) {
    throw inputError('REPORT_INVALID', `${label} report has an invalid commit SHA.`);
  }
  return value.toLowerCase();
}

function requireSafeRoute(value, label, index) {
  if (typeof value !== 'string' || !SAFE_ROUTE_PATTERN.test(value)) {
    throw inputError(
      'REPORT_INVALID',
      `${label} report has an unsafe route label at index ${String(index)}.`,
    );
  }
  return value;
}

function inputError(code, message) {
  return new PerformanceComparisonInputError(code, message);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function profileFingerprint(profileCanonical) {
  return `sha256:${createHash('sha256').update(profileCanonical).digest('hex').slice(0, 16)}`;
}

function escapeMarkdownCell(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('`', '\\`');
}

function formatMetric(value, unit) {
  const formatted = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);
  return unit === '' ? formatted : `${formatted} ${unit}`;
}

function formatPercent(value) {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value)}%`;
}

function absoluteResultLabel(check) {
  if (!check.afterPassed) return 'After vượt ngân sách';
  if (!check.baselinePassed) return 'After đạt · baseline vượt';
  return 'Đạt';
}

function failureSummary(failure) {
  if (failure.code === 'RELATIVE_REGRESSION') {
    return `${escapeMarkdownCell(failure.route)} — ${escapeMarkdownCell(failure.metric)} tăng quá ${String(failure.limitPercent)}%.`;
  }
  return `${escapeMarkdownCell(failure.route)} — ${escapeMarkdownCell(failure.metric)} của ${failure.phase} vượt ngân sách tuyệt đối.`;
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function readJsonReport(path, label) {
  let source;
  try {
    source = await readFile(path, 'utf8');
  } catch {
    throw inputError('REPORT_READ_FAILED', `Could not read the ${label} performance report.`);
  }
  try {
    return JSON.parse(source);
  } catch {
    throw inputError('REPORT_PARSE_FAILED', `The ${label} performance report is not valid JSON.`);
  }
}

function parseCliArguments(args) {
  let format = 'json';
  const paths = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--format') {
      const value = args[index + 1];
      if (value !== 'json' && value !== 'markdown') {
        throw inputError('USAGE', 'Format must be json or markdown.');
      }
      format = value;
      index += 1;
    } else if (argument?.startsWith('--format=')) {
      const value = argument.slice('--format='.length);
      if (value !== 'json' && value !== 'markdown') {
        throw inputError('USAGE', 'Format must be json or markdown.');
      }
      format = value;
    } else if (argument?.startsWith('-')) {
      throw inputError('USAGE', 'Unknown comparator option.');
    } else if (argument !== undefined) {
      paths.push(argument);
    }
  }
  if (paths.length !== 2) {
    throw inputError(
      'USAGE',
      'Usage: node scripts/fe09-compare-performance.mjs <baseline.json> <after.json> [--format json|markdown]',
    );
  }
  return { afterPath: paths[1], baselinePath: paths[0], format };
}

async function main() {
  try {
    const { afterPath, baselinePath, format } = parseCliArguments(process.argv.slice(2));
    const comparison = await comparePerformanceReportFiles(baselinePath, afterPath);
    const output =
      format === 'markdown'
        ? formatPerformanceComparisonMarkdown(comparison)
        : `${JSON.stringify(comparison, null, 2)}\n`;
    process.stdout.write(output);
    process.exitCode =
      comparison.status === 'pass'
        ? PERFORMANCE_COMPARISON_EXIT_CODES.pass
        : PERFORMANCE_COMPARISON_EXIT_CODES.regression;
  } catch (error) {
    const code = error instanceof PerformanceComparisonInputError ? error.code : 'UNEXPECTED';
    const message =
      error instanceof PerformanceComparisonInputError
        ? error.message
        : 'Unexpected performance comparator failure.';
    process.stderr.write(`FE-09 performance comparison error [${code}]: ${message}\n`);
    process.exitCode = PERFORMANCE_COMPARISON_EXIT_CODES.inputError;
  }
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href) {
  await main();
}
