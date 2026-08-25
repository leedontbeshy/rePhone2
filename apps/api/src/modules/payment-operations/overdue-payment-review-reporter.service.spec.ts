import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import { OverduePaymentReviewReporter } from './overdue-payment-review-reporter.service.js';
import type { PaymentOperationsRepository } from './payment-operations.repository.js';

const NOW = new Date('2026-08-25T12:00:00.000Z');

describe('OverduePaymentReviewReporter', () => {
  let logEntries: unknown[];
  let warningEntries: unknown[];
  let errorEntries: unknown[];

  beforeEach(() => {
    logEntries = [];
    warningEntries = [];
    errorEntries = [];
    vi.spyOn(Logger.prototype, 'log').mockImplementation((value: unknown) => {
      logEntries.push(value);
    });
    vi.spyOn(Logger.prototype, 'warn').mockImplementation((value: unknown) => {
      warningEntries.push(value);
    });
    vi.spyOn(Logger.prototype, 'error').mockImplementation((value: unknown) => {
      errorEntries.push(value);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports only safe identifiers and never invokes a mutation dependency', async () => {
    const candidates = [candidate(1), candidate(2)];
    const findOverdueReviewCandidates = vi.fn().mockResolvedValue(candidates);
    const repository = {
      findOverdueReviewCandidates,
    } as unknown as PaymentOperationsRepository;
    const reporter = new OverduePaymentReviewReporter(
      repository,
      { scheduler: { batchSize: 100 } } as AppConfig,
      { now: () => NOW },
    );

    await expect(reporter.report()).resolves.toEqual({
      scanned: 2,
      reported: 2,
      failed: 0,
      skippedOverlap: false,
    });

    expect(findOverdueReviewCandidates).toHaveBeenCalledWith(NOW, 100);
    const reports = warningEntries.filter(
      (entry) => isRecord(entry) && entry['event'] === 'payment.review_overdue',
    );
    expect(reports).toHaveLength(2);
    expect(reports[0]).toMatchObject({
      paymentId: candidates[0]?.id,
      orderId: candidates[0]?.orderId,
      reviewDueAt: candidates[0]?.reviewDueAt.toISOString(),
    });
    expect(JSON.stringify(reports)).not.toContain('customer');
    expect(JSON.stringify(reports)).not.toContain('amount');
    expect(logEntries).toContainEqual(
      expect.objectContaining({
        event: 'job.completed',
        job: 'reportOverduePaymentReviews',
        scanned: 2,
        succeeded: 2,
      }),
    );
  });

  it('skips an overlapping reporter run', async () => {
    let release!: (value: []) => void;
    const gate = new Promise<[]>((resolve) => {
      release = resolve;
    });
    const repository = {
      findOverdueReviewCandidates: vi.fn(() => gate),
    } as unknown as PaymentOperationsRepository;
    const reporter = new OverduePaymentReviewReporter(
      repository,
      { scheduler: { batchSize: 100 } } as AppConfig,
      { now: () => NOW },
    );

    const first = reporter.report();
    await expect(reporter.report()).resolves.toMatchObject({ skippedOverlap: true });
    release([]);
    await expect(first).resolves.toMatchObject({ skippedOverlap: false });
  });

  it('isolates a structured-log failure and continues later candidates', async () => {
    const candidates = [candidate(1), candidate(2)];
    const repository = {
      findOverdueReviewCandidates: vi.fn().mockResolvedValue(candidates),
    } as unknown as PaymentOperationsRepository;
    vi.spyOn(Logger.prototype, 'warn').mockImplementation((value: unknown) => {
      if (isRecord(value) && value['paymentId'] === candidates[0]?.id) {
        throw new Error('log sink unavailable');
      }
      warningEntries.push(value);
    });
    const reporter = new OverduePaymentReviewReporter(
      repository,
      { scheduler: { batchSize: 100 } } as AppConfig,
      { now: () => NOW },
    );

    await expect(reporter.report()).resolves.toMatchObject({
      scanned: 2,
      reported: 1,
      failed: 1,
    });
    expect(errorEntries).toContainEqual(
      expect.objectContaining({
        event: 'job.record_failed',
        paymentId: candidates[0]?.id,
        errorCategory: 'Error',
      }),
    );
  });

  it('logs a failed candidate scan and releases the mutex', async () => {
    const repository = {
      findOverdueReviewCandidates: vi
        .fn()
        .mockRejectedValueOnce(new Error('database unavailable'))
        .mockResolvedValueOnce([]),
    } as unknown as PaymentOperationsRepository;
    const reporter = new OverduePaymentReviewReporter(
      repository,
      { scheduler: { batchSize: 100 } } as AppConfig,
      { now: () => NOW },
    );

    await expect(reporter.report()).rejects.toThrow('database unavailable');
    await expect(reporter.report()).resolves.toMatchObject({ skippedOverlap: false });
    expect(errorEntries).toContainEqual(
      expect.objectContaining({
        event: 'job.failed',
        job: 'reportOverduePaymentReviews',
        errorCategory: 'Error',
      }),
    );
  });

  it('categorizes non-Error row and scan failures without wedging the mutex', async () => {
    const candidates = [candidate(1)];
    const repository = {
      findOverdueReviewCandidates: vi
        .fn()
        .mockResolvedValueOnce(candidates)
        .mockRejectedValueOnce('scan unavailable'),
    } as unknown as PaymentOperationsRepository;
    vi.spyOn(Logger.prototype, 'warn').mockImplementation((value: unknown) => {
      if (isRecord(value) && value['event'] === 'payment.review_overdue') {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- exercises the defensive unknown catch branch.
        throw 'log unavailable';
      }
      warningEntries.push(value);
    });
    const reporter = new OverduePaymentReviewReporter(
      repository,
      { scheduler: { batchSize: 100 } } as AppConfig,
      { now: () => NOW },
    );

    await expect(reporter.report()).resolves.toMatchObject({ failed: 1 });
    await expect(reporter.report()).rejects.toBe('scan unavailable');
    expect(errorEntries).toContainEqual(
      expect.objectContaining({ event: 'job.record_failed', errorCategory: 'UnknownError' }),
    );
    expect(errorEntries).toContainEqual(
      expect.objectContaining({ event: 'job.failed', errorCategory: 'UnknownError' }),
    );
  });
});

function candidate(index: number) {
  const suffix = index.toString().padStart(12, '0');
  return {
    id: `0198e4f0-7d16-4c1a-a2bd-${suffix}`,
    orderId: `0198e4f0-7d16-4c1a-b2bd-${suffix}`,
    reviewDueAt: new Date(NOW.getTime() - index * 60_000),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
