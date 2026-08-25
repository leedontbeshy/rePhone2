import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import type { AuthMaintenanceRepository } from './auth-maintenance.repository.js';
import { AuthMaintenanceService } from './auth-maintenance.service.js';

const NOW = new Date('2026-08-25T12:00:00.000Z');
const EXPECTED_CUTOFF = new Date('2026-07-26T12:00:00.000Z');

describe('AuthMaintenanceService', () => {
  let errorEntries: unknown[];

  beforeEach(() => {
    errorEntries = [];
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation((value: unknown) => {
      errorEntries.push(value);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('purges a stable bounded batch without auditing per record', async () => {
    const candidates = [candidate('SESSION', 1), candidate('TOKEN', 2), candidate('TOKEN', 3)];
    const findCleanupCandidates = vi.fn().mockResolvedValue(candidates);
    const deleteCandidate = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('delete failed'))
      .mockResolvedValueOnce(false);
    const repository = {
      findCleanupCandidates,
      deleteCandidate,
    } as unknown as AuthMaintenanceRepository;
    const service = new AuthMaintenanceService(repository, config());

    await expect(service.purgeExpired(NOW)).resolves.toEqual({
      scanned: 3,
      purged: 1,
      failed: 1,
      skippedOverlap: false,
    });

    expect(findCleanupCandidates).toHaveBeenCalledWith(EXPECTED_CUTOFF, 500);
    expect(deleteCandidate).toHaveBeenCalledTimes(3);
    expect(errorEntries).toContainEqual(
      expect.objectContaining({
        event: 'job.record_failed',
        job: 'purgeExpiredAuthRecords',
        recordType: 'TOKEN',
        recordId: candidates[1]?.id,
        errorCategory: 'Error',
      }),
    );
  });

  it('skips overlap while the candidate scan is still running', async () => {
    let release!: (value: []) => void;
    const gate = new Promise<[]>((resolve) => {
      release = resolve;
    });
    const repository = {
      findCleanupCandidates: vi.fn(() => gate),
    } as unknown as AuthMaintenanceRepository;
    const service = new AuthMaintenanceService(repository, config());

    const first = service.purgeExpired(NOW);
    await expect(service.purgeExpired(NOW)).resolves.toMatchObject({ skippedOverlap: true });
    release([]);
    await expect(first).resolves.toMatchObject({ skippedOverlap: false });
  });

  it('logs a scan failure and allows the following daily run', async () => {
    const repository = {
      findCleanupCandidates: vi
        .fn()
        .mockRejectedValueOnce(new Error('database unavailable'))
        .mockResolvedValueOnce([]),
    } as unknown as AuthMaintenanceRepository;
    const service = new AuthMaintenanceService(repository, config());

    await expect(service.purgeExpired(NOW)).rejects.toThrow('database unavailable');
    await expect(service.purgeExpired(NOW)).resolves.toMatchObject({ skippedOverlap: false });
    expect(errorEntries).toContainEqual(
      expect.objectContaining({
        event: 'job.failed',
        job: 'purgeExpiredAuthRecords',
        errorCategory: 'Error',
      }),
    );
  });
});

function candidate(recordType: 'SESSION' | 'TOKEN', index: number) {
  return {
    recordType,
    id: `0198e4f0-7d16-4c1a-a2bd-${index.toString().padStart(12, '0')}`,
    terminalAt: new Date(EXPECTED_CUTOFF.getTime() - index * 1_000),
  };
}

function config(): AppConfig {
  return {
    scheduler: { authCleanupBatchSize: 500 },
  } as AppConfig;
}
