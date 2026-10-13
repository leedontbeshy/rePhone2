import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  PERFORMANCE_BUILD_MANIFEST,
  PERFORMANCE_REPOSITORY_ROOT,
  assertPerformanceRevisionAllowed,
  assertSamePerformanceRevision,
  createPerformanceBuildProvenance,
  currentPerformanceRevision,
  performanceRuntimeFingerprint,
} from './performance-source-revision.mjs';

function runProductionBuild({ cwd, env }) {
  for (const args of [['--filter', '@rephone/api-client', 'build'], ['test:browser:build']]) {
    const result = spawnSync('pnpm', args, {
      cwd,
      env,
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: 'inherit',
    });
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) throw new Error('Performance production build failed.');
  }
}

export function buildPerformanceWeb({
  cwd = PERFORMANCE_REPOSITORY_ROOT,
  env = process.env,
  runBuild = runProductionBuild,
} = {}) {
  if (env.REPHONE_AFFILIATE_TEST === 'true' || env.REPHONE_SANDBOX_WEB === 'true') {
    throw new Error(
      'Performance build requires the standard .next output; partner sandbox flags must be disabled.',
    );
  }
  const sourceMode = env.WP12_SOURCE_MODE ?? 'commit';
  const before = currentPerformanceRevision({ cwd, sourceMode });
  assertPerformanceRevisionAllowed(before);
  const output = join(cwd, 'apps/web/.next');
  const manifestPath = join(output, PERFORMANCE_BUILD_MANIFEST);
  // Invalidate the previous manifest even when a build fails before replacing .next.
  rmSync(manifestPath, { force: true });
  runBuild({ cwd, env });
  const after = currentPerformanceRevision({ cwd, sourceMode });
  assertSamePerformanceRevision(before, after);
  const buildId = readFileSync(join(output, 'BUILD_ID'), 'utf8').trim();
  const manifest = createPerformanceBuildProvenance(
    before,
    buildId,
    performanceRuntimeFingerprint({ cwd }),
  );
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href) {
  try {
    const manifest = buildPerformanceWeb();
    console.log(`Performance production build ${manifest.buildId}: ${manifest.sourceFingerprint}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Performance production build failed.');
    process.exitCode = 1;
  }
}
