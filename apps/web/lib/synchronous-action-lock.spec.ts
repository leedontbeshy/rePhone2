import { describe, expect, it, vi } from 'vitest';
import { createSynchronousActionLock } from './synchronous-action-lock';

function deferred() {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: () => resolve?.() };
}

describe('createSynchronousActionLock', () => {
  it('admits only one same-key action before React can render pending state', async () => {
    const lock = createSynchronousActionLock<string>();
    const response = deferred();
    const request = vi.fn(() => response.promise);

    const first = lock.run('cart-row', request);
    const sameFrameDuplicate = lock.run('cart-row', request);

    expect(request).toHaveBeenCalledOnce();
    response.resolve();
    await expect(first).resolves.toBeUndefined();
    await expect(sameFrameDuplicate).resolves.toBeUndefined();
  });

  it('allows different wishlist cards to mutate independently', async () => {
    const lock = createSynchronousActionLock<string>();
    const first = vi.fn(() => Promise.resolve());
    const second = vi.fn(() => Promise.resolve());

    await Promise.all([lock.run('item-a', first), lock.run('item-b', second)]);

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('releases the key after a failed request so the user can retry', async () => {
    const lock = createSynchronousActionLock<string>();
    const failed = vi.fn(() => Promise.reject(new Error('failed')));
    const retry = vi.fn(() => Promise.resolve());

    await expect(lock.run('cart-row', failed)).rejects.toThrow('failed');
    await expect(lock.run('cart-row', retry)).resolves.toBeUndefined();
    expect(retry).toHaveBeenCalledOnce();
  });
});
