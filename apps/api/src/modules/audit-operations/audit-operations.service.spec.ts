import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackofficeAuditLogListQueryDto } from './audit-operations.dto.js';
import type {
  AuditOperationsRecord,
  AuditOperationsRepository,
} from './audit-operations.repository.js';
import { AuditOperationsService } from './audit-operations.service.js';

const AUDIT_ID = '019b7df5-c3b9-763c-a251-aa021b41a62a';
const ACTOR_ID = '019b7df5-e33f-7494-a163-71950252679a';
const context = { actorUserId: ACTOR_ID, requestId: 'request-audit-read' };

describe('AuditOperationsService', () => {
  const repository = {
    list: vi.fn(),
    findById: vi.fn(),
  };
  let service: AuditOperationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuditOperationsService(repository as unknown as AuditOperationsRepository);
  });

  it('returns safe paginated list projections without IP or user-agent', async () => {
    repository.list.mockResolvedValue({ items: [record()], totalItems: 1 });
    const result = await service.list(new BackofficeAuditLogListQueryDto(), context);

    expect(result.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
    expect(result.items[0]).toEqual({
      id: AUDIT_ID,
      actorType: 'USER',
      actor: {
        id: ACTOR_ID,
        fullName: 'Audit Admin',
        role: 'ADMIN',
        employeeCode: 'ADM001',
      },
      action: 'settings.updated',
      resourceType: 'StoreSettings',
      resourceId: null,
      requestId: 'request-original',
      changes: { after: { version: 2 } },
      metadata: { reasonLength: 12 },
      createdAt: '2026-08-25T08:00:00.000Z',
    });
    expect(result.items[0]).not.toHaveProperty('ipAddress');
    expect(result.items[0]).not.toHaveProperty('userAgent');
  });

  it('defensively redacts legacy detail JSON and logs the security access without recursion', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    repository.findById.mockResolvedValue(record());

    const detail = await service.detail(AUDIT_ID, context);

    expect(detail.changes).toEqual({ after: { version: 2 } });
    expect(detail.metadata).toEqual({ reasonLength: 12 });
    expect(detail.ipAddress).toBe('127.0.0.1');
    expect(detail.userAgent).toBe('test-agent');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'security.audit_log.accessed',
        operation: 'DETAIL',
        outcome: 'FOUND',
        actorUserId: ACTOR_ID,
        requestId: 'request-audit-read',
        auditLogId: AUDIT_ID,
      }),
    );
    expect(repository).not.toHaveProperty('create');
    log.mockRestore();
  });

  it('rejects an inverted date range before querying', async () => {
    const query = Object.assign(new BackofficeAuditLogListQueryDto(), {
      createdFrom: '2026-08-25T00:00:00.000Z',
      createdTo: '2026-08-24T00:00:00.000Z',
    });

    await expect(service.list(query, context)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('masks missing detail as RESOURCE_NOT_FOUND while logging the access attempt', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    repository.findById.mockResolvedValue(null);

    await expect(service.detail(AUDIT_ID, context)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'NOT_FOUND', auditLogId: AUDIT_ID }),
    );
    log.mockRestore();
  });
});

function record(): AuditOperationsRecord {
  return {
    id: AUDIT_ID,
    actorType: 'USER',
    actorApiClientId: null,
    actorUserId: ACTOR_ID,
    action: 'settings.updated',
    resourceType: 'StoreSettings',
    resourceId: null,
    requestId: 'request-original',
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    changes: { after: { version: 2, bankAccountNumber: '0123456789' } },
    metadata: { reasonLength: 12, accessToken: 'legacy-token' },
    createdAt: new Date('2026-08-25T08:00:00.000Z'),
    actorUser: {
      id: ACTOR_ID,
      fullName: 'Audit Admin',
      role: 'ADMIN',
      employeeCode: 'ADM001',
    },
  };
}
