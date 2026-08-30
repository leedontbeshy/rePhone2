import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import { SmtpMailProvider } from './smtp-mail.provider.js';
import { StorageProviderError, SupabaseStorageProvider } from './supabase-storage.provider.js';

const doubles = vi.hoisted(() => ({
  listBuckets: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ storage: { listBuckets: doubles.listBuckets } })),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: vi.fn(), verify: doubles.verify })),
  },
}));

describe('external provider health probes', () => {
  beforeEach(() => {
    doubles.listBuckets.mockReset();
    doubles.verify.mockReset();
  });

  it('uses a read-only Supabase bucket-list request and returns no metadata', async () => {
    doubles.listBuckets.mockResolvedValue({ data: [{ id: 'private-bucket' }], error: null });
    const provider = new SupabaseStorageProvider(config());

    await expect(provider.probe()).resolves.toBeUndefined();
    expect(doubles.listBuckets).toHaveBeenCalledOnce();
  });

  it('maps a Supabase probe failure to the stable provider error', async () => {
    doubles.listBuckets.mockResolvedValue({ data: null, error: new Error('secret detail') });
    const provider = new SupabaseStorageProvider(config());

    await expect(provider.probe()).rejects.toBeInstanceOf(StorageProviderError);
  });

  it('verifies SMTP without sending a message', async () => {
    doubles.verify.mockResolvedValue(true);
    const provider = new SmtpMailProvider(config().mail);

    await expect(provider.probe()).resolves.toBe('available');
    expect(doubles.verify).toHaveBeenCalledOnce();
  });
});

function config(): AppConfig {
  return {
    storage: {
      url: 'https://example.supabase.co',
      serviceRoleKey: 'test-service-role',
      publicBucket: 'public',
      privateBucket: 'private',
      storeBucket: 'store',
      signedUrlTtlSeconds: 300,
    },
    mail: {
      host: 'smtp.example.test',
      port: 2525,
      secure: false,
      requireTls: false,
      from: 'rePhone <no-reply@example.test>',
    },
  } as AppConfig;
}
