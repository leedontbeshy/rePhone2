import { describe, expect, it } from 'vitest';
import { GuestOrderIdentityService } from './guest-order-identity.service.js';

describe('GuestOrderIdentityService', () => {
  const service = new GuestOrderIdentityService();

  it('creates a 256-bit base64url token and lowercase SHA-256 digest', () => {
    const token = service.createToken();
    const digest = service.digestToken(token);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(service.matches(token, digest)).toBe(true);
  });

  it('rejects malformed and mismatched tokens without throwing', () => {
    const token = service.createToken();
    expect(service.matches('bad', service.digestToken(token))).toBe(false);
    expect(service.matches(service.createToken(), service.digestToken(token))).toBe(false);
    expect(service.matches(token, null)).toBe(false);
  });
});
