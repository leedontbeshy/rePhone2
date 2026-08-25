import type { Prisma } from '../../generated/prisma/client.js';

export type AuditSafeJson =
  string | number | boolean | null | AuditSafeJson[] | { [key: string]: AuditSafeJson };

const BLOCKED_EXACT_KEYS = new Set([
  'authorization',
  'apikey',
  'bankaccount',
  'bankaccountnumber',
  'ciphertext',
  'contact',
  'contactsnapshot',
  'cookie',
  'customername',
  'eid',
  'encryptionkey',
  'evidencebucket',
  'evidencedigest',
  'evidenceobjectpath',
  'evidencepath',
  'evidencesha256',
  'evidenceurl',
  'imei',
  'imei1',
  'imei2',
  'identifier',
  'identifiervalue',
  'objectpath',
  'rawidentifier',
  'serial',
  'servicerolekey',
  'shippingaddress',
  'shippingaddresssnapshot',
  'signedurl',
  'sha256',
]);

/**
 * Audit payloads are intentionally small JSON structures. This sanitizer is a
 * second boundary: callers must still provide safe deltas, while values written
 * before this boundary existed are sanitized again when read.
 */
export function sanitizeAuditJson(value: unknown): AuditSafeJson | undefined {
  return sanitizeValue(value, new WeakSet<object>());
}

export function toAuditInputJson(value: unknown): Prisma.InputJsonValue | undefined {
  const sanitized = sanitizeAuditJson(value);
  return sanitized === undefined ? undefined : (sanitized as Prisma.InputJsonValue);
}

function sanitizeValue(value: unknown, ancestors: WeakSet<object>): AuditSafeJson | undefined {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'object') return undefined;

  if (ancestors.has(value)) return undefined;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => sanitizeValue(entry, ancestors) ?? null);
    }

    const output: Record<string, AuditSafeJson> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (isBlockedAuditKey(key)) continue;
      const sanitized = sanitizeValue(entry, ancestors);
      if (sanitized !== undefined) output[key] = sanitized;
    }
    return output;
  } finally {
    ancestors.delete(value);
  }
}

function isBlockedAuditKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (BLOCKED_EXACT_KEYS.has(normalized)) return true;
  if (
    normalized.includes('password') ||
    normalized.includes('token') ||
    normalized.includes('cookie') ||
    normalized.includes('secret') ||
    normalized.includes('credential') ||
    normalized.includes('authorization') ||
    normalized.includes('hmac') ||
    normalized.includes('cipher') ||
    normalized.includes('encrypted')
  ) {
    return true;
  }
  if (
    normalized.endsWith('hash') ||
    normalized.endsWith('digest') ||
    normalized.endsWith('signedurl') ||
    normalized.endsWith('objectpath') ||
    normalized.endsWith('bucket') ||
    normalized.endsWith('address') ||
    normalized.endsWith('addresssnapshot') ||
    normalized.endsWith('email') ||
    normalized.endsWith('phone') ||
    normalized.endsWith('phonenumber')
  ) {
    return true;
  }
  return false;
}
