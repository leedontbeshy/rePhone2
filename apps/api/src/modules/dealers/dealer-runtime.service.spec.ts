import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../config/app-config.js';
import type { PrismaService } from '../../database/prisma.service.js';
import { setTestEnvironment } from '../../../test/support/test-environment.js';
import { DealerRuntime } from './dealer-runtime.service.js';

describe('Dealer environment isolation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  function config() {
    setTestEnvironment();
    return loadConfig(process.env);
  }
  const prisma = {} as PrismaService;
  it('accepts an empty example key only when LIVE dealer access is disabled', () => {
    const input = config();
    vi.stubEnv('DEALER_ENABLED', 'false');
    vi.stubEnv('DEALER_ENVIRONMENT', 'LIVE');
    vi.stubEnv('DEALER_ENCRYPTION_KEY', '');
    expect(new DealerRuntime(input, prisma).enabled).toBe(false);
    vi.stubEnv('DEALER_ENABLED', 'true');
    expect(() => new DealerRuntime(input, prisma)).toThrow('separate');
  });
  it('fails closed for a TEST database with a production name', () => {
    const input = config();
    vi.stubEnv('DEALER_ENABLED', 'true');
    vi.stubEnv('DEALER_ENVIRONMENT', 'TEST');
    expect(
      () =>
        new DealerRuntime(
          {
            ...input,
            database: { ...input.database, url: 'postgresql://user:pass@localhost/live' },
          },
          prisma,
        ),
    ).toThrow('isolated database');
  });
  it('requires a mail sink and labelled storage for TEST', () => {
    const input = config();
    vi.stubEnv('DEALER_ENABLED', 'true');
    vi.stubEnv('DEALER_ENVIRONMENT', 'TEST');
    expect(
      () =>
        new DealerRuntime({ ...input, mail: { ...input.mail, host: 'smtp.example.com' } }, prisma),
    ).toThrow('mail sink');
    expect(
      () =>
        new DealerRuntime(
          { ...input, storage: { ...input.storage, privateBucket: 'customer-files' } },
          prisma,
        ),
    ).toThrow('storage buckets');
  });
  it('requires a separate LIVE key and prevents cross-environment decryption and simulation', () => {
    const input = config();
    vi.stubEnv('DEALER_ENABLED', 'true');
    vi.stubEnv('DEALER_ENVIRONMENT', 'TEST');
    const testRuntime = new DealerRuntime(input, prisma);
    const cipher = testRuntime.encrypt('TEST secret');
    expect(testRuntime.decrypt(cipher)).toBe('TEST secret');
    vi.stubEnv('DEALER_ENVIRONMENT', 'LIVE');
    vi.stubEnv('DEALER_ENCRYPTION_KEY', undefined);
    expect(() => new DealerRuntime(input, prisma)).toThrow('separate');
    vi.stubEnv('DEALER_ENCRYPTION_KEY', input.identifiers.encryptionKey);
    const live = new DealerRuntime(input, prisma);
    expect(() => live.decrypt(cipher)).toThrow();
    expect(() => {
      live.assertSandbox();
    }).toThrow();
  });
  it('rejects an environment marker from another deployment', async () => {
    const input = config();
    vi.stubEnv('DEALER_ENABLED', 'true');
    vi.stubEnv('DEALER_ENVIRONMENT', 'TEST');
    const marker = {
      dealerEnvironment: { upsert: vi.fn().mockResolvedValue({ mode: 'LIVE' }) },
    } as unknown as PrismaService;
    await expect(new DealerRuntime(input, marker).onModuleInit()).rejects.toThrow(
      'another environment',
    );
  });
});
