import { createCipheriv } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { IdentifierCodec } from './identifier-protection.js';
import { planIdentifierRotation, type RotationRow } from '../../../prisma/scripts/demo-rotation.js';

const oldKey = Buffer.alloc(32, 11);
const source = new IdentifierCodec(
  oldKey.toString('base64'),
  Buffer.alloc(32, 12).toString('base64'),
);
const target = new IdentifierCodec(
  Buffer.alloc(32, 13).toString('base64'),
  Buffer.alloc(32, 14).toString('base64'),
  2,
);
function row(id = 'one'): RotationRow {
  const serial = source.protect('SERIAL', 'SERIAL123');
  return {
    id,
    identifier_key_version: 1,
    imei1_encrypted: null,
    imei1_hmac: null,
    imei1_suffix: null,
    imei2_encrypted: null,
    imei2_hmac: null,
    imei2_suffix: null,
    serial_encrypted: serial.encrypted,
    serial_hmac: serial.hmac,
    serial_suffix: serial.suffix,
    eid_encrypted: null,
    eid_hmac: null,
    eid_suffix: null,
  };
}
describe('demo identifier rotation', () => {
  it('keeps IDs, plaintext and null values while replacing ciphertext and lookup hashes', () => {
    const original = row();
    const updates = planIdentifierRotation([original], source, target);
    const update = updates[0];
    expect(update?.id).toBe('one');
    expect(update?.values.serial_hmac).not.toBe(original.serial_hmac);
    expect(target.decrypt(update?.values.serial_encrypted ?? '', 2)).toBe('SERIAL123');
    expect(update?.values.imei1_encrypted).toBeNull();
    expect(original.identifier_key_version).toBe(1);
  });
  it('supports legacy envelopes without normalizing or losing their values', () => {
    const nonce = Buffer.alloc(12, 2);
    const cipher = createCipheriv('aes-256-gcm', oldKey, nonce);
    const ciphertext = Buffer.concat([cipher.update('SERIAL123'), cipher.final()]);
    const original = row();
    original.serial_encrypted = `v1:${nonce.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ciphertext.toString('base64url')}`;
    const update = planIdentifierRotation([original], source, target)[0];
    expect(target.decrypt(update?.values.serial_encrypted ?? '', 2)).toBe('SERIAL123');
  });
  it('rejects damaged, duplicate, orphaned and unexpected-version data before any write', () => {
    expect(() =>
      planIdentifierRotation([{ ...row(), serial_encrypted: 'broken' }], source, target),
    ).toThrow(/decrypt/);
    expect(() => planIdentifierRotation([row('one'), row('two')], source, target)).toThrow(
      /Duplicate/,
    );
    expect(() =>
      planIdentifierRotation([{ ...row(), serial_encrypted: null }], source, target),
    ).toThrow(/HMAC/);
    expect(() =>
      planIdentifierRotation([{ ...row(), identifier_key_version: 2 }], source, target),
    ).toThrow(/version/);
  });
});
