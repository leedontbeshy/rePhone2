import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const common =
  /^(?:\.github\/|scripts\/|packages\/(?:api-client|test-config|typescript-config|eslint-config)\/|infra\/docker\/|compose(?:\.[\w-]+)?\.ya?ml$|\.env(?:\.[\w-]+)?\.example$|\.nvmrc$|\.node-version$|\.npmrc$|\.pnpmfile\.cjs$|pnpm-workspace\.yaml$|pnpm-lock\.yaml$|package\.json$|tsconfig(?:\.[\w-]+)?\.json$|eslint\.config\.[cm]?[jt]s$|turbo\.json$|\.dockerignore$)/;

export function classifyChanges(files) {
  let api = false;
  let browser = false;
  for (const file of files) {
    if (/^(?:docs|uml)\//.test(file) || /\.md$/i.test(file)) continue;
    if (common.test(file) || file.startsWith('apps/api/')) api = browser = true;
    if (/^(?:apps\/web\/|tests\/|playwright[^/]*\.[cm]?[jt]s$)/.test(file)) browser = true;
  }
  return { api, browser };
}

export function detectChanges({ cwd = process.cwd(), base, head }) {
  for (const sha of [base, head]) {
    if (!/^[a-f\d]{40,64}$/i.test(sha ?? '')) throw new Error('Expected a full Git commit SHA');
  }
  const git = (args) => execFileSync('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  const ancestor = git(['merge-base', base, head]).toString('utf8').trim();
  const names = git(['diff', '--no-renames', '--name-only', '-z', ancestor, head]);
  return classifyChanges(names.toString('utf8').split('\0').filter(Boolean));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const scope = detectChanges({ base: process.env.BASE_SHA, head: process.env.HEAD_SHA });
  const output = Object.entries(scope)
    .map(([key, value]) => `${key}=${value}\n`)
    .join('');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  process.stdout.write(output);
}
