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
        .mockResolvedValueOnce([{ count: 1 }]),
    } as unknown as PrismaService;
    const service = new HealthService(prisma);

    await expect(service.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.readiness()).resolves.toEqual({ status: 'ok' });
  });
});
