import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';

const pending = vi.hoisted(() => [] as Array<() => void>);
vi.mock('argon2', () => ({
  argon2id: 2,
  hash: vi.fn(
    () =>
      new Promise<string>((resolve) => {
        pending.push(() => {
          resolve('hashed');
        });
      }),
  ),
  verify: vi.fn(() => Promise.resolve(true)),
}));
import { PasswordService } from './password.service.js';

describe('PasswordService memory bound', () => {
  it('runs at most two hashes and rejects overflow with 429 without lowering hash parameters', async () => {
    const service = new PasswordService({
      auth: { argon2MemoryKib: 65536, argon2TimeCost: 3, argon2Parallelism: 1 },
    } as AppConfig);
    const tasks = Array.from({ length: 21 }, () => service.hash('password'));
    expect(pending).toHaveLength(2);
    await expect(service.hash('overflow')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    while (pending.length || tasks.length) {
      for (const finish of pending.splice(0)) finish();
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!pending.length) break;
    }
    await expect(Promise.all(tasks)).resolves.toHaveLength(21);
  });
});
