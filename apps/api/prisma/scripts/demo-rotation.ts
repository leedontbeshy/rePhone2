import type {
  IdentifierCodec,
  IdentifierType,
} from '../../src/modules/inventory/identifier-protection.js';

export const IDENTIFIER_FIELDS = [
  { encrypted: 'imei1_encrypted', hmac: 'imei1_hmac', suffix: 'imei1_suffix', type: 'IMEI' },
  { encrypted: 'imei2_encrypted', hmac: 'imei2_hmac', suffix: 'imei2_suffix', type: 'IMEI' },
  { encrypted: 'serial_encrypted', hmac: 'serial_hmac', suffix: 'serial_suffix', type: 'SERIAL' },
  { encrypted: 'eid_encrypted', hmac: 'eid_hmac', suffix: 'eid_suffix', type: 'EID' },
] as const satisfies readonly {
  encrypted: string;
  hmac: string;
  suffix: string;
  type: IdentifierType;
}[];

export interface RotationRow extends Record<string, unknown> {
  id: string;
  identifier_key_version: number;
}

export interface RotationUpdate {
  id: string;
  values: Record<string, string | null>;
}

/** Pure planning: no I/O, no plaintext in output or error messages. */
export function planIdentifierRotation(
  rows: readonly RotationRow[],
  source: IdentifierCodec,
  target: IdentifierCodec,
): RotationUpdate[] {
  const seen = new Map<string, string>();
  const updates = rows.map((row) => {
    if (row.identifier_key_version !== source.keyVersion)
      throw new Error('Unexpected identifier key version; no rows changed.');
    const values: RotationUpdate['values'] = {};
    for (const field of IDENTIFIER_FIELDS) {
      const encrypted = row[field.encrypted];
      if (encrypted === null) {
        if (row[field.hmac] !== null)
          throw new Error('Identifier HMAC has no ciphertext; no rows changed.');
        values[field.encrypted] = null;
        values[field.hmac] = null;
        continue;
      }
      if (typeof encrypted !== 'string')
        throw new Error('Invalid identifier ciphertext; no rows changed.');
      let plaintext: string;
      try {
        plaintext = source.decrypt(encrypted, row.identifier_key_version);
      } catch {
        throw new Error('Cannot decrypt an identifier; no rows changed.');
      }
      let protectedValue;
      try {
        protectedValue = target.protect(field.type, plaintext);
      } catch {
        throw new Error('An existing identifier fails validation; no rows changed.');
      }
      if (target.decrypt(protectedValue.encrypted, target.keyVersion) !== plaintext) {
        throw new Error('Rotation would change an identifier value; no rows changed.');
      }
      const suffix = row[field.suffix];
      if (typeof suffix === 'string' && !plaintext.endsWith(suffix))
        throw new Error('Identifier suffix mismatch; no rows changed.');
      const uniqueKey = `${field.type}:${protectedValue.hmac}`;
      if (seen.has(uniqueKey)) throw new Error('Duplicate existing identifiers; no rows changed.');
      seen.set(uniqueKey, row.id);
      values[field.encrypted] = protectedValue.encrypted;
      values[field.hmac] = protectedValue.hmac;
    }
    return { id: row.id, values };
  });
  const originalLookups = new Map<string, string>();
  for (const row of rows)
    for (const field of IDENTIFIER_FIELDS) {
      const value = row[field.hmac];
      if (typeof value === 'string') originalLookups.set(`${field.hmac}:${value}`, row.id);
    }
  for (const update of updates)
    for (const field of IDENTIFIER_FIELDS) {
      const value = update.values[field.hmac];
      const owner =
        value === null ? undefined : originalLookups.get(`${field.hmac}:${value ?? ''}`);
      if (owner !== undefined && owner !== update.id)
        throw new Error('New lookup collides with existing data; no rows changed.');
    }
  return updates;
}
