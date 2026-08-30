import { describe, expect, it, vi } from 'vitest';
import type { MailProvider } from '../../common/providers/mail-provider.js';
import type { StorageProvider } from '../../common/providers/storage-provider.js';
import type { AppConfig } from '../../config/app-config.js';
import type { PrismaService } from '../../database/prisma.service.js';
import { SystemHealthService } from './system-health.service.js';

describe('SystemHealthService', () => {
  it('reports safe real dependency results without exposing provider errors', async () => {
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([
          { databaseReady: 1, appliedMigrationCount: 12, incompleteMigrationCount: 0 },
        ]),
    } as unknown as PrismaService;
    const storage = { probe: vi.fn().mockResolvedValue(undefined) } as unknown as StorageProvider;
    const mail = {
      probe: vi.fn().mockResolvedValue('available'),
      send: vi.fn(),
    } as unknown as MailProvider;

    const result = await new SystemHealthService(prisma, storage, mail, config()).inspect();

    expect(result).toMatchObject({
      state: 'healthy',
      api: { state: 'healthy', reason: 'ok', version: 'test-version' },
      database: {
        state: 'healthy',
        reason: 'ok',
        appliedMigrationCount: 12,
        incompleteMigrationCount: 0,
      },
      storage: { state: 'healthy', reason: 'ok' },
      mail: { state: 'healthy', reason: 'ok' },
    });
    expect(JSON.stringify(result)).not.toMatch(/password|bucket|smtp|database url|stack/i);
  });

  it('keeps optional dependency failures degraded and uses stable reason codes', async () => {
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([
          { databaseReady: 1, appliedMigrationCount: 12, incompleteMigrationCount: 0 },
        ]),
    } as unknown as PrismaService;
    const storage = {
      probe: vi.fn().mockRejectedValue(new Error('private storage host and credential')),
    } as unknown as StorageProvider;
    const mail = {
      probe: vi.fn().mockResolvedValue('not-configured'),
      send: vi.fn(),
    } as unknown as MailProvider;

    const result = await new SystemHealthService(prisma, storage, mail, config()).inspect();

    expect(result).toMatchObject({
      state: 'degraded',
      database: { state: 'healthy' },
      storage: { state: 'unavailable', reason: 'unavailable' },
      mail: { state: 'not_configured', reason: 'not_configured' },
    });
    expect(JSON.stringify(result)).not.toContain('private storage host');
  });

  it('marks an incomplete migration as degraded without returning migration names', async () => {
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([
          { databaseReady: 1, appliedMigrationCount: 12, incompleteMigrationCount: 1 },
        ]),
    } as unknown as PrismaService;
    const storage = { probe: vi.fn().mockResolvedValue(undefined) } as unknown as StorageProvider;
    const mail = {
      probe: vi.fn().mockResolvedValue('available'),
      send: vi.fn(),
    } as unknown as MailProvider;

    const result = await new SystemHealthService(prisma, storage, mail, config()).inspect();

    expect(result).toMatchObject({
      state: 'degraded',
      database: {
        state: 'degraded',
        reason: 'incomplete_migration',
        incompleteMigrationCount: 1,
      },
    });
  });
});

function config(): AppConfig {
  return { version: 'test version' } as AppConfig;
}
