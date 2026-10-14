import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

test('Turbo invalidates cached type checks when shared configuration changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'rephone-ci-cache-'));
  const cli = resolve('node_modules/turbo/bin/turbo');
  const config = JSON.parse(readFileSync('turbo.json', 'utf8'));
  const write = (name, contents) => {
    const file = join(root, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
  };
  const hash = () => {
    const output = execFileSync(process.execPath, [cli, 'run', 'typecheck', '--dry=json'], {
      cwd: root,
      env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(output).tasks.find((task) => task.taskId === '@fixture/api#typecheck').hash;
  };
  try {
    write(
      'package.json',
      JSON.stringify({ name: 'fixture', private: true, packageManager: 'pnpm@10.18.3' }),
    );
    write('pnpm-workspace.yaml', 'packages:\n  - apps/*\n');
    write('pnpm-lock.yaml', "lockfileVersion: '9.0'\nimporters:\n  .: {}\n  apps/api: {}\n");
    write(
      'turbo.json',
      JSON.stringify({ globalDependencies: config.globalDependencies, tasks: { typecheck: {} } }),
    );
    write(
      'apps/api/package.json',
      JSON.stringify({ name: '@fixture/api', scripts: { typecheck: 'node --version' } }),
    );
    for (const file of [
      'tsconfig.json',
      'packages/typescript-config/base.json',
      'packages/test-config/vitest.ts',
      '.github/actions/setup-workspace/action.yml',
    ])
      write(file, 'initial\n');
    let previous = hash();
    for (const file of [
      'tsconfig.json',
      'packages/typescript-config/base.json',
      'packages/test-config/vitest.ts',
      '.github/actions/setup-workspace/action.yml',
    ]) {
      write(file, 'changed\n');
      const next = hash();
      assert.notEqual(next, previous, `${file} must invalidate cached checks`);
      previous = next;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
