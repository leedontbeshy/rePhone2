import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service.js';
import { AuthMaintenanceRepository } from './auth-maintenance.repository.js';

const CUTOFF = new Date('2026-07-26T12:00:00.000Z');

describe('AuthMaintenanceRepository', () => {
  it('returns the bounded stable candidate query result', async () => {
    const candidates = [
      {
        recordType: 'SESSION' as const,
        id: '0198e4f0-7d16-4c1a-a2bd-000000000001',
        terminalAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    ];
    const queryRaw = vi.fn().mockResolvedValue(candidates);
    const repository = new AuthMaintenanceRepository({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);

    await expect(repository.findCleanupCandidates(CUTOFF, 500)).resolves.toEqual(candidates);
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it('conditionally deletes both session and token candidates', async () => {
    const executeRaw = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const repository = new AuthMaintenanceRepository({
      $executeRaw: executeRaw,
    } as unknown as PrismaService);

    await expect(
      repository.deleteCandidate(
        { recordType: 'SESSION', id: '0198e4f0-7d16-4c1a-a2bd-000000000001' },
        CUTOFF,
      ),
    ).resolves.toBe(true);
    await expect(
      repository.deleteCandidate(
        { recordType: 'TOKEN', id: '0198e4f0-7d16-4c1a-a2bd-000000000002' },
        CUTOFF,
      ),
    ).resolves.toBe(false);
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });
});
