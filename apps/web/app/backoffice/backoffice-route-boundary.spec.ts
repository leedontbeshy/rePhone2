import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const BACKOFFICE_DIRECTORY = fileURLToPath(new URL('.', import.meta.url));

describe('backoffice route boundary', () => {
  it.each(backofficeRouteFiles())('%s remains a client leaf behind the access gate', (file) => {
    const source = readFileSync(join(BACKOFFICE_DIRECTORY, file), 'utf8');

    expect(source.startsWith("'use client';")).toBe(true);
  });
});

const ROUTE_ENTRY_FILES = new Set([
  'default.tsx',
  'error.tsx',
  'forbidden.tsx',
  'global-error.tsx',
  'layout.tsx',
  'loading.tsx',
  'not-found.tsx',
  'page.tsx',
  'template.tsx',
  'unauthorized.tsx',
]);

function backofficeRouteFiles(directory = BACKOFFICE_DIRECTORY): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return backofficeRouteFiles(path);
      return ROUTE_ENTRY_FILES.has(entry.name) ? [relative(BACKOFFICE_DIRECTORY, path)] : [];
    })
    .sort();
}
