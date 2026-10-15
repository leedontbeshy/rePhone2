import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { classifyChanges, detectChanges } from './ci-changes.mjs';

test('classifies application, documentation and shared runtime changes', () => {
  for (const file of [
    '.nvmrc',
    '.npmrc',
    '.pnpmfile.cjs',
    'pnpm-workspace.yaml',
    'packages/typescript-config/base.json',
    'packages/eslint-config/index.js',
    '.github/workflows/pr-checks.yml',
    'infra/docker/web.Dockerfile',
    'apps/api/src/main.ts',
  ]) {
    assert.deepEqual(classifyChanges([file]), { api: true, browser: true }, file);
  }
  for (const file of ['apps/web/app/page.tsx', 'tests/browser/test.ts', 'playwright.config.ts']) {
    assert.deepEqual(classifyChanges([file]), { api: false, browser: true });
  }
  assert.deepEqual(classifyChanges(['README.md', 'docs/ci.md', 'apps/api/README.md']), {
    api: false,
    browser: false,
  });
});

test('uses merge-base, handles deletions/renames and rejects missing commits', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'rephone-ci-diff-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file, content) => {
    mkdirSync(dirname(join(cwd, file)), { recursive: true });
    writeFileSync(join(cwd, file), content);
  };
  const commit = () => {
    git('add', '-A');
    git('commit', '-qm', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  try {
    git('init', '-q');
    git('config', 'user.name', 'CI fixture');
    git('config', 'user.email', 'ci@example.invalid');
    write('apps/api/with space.ts', 'base\n');
    const base = commit();
    git('checkout', '-qb', 'feature');
    mkdirSync(join(cwd, 'archive'));
    renameSync(join(cwd, 'apps/api/with space.ts'), join(cwd, 'archive/moved.ts'));
    const head = commit();
    assert.deepEqual(detectChanges({ cwd, base, head }), { api: true, browser: true });
    git('checkout', '-qb', 'advanced-base', base);
    write('apps/web/new.ts', 'only on base');
    const advanced = commit();
    assert.deepEqual(detectChanges({ cwd, base: advanced, head }), { api: true, browser: true });
    git('checkout', '-qb', 'docs-feature', base);
    write('docs/note.md', 'documentation');
    const docs = commit();
    assert.deepEqual(detectChanges({ cwd, base: advanced, head: docs }), {
      api: false,
      browser: false,
    });
    assert.throws(() => detectChanges({ cwd, base: '0'.repeat(40), head }));
    assert.throws(() => detectChanges({ cwd, base: '--help', head }));
    if (process.platform !== 'win32') {
      write('apps/api/new\nline.ts', 'valid POSIX path');
      assert.deepEqual(detectChanges({ cwd, base: docs, head: commit() }), {
        api: true,
        browser: true,
      });
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
