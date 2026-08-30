import { describe, expect, it, vi } from 'vitest';
import { InMemoryStorageProvider } from './in-memory-storage.provider.js';
import { NoopMailProvider } from './smtp-mail.provider.js';

describe('provider health probes', () => {
  it('checks in-memory storage without creating an object', async () => {
    const storage = new InMemoryStorageProvider();

    await expect(storage.probe()).resolves.toBeUndefined();
    expect(storage.objectCount()).toBe(0);
  });

  it('reports the noop mail provider as not configured without sending', async () => {
    const mail = new NoopMailProvider();
    const send = vi.spyOn(mail, 'send');

    await expect(mail.probe()).resolves.toBe('not-configured');
    expect(send).not.toHaveBeenCalled();
  });
});
