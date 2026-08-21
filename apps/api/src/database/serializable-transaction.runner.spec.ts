import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '../common/errors/api-error.js';
import {
  isRetryableTransactionError,
  SerializableTransactionRunner,
} from './serializable-transaction.runner.js';

describe('SerializableTransactionRunner', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('recognizes Prisma and PostgreSQL serialization/deadlock failures only', () => {
    expect(isRetryableTransactionError({ code: 'P2034' })).toBe(true);
    expect(isRetryableTransactionError({ meta: { code: '40001' } })).toBe(true);
    expect(isRetryableTransactionError({ code: '40P01' })).toBe(true);
    expect(isRetryableTransactionError({ code: 'P2002' })).toBe(false);
  });

  it('retries a serializable conflict with the required transaction options', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const transaction = vi
      .fn()
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockResolvedValueOnce('completed');
    const runner = new SerializableTransactionRunner({ $transaction: transaction } as never);

    const result = runner.run('inventory.test', () => Promise.resolve('ignored'));
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe('completed');
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      maxWait: 2_000,
      timeout: 5_000,
    });
  });

  it('fails closed after the bounded retry budget', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const transaction = vi.fn().mockRejectedValue({ code: 'P2034' });
    const runner = new SerializableTransactionRunner({ $transaction: transaction } as never);

    const result = runner.run('inventory.test', () => Promise.resolve('ignored'));
    const assertion = expect(result).rejects.toMatchObject({
      code: 'CONCURRENT_MODIFICATION',
    } satisfies Partial<ApiError>);
    await vi.runAllTimersAsync();

    await assertion;
    expect(transaction).toHaveBeenCalledTimes(3);
  });
});
