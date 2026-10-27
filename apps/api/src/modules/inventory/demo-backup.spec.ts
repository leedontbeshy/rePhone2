import { describe, expect, it } from 'vitest';
import {
  encryptBackup,
  decryptBackup,
  assertSnapshot,
} from '../../../prisma/scripts/demo-backup.js';

describe('encrypted demo backups', () => {
  it('authenticates backup bytes and refuses the wrong key or a modified archive', () => {
    const key = Buffer.alloc(32, 3);
    const encrypted = encryptBackup(Buffer.from('private database and original keys'), key);
    expect(decryptBackup(encrypted, key).toString()).toBe('private database and original keys');
    expect(encrypted.includes(Buffer.from('private database'))).toBe(false);
    expect(() => decryptBackup(encrypted, Buffer.alloc(32, 4))).toThrow();
    encrypted[encrypted.length - 1] = (encrypted[encrypted.length - 1] ?? 0) ^ 1;
    expect(() => decryptBackup(encrypted, key)).toThrow();
  });
  it('refuses changed table counts or business fingerprints', () => {
    expect(() => {
      assertSnapshot(
        { orders: { count: 1, digest: 'before' } },
        { orders: { count: 2, digest: 'after' } },
      );
    }).toThrow(/changed/);
  });
});
