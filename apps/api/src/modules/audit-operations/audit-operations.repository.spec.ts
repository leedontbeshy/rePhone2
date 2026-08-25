import { describe, expect, it } from 'vitest';
import { BackofficeAuditLogListQueryDto } from './audit-operations.dto.js';
import { buildAuditWhere } from './audit-operations.repository.js';

describe('buildAuditWhere', () => {
  it('uses an exact action filter by default', () => {
    const query = Object.assign(new BackofficeAuditLogListQueryDto(), {
      action: 'payment.verified',
      actorType: 'USER' as const,
      requestId: 'request-1',
    });

    expect(buildAuditWhere(query)).toMatchObject({
      action: 'payment.verified',
      actorType: 'USER',
      requestId: 'request-1',
    });
  });

  it('only expands an explicit namespaced wildcard into a prefix filter', () => {
    const query = Object.assign(new BackofficeAuditLogListQueryDto(), {
      action: 'inventory.unit.*',
      createdFrom: '2026-08-01T00:00:00.000Z',
      createdTo: '2026-08-25T00:00:00.000Z',
    });

    expect(buildAuditWhere(query)).toEqual({
      action: { startsWith: 'inventory.unit.' },
      createdAt: {
        gte: new Date('2026-08-01T00:00:00.000Z'),
        lte: new Date('2026-08-25T00:00:00.000Z'),
      },
    });
  });
});
