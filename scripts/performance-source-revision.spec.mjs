import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import {
  PERFORMANCE_BUILD_MANIFEST,
  assertPerformanceRevisionAllowed,
  assertSamePerformanceRevision,
  createPerformanceBuildProvenance,
  currentPerformanceRevision,
  isPerformanceSourceInput,
  performanceRuntimeFingerprint,
  readPerformanceBuildProvenance,
  validatePerformanceBuildProvenance,
} from './performance-source-revision.mjs';

test('fingerprints tracked edits, untracked inputs, deletions and renames', async () => {
  await withRepository(async ({ root, put, revision }) => {
    const before = revision();
    await put('apps/web/app/page.tsx', 'export default function Changed() {}\n');
    const edited = revision();
    assert.notEqual(edited.sourceFingerprint, before.sourceFingerprint);
    assert.equal(edited.sourceFileCount, before.sourceFileCount);

    await put('apps/web/app/new.tsx', 'export const newInput = true;\n');
    const added = revision();
    assert.notEqual(added.sourceFingerprint, edited.sourceFingerprint);
    assert.equal(added.sourceFileCount, before.sourceFileCount + 1);

    await rm(join(root, 'apps/web/app/page.tsx'));
    const deleted = revision();
    assert.notEqual(deleted.sourceFingerprint, added.sourceFingerprint);
    assert.equal(deleted.sourceFileCount, added.sourceFileCount);

    await rename(join(root, 'apps/web/app/new.tsx'), join(root, 'apps/web/app/renamed.tsx'));
    assert.notEqual(revision().sourceFingerprint, deleted.sourceFingerprint);
  });
});

test('keeps documentation, generated output and secret files outside the fingerprint', async () => {
  await withRepository(async ({ put, revision }) => {
    const before = revision();
    for (const file of [
      'design.md',
      'docs/evidence/ui-v2/progress.json',
      'apps/web/docs/notes.json',
      'apps/web/README.md',
      'apps/web/next-env.d.ts',
      'apps/web/.next/BUILD_ID',
      'apps/api/dist/application.js',
      '.env',
      'apps/api/.env.test',
      'apps/api/.npmrc',
      'apps/api/credentials.json',
      'apps/api/secrets/runtime.json',
      'apps/api/private.pem',
    ]) {
      await put(file, 'not-a-source-input\n');
    }
    const after = revision();
    assert.equal(after.sourceFingerprint, before.sourceFingerprint);
    assert.equal(after.sourceFileCount, before.sourceFileCount);
    assert.equal(after.clean, false);
    assert.doesNotThrow(() => assertSamePerformanceRevision(before, after));
  });
});

test('includes root build/test configuration, lockfiles and credential-handling source code', async () => {
  await withRepository(async ({ put, revision }) => {
    let previous = revision();
    for (const file of [
      'pnpm-lock.yaml',
      'playwright.performance.config.ts',
      'tsconfig.build.json',
      'packages/api-client/src/schema.d.ts',
      'scripts/build-helper.mjs',
      'tests/performance/example.spec.ts',
      'apps/api/src/credentials.service.ts',
    ]) {
      await put(file, 'source input\n');
      const after = revision();
      assert.notEqual(after.sourceFingerprint, previous.sourceFingerprint, file);
      previous = after;
    }
    assert.equal(isPerformanceSourceInput('design.md'), false);
    assert.equal(isPerformanceSourceInput('.env.example'), false);
    assert.equal(isPerformanceSourceInput('apps/web/app/page.tsx'), true);
  });
});

test('retains default clean-commit enforcement and requires explicit working-tree opt-in', async () => {
  await withRepository(async ({ root, put }) => {
    const clean = currentPerformanceRevision({ cwd: root, sourceMode: '' });
    assert.equal(clean.sourceMode, 'commit');
    assert.doesNotThrow(() => assertPerformanceRevisionAllowed(clean));
    await put('apps/web/app/page.tsx', 'dirty source\n');
    const dirty = currentPerformanceRevision({ cwd: root, sourceMode: 'commit' });
    assert.throws(() => assertPerformanceRevisionAllowed(dirty), /clean commit|explicit/);
    assert.doesNotThrow(() =>
      assertPerformanceRevisionAllowed(
        currentPerformanceRevision({ cwd: root, sourceMode: 'working-tree' }),
      ),
    );
    assert.throws(
      () => currentPerformanceRevision({ cwd: root, sourceMode: 'bypass' }),
      /WP12_SOURCE_MODE/,
    );
  });
});

test('rejects a changed HEAD even when source bytes are unchanged', async () => {
  await withRepository(async ({ git, revision }) => {
    const before = revision();
    git([
      '-c',
      'user.name=Performance Tests',
      '-c',
      'user.email=performance@example.invalid',
      'commit',
      '--allow-empty',
      '-qm',
      'new revision',
    ]);
    assert.throws(() => assertSamePerformanceRevision(before, revision()), /HEAD changed/);
  });
});

test('binds build manifest to BUILD_ID and source, returning only safe metadata', async () => {
  await withRepository(async ({ root, put, revision }) => {
    const before = revision();
    const manifest = createPerformanceBuildProvenance(
      before,
      'fixture-build-1',
      performanceRuntimeFingerprint({ cwd: root }),
    );
    await put('apps/web/.next/BUILD_ID', 'fixture-build-1\n');
    await put(
      'apps/web/.next/' + PERFORMANCE_BUILD_MANIFEST,
      JSON.stringify({
        ...manifest,
        privateEnvironment: 'must-not-be-reported',
      }),
    );
    assert.deepEqual(readPerformanceBuildProvenance({ cwd: root, revision: before }), manifest);
    assert.doesNotMatch(JSON.stringify(validatePerformanceBuildProvenance(manifest)), /private/);

    await put('apps/web/.next/BUILD_ID', 'replaced-build\n');
    assert.throws(
      () => readPerformanceBuildProvenance({ cwd: root, revision: before }),
      /does not match/,
    );
    await put('apps/web/.next/BUILD_ID', 'fixture-build-1\n');
    await put('apps/web/app/page.tsx', 'changed after build\n');
    assert.throws(
      () => readPerformanceBuildProvenance({ cwd: root, revision: revision() }),
      /does not match/,
    );
  });
});

test('fails closed for absent or malformed build metadata', async () => {
  await withRepository(async ({ root, put, revision }) => {
    assert.throws(
      () => readPerformanceBuildProvenance({ cwd: root }),
      /Run performance:storefront:build/,
    );
    await put('apps/web/.next/BUILD_ID', 'fixture-build\n');
    await put('apps/web/.next/' + PERFORMANCE_BUILD_MANIFEST, '{invalid');
    assert.throws(
      () => readPerformanceBuildProvenance({ cwd: root }),
      /Run performance:storefront:build/,
    );
    const valid = createPerformanceBuildProvenance(
      revision(),
      'fixture-build',
      performanceRuntimeFingerprint({ cwd: root }),
    );
    for (const invalid of [
      { ...valid, sourceFingerprint: 'not-a-sha256' },
      { ...valid, sourceFileCount: 0 },
      { ...valid, buildId: '../private' },
      { ...valid, schemaVersion: 2 },
      { ...valid, runtimeFingerprint: 'invalid' },
    ]) {
      assert.throws(() => validatePerformanceBuildProvenance(invalid), /Invalid performance build/);
    }
  });
});

test('rejects changed ignored runtime dependency bytes after a production build', async () => {
  await withRepository(async ({ root, put, revision }) => {
    const before = revision();
    const runtimeBefore = performanceRuntimeFingerprint({ cwd: root });
    const manifest = createPerformanceBuildProvenance(before, 'built-runtime', runtimeBefore);
    await put('apps/web/.next/BUILD_ID', 'built-runtime');
    await put('apps/web/.next/' + PERFORMANCE_BUILD_MANIFEST, JSON.stringify(manifest));
    await put('packages/api-client/dist/index.js', 'runtime changed without source edit\n');
    assert.equal(revision().sourceFingerprint, before.sourceFingerprint);
    assert.notEqual(performanceRuntimeFingerprint({ cwd: root }), runtimeBefore);
    assert.throws(
      () => readPerformanceBuildProvenance({ cwd: root, revision: before }),
      /does not match/,
    );
  });
});

async function withRepository(callback) {
  const parent = resolve(tmpdir());
  const root = await mkdtemp(join(parent, 'performance-source-'));
  const put = async (file, value) => {
    const target = join(root, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, value, 'utf8');
  };
  const git = (args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  try {
    await put('.gitignore', 'apps/web/.next/\npackages/api-client/dist/\n');
    await put('package.json', '{"private":true}\n');
    await put('apps/web/app/page.tsx', 'export default function Page() {}\n');
    await put('packages/api-client/dist/index.js', 'export const fixture = true;\n');
    git(['init', '-q']);
    git(['add', '.']);
    git([
      '-c',
      'user.name=Performance Tests',
      '-c',
      'user.email=performance@example.invalid',
      'commit',
      '-qm',
      'fixture',
    ]);
    await callback({
      root,
      put,
      git,
      revision: () => currentPerformanceRevision({ cwd: root, sourceMode: 'working-tree' }),
    });
  } finally {
    assert.equal(dirname(resolve(root)), parent);
    await rm(root, { recursive: true, force: true });
  }
}
