import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

const root = 'tests/browser';
const output = '.local/ci-artifacts/visual-baselines';
const sha = process.env.GITHUB_SHA;
if (!/^[a-f\d]{40,64}$/.test(sha ?? '')) throw new Error('Invalid baseline source SHA');
const files = [];
async function visit(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const file = join(folder, entry.name);
    if (entry.isDirectory()) await visit(file);
    else if (
      entry.isFile() &&
      entry.name.endsWith('-win32.png') &&
      dirname(file).endsWith('-snapshots')
    ) {
      const bytes = await readFile(file);
      if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        throw new Error('Invalid baseline PNG');
      const name = relative(root, file).replaceAll('\\', '/');
      const destination = join(output, name);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(file, destination);
      files.push({ file: name, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
}
await visit(root);
if (!files.length) throw new Error('No Windows baseline candidates were produced');
await writeFile(
  join(output, 'manifest.json'),
  `${JSON.stringify({ sourceSha: sha, purpose: 'baseline-review-only', files: files.sort((a, b) => a.file.localeCompare(b.file)) }, null, 2)}\n`,
);
