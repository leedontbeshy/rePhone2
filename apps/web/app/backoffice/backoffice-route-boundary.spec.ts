import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import AuditLogLegacyDetailPage from './audit-logs/[id]/page';

const BACKOFFICE_DIRECTORY = fileURLToPath(new URL('.', import.meta.url));
const LEGACY_AUDIT_LOG_DETAIL_ROUTE = 'audit-logs/[id]/page.tsx';
const redirect = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect }));

describe('backoffice route boundary', () => {
  it.each(backofficeClientLeafFiles())(
    '%s remains a client leaf behind the access gate',
    (file) => {
      const source = readFileSync(join(BACKOFFICE_DIRECTORY, file), 'utf8');

      expect(source.startsWith("'use client';")).toBe(true);
    },
  );

  it('keeps the legacy audit-log detail route as the only server redirect', async () => {
    redirect.mockClear();

    expect(backofficeRouteFiles()).toContain(LEGACY_AUDIT_LOG_DETAIL_ROUTE);
    expect(backofficeClientLeafFiles()).not.toContain(LEGACY_AUDIT_LOG_DETAIL_ROUTE);

    await AuditLogLegacyDetailPage({
      params: Promise.resolve({ id: 'audit-42' }),
      searchParams: Promise.resolve({
        action: ['UPDATE', 'DELETE'],
        selected: 'obsolete-selection',
        subject: 'order-42',
      }),
    });

    expect(redirect).toHaveBeenCalledWith(
      '/backoffice/audit-logs?action=UPDATE&action=DELETE&subject=order-42&selected=audit-42',
    );
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
      return ROUTE_ENTRY_FILES.has(entry.name)
        ? [relative(BACKOFFICE_DIRECTORY, path).replaceAll('\\', '/')]
        : [];
    })
    .sort();
}

function backofficeClientLeafFiles(): string[] {
  return backofficeRouteFiles().filter((file) => file !== LEGACY_AUDIT_LOG_DETAIL_ROUTE);
}
