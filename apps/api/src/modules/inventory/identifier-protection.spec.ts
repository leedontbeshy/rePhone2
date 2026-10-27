import { createCipheriv } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import {
  hasValidLuhnCheckDigit,
  IdentifierCodec,
  IdentifierValidationError,
  maskIdentifier,
  normalizeIdentifier,
} from './identifier-protection.js';

const ENCRYPTION_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const HMAC_KEY = 'YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk=';

describe('IdentifierCodec', () => {
  it('writes version two with fresh keys and refuses a mismatched key version', () => {
    const codec = new IdentifierCodec(
      Buffer.alloc(32, 3).toString('base64'),
      Buffer.alloc(32, 4).toString('base64'),
      2,
    );
    const value = codec.protect('SERIAL', 'SERIAL123');
    expect(value.keyVersion).toBe(2);
    expect(codec.decrypt(value.encrypted, 2)).toBe('SERIAL123');
    expect(() => codec.decrypt(value.encrypted, 1)).toThrow(/key version/);
    expect(() =>
      new IdentifierCodec(ENCRYPTION_KEY, HMAC_KEY).decrypt(value.encrypted, 2),
    ).toThrow();
  });
  const codec = new IdentifierCodec(ENCRYPTION_KEY, HMAC_KEY);

  it('normalizes and validates each identifier type', () => {
    expect(normalizeIdentifier('IMEI', '490154-203 237518')).toBe('490154203237518');
    expect(normalizeIdentifier('SERIAL', ' rph 13mid001 ')).toBe('RPH13MID001');
    expect(normalizeIdentifier('EID', '8904 9000 0000 0000 0000 0000 0000 0001')).toBe(
      '89049000000000000000000000000001',
    );
    expect(hasValidLuhnCheckDigit('490154203237518')).toBe(true);
    expect(() => normalizeIdentifier('IMEI', '490154203237519')).toThrow(IdentifierValidationError);
  });

  it('round-trips a canonical AES-GCM envelope and creates type-prefixed HMAC values', () => {
    const protectedSerial = codec.protect('SERIAL', ' rph 13mid001 ');

    expect(codec.decrypt(protectedSerial.encrypted, protectedSerial.keyVersion)).toBe(
      'RPH13MID001',
    );
    expect(protectedSerial.hmac).toBe(codec.lookupHmac('SERIAL', 'RPH13MID001'));
    expect(protectedSerial.hmac).not.toBe(codec.lookupHmac('IMEI', '490154203237518'));
    expect(protectedSerial.suffix).toBe('D001');
    expect(maskIdentifier(protectedSerial.suffix)).toBe('•••• D001');
  });

  it('decrypts the legacy seed envelope during rollout', () => {
    const plaintext = 'RPH13MID001';
    const key = Buffer.from(ENCRYPTION_KEY, 'base64');
    const nonce = Buffer.alloc(12, 7);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const legacy = `v1:${nonce.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ciphertext.toString('base64url')}`;

    expect(codec.decrypt(legacy, 1)).toBe(plaintext);
  });
});
