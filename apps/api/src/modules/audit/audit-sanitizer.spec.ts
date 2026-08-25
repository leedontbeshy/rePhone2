import { describe, expect, it } from 'vitest';
import { sanitizeAuditJson } from './audit-sanitizer.js';

describe('sanitizeAuditJson', () => {
  it('recursively removes sensitive fields while retaining safe audit context', () => {
    expect(
      sanitizeAuditJson({
        before: {
          status: 'ACTIVE',
          passwordHash: 'argon-secret',
          customerEmail: 'private@example.com',
          shippingAddressSnapshot: { line1: 'Private address' },
          identifierTypes: ['IMEI', 'SERIAL'],
        },
        after: {
          status: 'DISABLED',
          nested: [
            {
              access_token: 'raw-token',
              evidenceObjectPath: 'refunds/private/path',
              bankAccountNumber: '0123456789',
              identifierEncrypted: 'cipher-envelope',
              reasonLength: 24,
            },
          ],
        },
      }),
    ).toEqual({
      before: { status: 'ACTIVE', identifierTypes: ['IMEI', 'SERIAL'] },
      after: { status: 'DISABLED', nested: [{ reasonLength: 24 }] },
    });
  });

  it('drops non-JSON and cyclic values without throwing', () => {
    const cyclic: Record<string, unknown> = { safe: true, unsafeSecret: 'secret' };
    cyclic.self = cyclic;

    expect(sanitizeAuditJson({ cyclic, missing: undefined, invalid: Number.NaN })).toEqual({
      cyclic: { safe: true },
    });
  });
});
