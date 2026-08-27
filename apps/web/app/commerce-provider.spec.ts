import { describe, expect, it, vi } from 'vitest';
import {
  createKeyedSingleFlight,
  createSerializedTaskQueue,
  createSessionRevisionTracker,
  currentSessionValue,
} from './commerce-provider';

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {
    promise,
    resolve: (value: T) => resolve?.(value),
    reject: (reason?: unknown) => reject?.(reason),
  };
}

describe('CommerceProvider foundations', () => {
  it('runs cart tasks in request order so an older response cannot finish after a newer mutation', async () => {
    const queue = createSerializedTaskQueue();
    const firstResponse = deferred<string>();
    const events: string[] = [];

    const first = queue.enqueue(async () => {
      events.push('first:start');
      const value = await firstResponse.promise;
      events.push(`first:${value}`);
      return value;
    });
    const secondWork = vi.fn(() => {
      events.push('second:start');
      return Promise.resolve('second');
    });
    const second = queue.enqueue(secondWork);

    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    expect(secondWork).not.toHaveBeenCalled();

    firstResponse.resolve('done');
    await expect(first).resolves.toBe('done');
    await expect(second).resolves.toBe('second');
    expect(events).toEqual(['first:start', 'first:done', 'second:start']);
  });

  it('continues the mutation queue after a failed cart request', async () => {
    const queue = createSerializedTaskQueue();

    const failed = queue.enqueue(() => Promise.reject(new Error('update failed')));
    const recovered = queue.enqueue(() => Promise.resolve('removed'));

    await expect(failed).rejects.toThrow('update failed');
    await expect(recovered).resolves.toBe('removed');
  });

  it('shares one merge request and permits an explicit retry after failure', async () => {
    const merge = createKeyedSingleFlight<number>();
    const firstResponse = deferred<undefined>();
    const firstWork = vi.fn(() => firstResponse.promise);

    const first = merge.run(4, firstWork);
    const duplicate = merge.run(4, firstWork);
    expect(duplicate).toBe(first);
    expect(firstWork).toHaveBeenCalledOnce();

    firstResponse.reject(new Error('merge failed'));
    await expect(first).rejects.toThrow('merge failed');

    const retryWork = vi.fn(() => Promise.resolve('merged'));
    await expect(merge.run(4, retryWork)).resolves.toBe('merged');
    expect(retryWork).toHaveBeenCalledOnce();
  });

  it('invalidates work owned by the previous login or role without resetting the same session', () => {
    const tracker = createSessionRevisionTracker('authenticated:CUSTOMER:customer-a');
    const customerRevision = tracker.capture();

    expect(tracker.sync('authenticated:CUSTOMER:customer-a')).toBe(false);
    expect(tracker.isCurrent(customerRevision)).toBe(true);

    expect(tracker.sync('anonymous:NONE:NONE')).toBe(true);
    expect(tracker.isCurrent(customerRevision)).toBe(false);
    const anonymousRevision = tracker.capture();

    expect(tracker.sync('authenticated:EMPLOYEE:employee-a')).toBe(true);
    expect(tracker.isCurrent(anonymousRevision)).toBe(false);
  });

  it('hides cart data from the previous session before effect-driven cleanup runs', () => {
    const tracker = createSessionRevisionTracker('authenticated:CUSTOMER:customer-a');
    const cartOwnerRevision = tracker.capture();
    const priorCart = { id: 'cart-a' };

    expect(currentSessionValue(priorCart, cartOwnerRevision, tracker)).toBe(priorCart);

    tracker.sync('anonymous:NONE:NONE');
    expect(currentSessionValue(priorCart, cartOwnerRevision, tracker)).toBeNull();
  });

  it('lets a new session use a fresh queue while an old-session request is still pending', async () => {
    const tracker = createSessionRevisionTracker('anonymous:NONE:NONE');
    const oldQueue = createSerializedTaskQueue();
    const oldResponse = deferred<string>();
    const oldRevision = tracker.capture();
    const oldRequest = oldQueue.enqueue(() => oldResponse.promise);

    tracker.sync('authenticated:CUSTOMER:customer-a');
    const newQueue = createSerializedTaskQueue();
    await expect(newQueue.enqueue(() => Promise.resolve('new cart'))).resolves.toBe('new cart');
    expect(tracker.isCurrent(oldRevision)).toBe(false);

    oldResponse.resolve('stale cart');
    await expect(oldRequest).resolves.toBe('stale cart');
    expect(tracker.isCurrent(oldRevision)).toBe(false);
  });
});
