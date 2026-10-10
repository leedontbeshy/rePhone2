import { describe, expect, it } from 'vitest';
import { commissionAmount, normalizePhone } from './affiliate.policy.js';
describe('Affiliate monetary policy', () => {
  it('uses basis points and caps at available margin', () => {
    expect(commissionAmount(10_000_000n, 9_850_000n, 200)).toBe(150_000n);
    expect(commissionAmount(10_000_000n, 9_000_000n, 200)).toBe(200_000n);
  });
  it('rounds down and never pays below the protected floor', () => {
    expect(commissionAmount(10_000_049n, 9_000_000n, 200)).toBe(200_000n);
    expect(commissionAmount(1n, 2n, 200)).toBe(0n);
    expect(commissionAmount(0n, 0n, 500)).toBe(0n);
    expect(commissionAmount(100n, 0n, 501)).toBe(0n);
  });
  it('recalculates partial/full item refunds from immutable floor and rate', () => {
    expect(commissionAmount(9_000_000n, 8_850_000n, 200)).toBe(150_000n);
    expect(commissionAmount(8_900_000n, 8_850_000n, 200)).toBe(50_000n);
    expect(commissionAmount(0n, 8_850_000n, 200)).toBe(0n);
  });
  it('normalizes local and international self referral phone numbers', () => {
    expect(normalizePhone('+84 913 123 456')).toBe(normalizePhone('0913123456'));
  });
});
