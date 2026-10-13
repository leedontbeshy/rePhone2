import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from 'node:fs';
import { basename, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PERFORMANCE_REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const PERFORMANCE_BUILD_MANIFEST = 'rephone-performance-build.json';
const BUILD_SCHEMA = 'rephone.performance-build';
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const SHA_PATTERN = /^[a-f0-9]{40,64}$/;
const BUILD_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const ROOT_INPUTS = new Set([
  '.dockerignore',
  '.gitattributes',
  '.gitignore',
  '.nvmrc',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'yarn.lock',
  'tsconfig.json',
  'turbo.json',
]);
const EXCLUDED_SEGMENTS = new Set([
  '.git',
  '.local',
  'node_modules',
  'docs',
  'documentation',
  'evidence',
  'coverage',
  'dist',
  'playwright-report',
  'test-results',
  'secrets',
  'credentials',
]);

export function isPerformanceSourceInput(file) {
  const segments = file.split('/');
  const name = basename(file).toLowerCase();
  if (
    file === 'apps/web/next-env.d.ts' ||
    segments.some((segment) => EXCLUDED_SEGMENTS.has(segment) || segment.startsWith('.next')) ||
    /^\.env(?:\.|$)/i.test(name) ||
    name === '.npmrc' ||
    (/(?:^|[.-])(?:secrets?|credentials?)(?:[.-]|$)/i.test(name) &&
      !/\.[cm]?[jt]sx?$/i.test(name)) ||
    /\.(?:md|mdx|rst|pem|key|p12|pfx|crt|cer)$/i.test(name)
  ) {
    return false;
  }
  if (segments.length === 1) {
    return (
      ROOT_INPUTS.has(file) ||
      /^(?:[\w.-]+\.config\.[cm]?[jt]s|tsconfig(?:\.[\w-]+)?\.json|compose(?:\.[\w-]+)?\.ya?ml)$/.test(
        file,
      )
    );
  }
  return /^(?:apps|packages|scripts|tests)\//.test(file);
}

export function currentPerformanceRevision({
  cwd = PERFORMANCE_REPOSITORY_ROOT,
  sourceMode = process.env.PERFORMANCE_SOURCE_MODE,
} = {}) {
  const mode = sourceMode?.trim() || 'commit';
  if (mode !== 'commit' && mode !== 'working-tree') {
    throw new Error('PERFORMANCE_SOURCE_MODE must be commit or working-tree.');
  }
  const root = realpathSync(cwd);
  const git = (args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
  const sha = git(['rev-parse', 'HEAD']).trim();
  const changes = git(['status', '--porcelain']).trim();
  const files = [
    ...new Set(
      git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
        .split('\0')
        .filter((file) => file !== '' && isPerformanceSourceInput(file)),
    ),
  ].sort();
  const fingerprint = createHash('sha256').update(`rephone.performance-source.v1\0${sha}\0`);
  for (const file of files) {
    fingerprint.update(`${file}\0`);
    const absolute = join(root, file);
    let stat;
    try {
      stat = lstatSync(absolute);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      fingerprint.update('deleted\0');
      continue;
    }
    if (stat.isSymbolicLink()) {
      // Hash the resolved bytes as well: a changed symlink target can affect the build.
      const target = realpathSync(absolute);
      const targetRelative = relative(root, target);
      if (
        isAbsolute(targetRelative) ||
        targetRelative === '..' ||
        targetRelative.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) ||
        !isPerformanceSourceInput(targetRelative.replaceAll('\\', '/'))
      ) {
        throw new Error('Performance source symlinks must resolve to included repository inputs.');
      }
      fingerprint.update(`symlink\0${readlinkSync(absolute)}\0`);
    } else if (!stat.isFile()) {
      throw new Error('Performance source inventory contains an unsupported input type.');
    } else {
      fingerprint.update('file\0');
    }
    fingerprint.update(createHash('sha256').update(readFileSync(absolute)).digest());
  }
  return {
    sha,
    clean: changes.length === 0,
    changes,
    sourceMode: mode,
    sourceFingerprint: fingerprint.digest('hex'),
    sourceFileCount: files.length,
  };
}

export function assertPerformanceRevisionAllowed(revision) {
  if (!revision.clean && revision.sourceMode !== 'working-tree') {
    throw new Error(
      'Performance measurement requires a clean commit or explicit PERFORMANCE_SOURCE_MODE=working-tree.',
    );
  }
}

export function assertSamePerformanceRevision(before, after) {
  if (before.sha !== after.sha) throw new Error('HEAD changed during performance preparation/run.');
  if (
    before.sourceFingerprint !== after.sourceFingerprint ||
    before.sourceFileCount !== after.sourceFileCount
  ) {
    throw new Error('Source changed during performance preparation/run.');
  }
  if (before.sourceMode === 'commit' && !after.clean) {
    throw new Error('Working tree changed during performance preparation/run.');
  }
}

export function validatePerformanceBuildProvenance(input, expected) {
  if (
    input === null ||
    typeof input !== 'object' ||
    input.schema !== BUILD_SCHEMA ||
    input.schemaVersion !== 1 ||
    typeof input.commitSha !== 'string' ||
    !SHA_PATTERN.test(input.commitSha) ||
    typeof input.sourceFingerprint !== 'string' ||
    !FINGERPRINT_PATTERN.test(input.sourceFingerprint) ||
    typeof input.runtimeFingerprint !== 'string' ||
    !FINGERPRINT_PATTERN.test(input.runtimeFingerprint) ||
    !Number.isSafeInteger(input.sourceFileCount) ||
    input.sourceFileCount <= 0 ||
    typeof input.buildId !== 'string' ||
    !BUILD_ID_PATTERN.test(input.buildId)
  ) {
    throw new Error('Invalid performance build provenance. Rebuild using pnpm test:performance.');
  }
  for (const field of [
    'commitSha',
    'sourceFingerprint',
    'sourceFileCount',
    'buildId',
    'runtimeFingerprint',
  ]) {
    if (expected?.[field] !== undefined && input[field] !== expected[field]) {
      throw new Error('Performance build provenance does not match the current source/build.');
    }
  }
  // Return an allowlist: paths, environment variables and arbitrary fields are never reported.
  return {
    schema: BUILD_SCHEMA,
    schemaVersion: 1,
    commitSha: input.commitSha,
    sourceFingerprint: input.sourceFingerprint,
    sourceFileCount: input.sourceFileCount,
    buildId: input.buildId,
    runtimeFingerprint: input.runtimeFingerprint,
  };
}

export function createPerformanceBuildProvenance(revision, buildId, runtimeFingerprint) {
  return validatePerformanceBuildProvenance({
    schema: BUILD_SCHEMA,
    schemaVersion: 1,
    commitSha: revision.sha,
    sourceFingerprint: revision.sourceFingerprint,
    sourceFileCount: revision.sourceFileCount,
    buildId,
    runtimeFingerprint,
  });
}

export function performanceRuntimeFingerprint({ cwd = PERFORMANCE_REPOSITORY_ROOT } = {}) {
  // Next resolves this workspace package through its dist exports, not its src files.
  const output = join(cwd, 'packages/api-client/dist');
  if (!existsSync(join(output, 'index.js'))) {
    throw new Error('Missing performance runtime artifact. Run pnpm test:performance first.');
  }
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error('Performance runtime artifacts cannot be symlinks.');
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) files.push(file);
    }
  };
  visit(output);
  const digest = createHash('sha256').update('rephone.performance-runtime.v1\0');
  for (const file of files.sort()) {
    digest.update(relative(output, file).replaceAll('\\', '/') + '\0');
    digest.update(createHash('sha256').update(readFileSync(file)).digest());
  }
  return digest.digest('hex');
}

export function readPerformanceBuildProvenance({
  cwd = PERFORMANCE_REPOSITORY_ROOT,
  revision,
  distDir = process.env.REPHONE_WEB_DIST_DIR ?? '.next',
} = {}) {
  let input;
  let buildId;
  try {
    const output = join(cwd, 'apps/web', distDir);
    input = JSON.parse(readFileSync(join(output, PERFORMANCE_BUILD_MANIFEST), 'utf8'));
    buildId = readFileSync(join(output, 'BUILD_ID'), 'utf8').trim();
  } catch {
    throw new Error('Missing performance build provenance. Run pnpm test:performance first.');
  }
  return validatePerformanceBuildProvenance(input, {
    buildId,
    runtimeFingerprint: performanceRuntimeFingerprint({ cwd }),
    ...(revision === undefined
      ? {}
      : {
          commitSha: revision.sha,
          sourceFingerprint: revision.sourceFingerprint,
          sourceFileCount: revision.sourceFileCount,
        }),
  });
}
