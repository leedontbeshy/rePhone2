import { createApiClient } from '@rephone/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchBackofficePendingTasks, type PendingTaskCounts } from './backoffice-pending-tasks';
import { BACKOFFICE_TASKS_CHANGED, fetchWithBackofficeTaskUpdates } from './backoffice-task-events';

const counts: PendingTaskCounts = {
  orders: 2,
  payments: 1,
  refunds: 0,
  afterSales: 0,
  inventory: 0,
  dealers: 0,
};

describe('backoffice pending task updates', () => {
  let stop: (() => void) | undefined;
  let page: EventTarget & { visibilityState: string };
  beforeEach(() => {
    vi.useFakeTimers();
    page = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('document', page);
    vi.stubGlobal(
      'window',
      Object.assign(new EventTarget(), { location: { origin: 'http://localhost' } }),
    );
  });
  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('loads immediately, refreshes after successful actions and pauses polling in hidden tabs', async () => {
    const load = vi.fn().mockResolvedValue(counts);
    const publish = vi.fn();
    stop = watchBackofficePendingTasks(load, publish);
    await vi.advanceTimersByTimeAsync(0);
    expect(publish).toHaveBeenLastCalledWith(counts);
    load.mockResolvedValue({ ...counts, orders: 1 });
    window.dispatchEvent(new Event(BACKOFFICE_TASKS_CHANGED));
    window.dispatchEvent(new Event(BACKOFFICE_TASKS_CHANGED));
    await vi.advanceTimersByTimeAsync(150);
    expect(load).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenLastCalledWith({ ...counts, orders: 1 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(load).toHaveBeenCalledTimes(3);
    page.visibilityState = 'hidden';
    await vi.advanceTimersByTimeAsync(60_000);
    expect(load).toHaveBeenCalledTimes(3);
    page.visibilityState = 'visible';
    page.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(4);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(5);
  });

  it('rechecks a mutation during an in-flight read without publishing the older result', async () => {
    let resolve!: (value: PendingTaskCounts) => void;
    const load = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<PendingTaskCounts>((done) => {
          resolve = done;
        }),
      )
      .mockResolvedValue({ ...counts, orders: 0 });
    const publish = vi.fn();
    stop = watchBackofficePendingTasks(load, publish);
    window.dispatchEvent(new Event(BACKOFFICE_TASKS_CHANGED));
    resolve(counts);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenLastCalledWith({ ...counts, orders: 0 });
  });

  it('clears failed counts and can recover on the next refresh', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(counts)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(counts);
    const publish = vi.fn();
    stop = watchBackofficePendingTasks(load, publish);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(publish).toHaveBeenLastCalledWith(null);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(publish).toHaveBeenLastCalledWith(counts);
  });

  it('aborts on account or route cleanup and ignores late responses', async () => {
    let resolve!: (value: PendingTaskCounts) => void;
    const load = vi.fn<(signal: AbortSignal) => Promise<PendingTaskCounts>>(
      () =>
        new Promise<PendingTaskCounts>((done) => {
          resolve = done;
        }),
    );
    const publish = vi.fn();
    stop = watchBackofficePendingTasks(load, publish);
    const signal = load.mock.calls[0]?.[0];
    stop();
    expect(signal?.aborted).toBe(true);
    resolve(counts);
    window.dispatchEvent(new Event(BACKOFFICE_TASKS_CHANGED));
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(publish).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('invalidates only successful backoffice mutations, including an authenticated replay', async () => {
    const changed = vi.fn();
    window.addEventListener(BACKOFFICE_TASKS_CHANGED, changed);
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const url = 'http://localhost/api/v1/backoffice/orders/one/confirm';
    await fetchWithBackofficeTaskUpdates(url, { method: 'GET' });
    await fetchWithBackofficeTaskUpdates('http://localhost/api/v1/auth/login', { method: 'POST' });
    fetcher.mockResolvedValueOnce(new Response('{}', { status: 409 }));
    await fetchWithBackofficeTaskUpdates(url, { method: 'POST' });
    expect(changed).not.toHaveBeenCalled();

    let token = 'expired';
    fetcher
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const client = createApiClient({
      baseUrl: 'http://localhost',
      getAccessToken: () => token,
      refreshAccessToken: () => {
        token = 'renewed';
        return Promise.resolve(token);
      },
      fetch: fetchWithBackofficeTaskUpdates,
    });
    await client.POST('/api/v1/backoffice/orders/{id}/confirm', {
      params: { path: { id: 'one' } },
    });
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
