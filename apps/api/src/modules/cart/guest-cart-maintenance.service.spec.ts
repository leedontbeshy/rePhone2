import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import type { CartRepository } from './cart.repository.js';
import { GuestCartMaintenanceService } from './guest-cart-maintenance.service.js';

const NOW = new Date('2026-08-25T12:00:00.000Z');

describe('GuestCartMaintenanceService', () => {
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

  it('uses the bounded guest batch and isolates a row failure', async () => {
    const candidates = [candidate(1), candidate(2), candidate(3)];
    const findExpiredGuestCartCandidates = vi.fn().mockResolvedValue(candidates);
    const markExpiredGuestCart = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('row unavailable'))
      .mockResolvedValueOnce(false);
    const repository = {
      findExpiredGuestCartCandidates,
      markExpiredGuestCart,
    } as unknown as CartRepository;
    const service = new GuestCartMaintenanceService(repository, config());

    await expect(service.markExpired(NOW)).resolves.toEqual({
      scanned: 3,
      expired: 1,
      failed: 1,
      skippedOverlap: false,
    });

    expect(findExpiredGuestCartCandidates).toHaveBeenCalledWith(NOW, 200);
    expect(markExpiredGuestCart).toHaveBeenCalledTimes(3);
    expect(errorEntries).toContainEqual(
      expect.objectContaining({
        event: 'job.record_failed',
        job: 'markExpiredGuestCarts',
        cartId: candidates[1]?.id,
        errorCategory: 'Error',
      }),
    );
  });

  it('skips an overlapping run and releases its mutex after completion', async () => {
    let release!: (value: []) => void;
    const gate = new Promise<[]>((resolve) => {
      release = resolve;
    });
    const findExpiredGuestCartCandidates = vi.fn(() => gate);
    const repository = {
      findExpiredGuestCartCandidates,
    } as unknown as CartRepository;
    const service = new GuestCartMaintenanceService(repository, config());

    const first = service.markExpired(NOW);
    await expect(service.markExpired(NOW)).resolves.toMatchObject({ skippedOverlap: true });
    release([]);
    await expect(first).resolves.toMatchObject({ skippedOverlap: false });
    expect(findExpiredGuestCartCandidates).toHaveBeenCalledOnce();
  });

  it('logs a scan failure and releases the mutex for the next tick', async () => {
    const repository = {
      findExpiredGuestCartCandidates: vi
        .fn()
        .mockRejectedValueOnce(new Error('database unavailable'))
        .mockResolvedValueOnce([]),
    } as unknown as CartRepository;
    const service = new GuestCartMaintenanceService(repository, config());

    await expect(service.markExpired(NOW)).rejects.toThrow('database unavailable');
    await expect(service.markExpired(NOW)).resolves.toMatchObject({ skippedOverlap: false });
    expect(errorEntries).toContainEqual(
      expect.objectContaining({
        event: 'job.failed',
        job: 'markExpiredGuestCarts',
        errorCategory: 'Error',
      }),
    );
  });
});

function candidate(index: number) {
  return {
    id: `0198e4f0-7d16-4c1a-a2bd-${index.toString().padStart(12, '0')}`,
    expiresAt: new Date(NOW.getTime() - index * 1_000),
  };
}

function config(): AppConfig {
  return {
    scheduler: { guestCartBatchSize: 200 },
  } as AppConfig;
}
