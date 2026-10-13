import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { buildPerformanceWeb } from './build-performance-web.mjs';
import {
  PERFORMANCE_BUILD_MANIFEST,
  currentPerformanceRevision,
  readPerformanceBuildProvenance,
} from './performance-source-revision.mjs';

test('records the actual production BUILD_ID against stable pre/post-build source', async () => {
  await withRepository(async ({ root, fakeBuild }) => {
    let calls = 0;
    const manifest = buildPerformanceWeb({
      cwd: root,
      env: {},
      runBuild: ({ cwd, env }) => {
        assert.equal(cwd, root);
        assert.deepEqual(env, {});
        calls += 1;
        fakeBuild('built-fixture');
      },
    });
    assert.equal(calls, 1);
    assert.equal(manifest.buildId, 'built-fixture');
    assert.deepEqual(
      readPerformanceBuildProvenance({
        cwd: root,
        revision: currentPerformanceRevision({ cwd: root }),
      }),
      manifest,
    );
  });
});

test('rejects dirty source before invoking the build without explicit opt-in', async () => {
  await withRepository(async ({ root, put }) => {
    await put('apps/web/app/page.tsx', 'dirty source\n');
    let ran = false;
    assert.throws(
      () =>
        buildPerformanceWeb({
          cwd: root,
          env: {},
          runBuild: () => {
            ran = true;
          },
        }),
      /clean commit|explicit/,
    );
    assert.equal(ran, false);
  });
});

test('refuses partner distDir flags before it can certify an old standard build', async () => {
  await withRepository(async ({ root, fakeBuild, manifestPath }) => {
    fakeBuild('old-standard-build');
    for (const flag of ['REPHONE_AFFILIATE_TEST', 'REPHONE_SANDBOX_WEB']) {
      let ran = false;
      assert.throws(
        () =>
          buildPerformanceWeb({
            cwd: root,
            env: { [flag]: 'true' },
            runBuild: () => {
              ran = true;
            },
          }),
        /standard .next output/,
      );
      assert.equal(ran, false);
      assert.equal(existsSync(manifestPath), false);
    }
  });
});

test('invalidates old provenance when build fails and rejects source changes during build', async () => {
  await withRepository(async ({ root, put, fakeBuild, manifestPath }) => {
    await put('apps/web/.next/' + PERFORMANCE_BUILD_MANIFEST, '{"old":true}');
    assert.throws(
      () =>
        buildPerformanceWeb({
          cwd: root,
          env: {},
          runBuild: () => {
            throw new Error('fixture failure');
          },
        }),
      /fixture failure/,
    );
    assert.equal(existsSync(manifestPath), false);

    assert.throws(
      () =>
        buildPerformanceWeb({
          cwd: root,
          env: {},
          runBuild: () => {
            fakeBuild('stale-build');
            writeFileSync(join(root, 'apps/web/app/page.tsx'), 'changed during build\n');
          },
        }),
      /Source changed/,
    );
    assert.equal(existsSync(manifestPath), false);
  });
});

test('working-tree build tolerates generated next-env and documentation updates only', async () => {
  await withRepository(async ({ root, put, fakeBuild }) => {
    await put('apps/web/app/page.tsx', 'pre-existing user source edit\n');
    const manifest = buildPerformanceWeb({
      cwd: root,
      env: { WP12_SOURCE_MODE: 'working-tree' },
      runBuild: () => {
        fakeBuild('working-tree-build');
        writeFileSync(join(root, 'apps/web/next-env.d.ts'), 'generated build types\n');
        writeFileSync(join(root, 'design.md'), 'documentation checkpoint\n');
      },
    });
    assert.equal(
      manifest.sourceFingerprint,
      currentPerformanceRevision({ cwd: root, sourceMode: 'working-tree' }).sourceFingerprint,
    );
  });
});

async function withRepository(callback) {
  const parent = resolve(tmpdir());
  const root = await mkdtemp(join(parent, 'performance-build-'));
  const put = async (file, value) => {
    const target = join(root, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, value, 'utf8');
  };
  try {
    await put('.gitignore', 'apps/web/.next/\npackages/api-client/dist/\n');
    await put('package.json', '{"private":true}\n');
    await put('apps/web/app/page.tsx', 'export default function Page() {}\n');
    await put('packages/api-client/dist/index.js', 'export const fixture = true;\n');
    const git = (args) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
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
      manifestPath: join(root, 'apps/web/.next', PERFORMANCE_BUILD_MANIFEST),
      fakeBuild: (id) => {
        mkdirSync(join(root, 'apps/web/.next'), { recursive: true });
        writeFileSync(join(root, 'apps/web/.next/BUILD_ID'), id + '\n');
      },
    });
  } finally {
    assert.equal(dirname(resolve(root)), parent);
    await rm(root, { recursive: true, force: true });
  }
}
