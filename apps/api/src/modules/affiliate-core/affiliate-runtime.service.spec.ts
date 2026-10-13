import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../config/app-config.js';
import { setTestEnvironment } from '../../../test/support/test-environment.js';
import { AffiliateRuntime } from './affiliate-runtime.service.js';

function configuration() {
  setTestEnvironment();
  vi.stubEnv('AFFILIATE_ENABLED', 'true');
  vi.stubEnv('AFFILIATE_ENVIRONMENT', 'TEST');
  vi.stubEnv('AFFILIATE_ENCRYPTION_KEY', undefined);
  return loadConfig(process.env);
}

describe('Affiliate environment and bank encryption boundaries', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('defaults to TEST and rejects unknown deployment modes', () => {
    const config = configuration();
    vi.stubEnv('AFFILIATE_ENVIRONMENT', undefined);
    expect(new AffiliateRuntime(config).mode).toBe('TEST');
    vi.stubEnv('AFFILIATE_ENVIRONMENT', 'SANDBOX');
    expect(() => new AffiliateRuntime(config)).toThrow('Invalid AFFILIATE_ENVIRONMENT');
  });

  it.each([
    'postgresql://user:pass@db.example.com/demo_test',
    'postgresql://user:pass@localhost/live',
  ])('refuses TEST against %s', (url) => {
    const config = configuration();
    expect(
      () => new AffiliateRuntime({ ...config, database: { ...config.database, url } }),
    ).toThrow('local dev or test database');
  });

  it('refuses real email delivery in TEST', () => {
    const config = configuration();
    expect(
      () => new AffiliateRuntime({ ...config, mail: { ...config.mail, host: 'smtp.example.com' } }),
    ).toThrow('local mail sink');
  });

  it('requires an explicit, valid LIVE encryption key and blocks disabled access', () => {
    const config = configuration();
    vi.stubEnv('AFFILIATE_ENVIRONMENT', 'LIVE');
    expect(() => new AffiliateRuntime(config)).toThrow('required in LIVE');
    vi.stubEnv('AFFILIATE_ENCRYPTION_KEY', 'short');
    expect(() => new AffiliateRuntime(config)).toThrow('32 bytes');
    vi.stubEnv('AFFILIATE_ENABLED', 'false');
    vi.stubEnv('AFFILIATE_ENCRYPTION_KEY', '   ');
    expect(() => {
      new AffiliateRuntime(config).assertEnabled();
    }).toThrow('chưa sẵn sàng');
  });

  it('round-trips with fresh IVs and rejects corrupted or cross-environment bank details', () => {
    const config = configuration();
    const test = new AffiliateRuntime(config);
    expect(() => {
      test.assertEnabled();
    }).not.toThrow();
    const sealed = test.encrypt('0123456789');
    expect(test.encrypt('0123456789')).not.toBe(sealed);
    expect(test.decrypt(sealed)).toBe('0123456789');
    for (const malformed of ['', 'iv', 'iv.data', '.data.tag', 'iv..tag'])
      expect(() => test.decrypt(malformed)).toThrow();
    const parts = sealed.split('.');
    parts[2] = Buffer.alloc(16).toString('base64url');
    expect(() => test.decrypt(parts.join('.'))).toThrow();
    vi.stubEnv('AFFILIATE_ENVIRONMENT', 'LIVE');
    vi.stubEnv('AFFILIATE_ENCRYPTION_KEY', config.identifiers.encryptionKey);
    expect(() => new AffiliateRuntime(config).decrypt(sealed)).toThrow();
  });
});
