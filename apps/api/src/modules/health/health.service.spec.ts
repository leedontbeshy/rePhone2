import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service.js';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  it('returns unavailable on a failed probe and recovers on the next successful probe', async () => {
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockRejectedValueOnce(new Error('database unavailable'))
        .mockResolvedValueOnce([
          { databaseReady: 1, appliedMigrationCount: 12, incompleteMigrationCount: 0 },
        ]),
    } as unknown as PrismaService;
    const service = new HealthService(prisma);

    await expect(service.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.readiness()).resolves.toEqual({ status: 'ok' });
  });

  it('returns unavailable when Prisma reports a failed or incomplete migration', async () => {
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([
          { databaseReady: 1, appliedMigrationCount: 12, incompleteMigrationCount: 1 },
        ]),
    } as unknown as PrismaService;

    await expect(new HealthService(prisma).readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it.each([
    ['does not return a probe row', []],
    [
      'cannot reach the database',
      [{ databaseReady: 0, appliedMigrationCount: 12, incompleteMigrationCount: 0 }],
    ],
    [
      'has no applied migrations',
      [{ databaseReady: 1, appliedMigrationCount: 0, incompleteMigrationCount: 0 }],
    ],
  ])('returns unavailable when readiness %s', async (_case, result) => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue(result),
    } as unknown as PrismaService;

    await expect(new HealthService(prisma).readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('bounds the readiness probe to two seconds', async () => {
    vi.useFakeTimers();
    try {
      const prisma = {
        $queryRaw: vi.fn().mockReturnValue(new Promise(() => undefined)),
      } as unknown as PrismaService;
      const readiness = new HealthService(prisma).readiness();
      const assertion = expect(readiness).rejects.toBeInstanceOf(ServiceUnavailableException);

      await vi.advanceTimersByTimeAsync(2_000);

      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
