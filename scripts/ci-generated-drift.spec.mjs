import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import test from 'node:test';

test('Bash rejects a failing generator before a clean git diff can hide it', (t) => {
  const shell =
    process.env.CI_BASH ??
    (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash');
  const available = spawnSync(shell, ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 5000,
  });
  if (available.status !== 0) {
    if (process.env.CI) assert.fail('Bash must be available on CI runners');
    t.skip('Git Bash is only available on CI on this host');
    return;
  }
  const folder = mkdtempSync(join(tmpdir(), 'rephone-ci-shell-'));
  try {
    for (const [name, script] of [
      ['pnpm', 'exit 17'],
      ['git', 'touch "$PROBE_MARKER"\nexit 0'],
    ]) {
      writeFileSync(join(folder, name), `#!/usr/bin/env bash\n${script}\n`);
      chmodSync(join(folder, name), 0o755);
    }
    const marker = join(folder, 'git-was-called');
    const result = spawnSync(shell, [resolve('scripts/ci-generated-drift.sh')], {
      env: {
        ...process.env,
        PATH: `${folder}${delimiter}${process.env.PATH}`,
        PROBE_MARKER: marker,
      },
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(result.status, 17, result.stderr);
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
