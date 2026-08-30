import { describe, expect, it, vi } from 'vitest';
import {
  getAuditLog,
  getSystemHealthSnapshot,
  listAuditLogs,
  systemError,
  SystemAdminError,
  type SystemApiClient,
} from './system-admin-api';

describe('systemError', () => {
  it('maps stale settings and duplicate identities to actionable messages', () => {
    expect(
      systemError({ error: { code: 'SETTINGS_VERSION_CONFLICT' } }, 'fallback').message,
    ).toContain('tải lại');
    expect(systemError({ error: { code: 'SETTINGS_VERSION_CONFLICT' } }, 'fallback')).toMatchObject(
      { name: 'SystemAdminError', code: 'SETTINGS_VERSION_CONFLICT' },
    );
    expect(systemError({ error: { code: 'DUPLICATE_RESOURCE' } }, 'fallback').message).toContain(
      'đã tồn tại',
    );
  });

  it('uses the API message when no specialized mapping exists', () => {
    expect(systemError({ error: { message: 'Thông báo an toàn' } }, 'fallback').message).toBe(
      'Thông báo an toàn',
    );
  });

  it('preserves unknown server codes without exposing an untyped error shape', () => {
    const error = systemError({ error: { code: 'SAFE_UNKNOWN', message: 'An toàn' } }, 'fallback');
    expect(error).toBeInstanceOf(SystemAdminError);
    expect(error).toMatchObject({ code: 'SAFE_UNKNOWN', message: 'An toàn' });
  });
});

describe('audit API adapter', () => {
  it('uses the generated list operation with compact server-side filters', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        data: [auditDto()],
        meta: {
          pagination: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2 },
        },
      },
    });

    const result = await listAuditLogs(clientWithGet(get), {
      action: 'employee.*',
      page: 2,
      pageSize: 20,
      requestId: '',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    expect(get).toHaveBeenCalledWith('/api/v1/backoffice/audit-logs', {
      params: {
        query: {
          action: 'employee.*',
          page: 2,
          pageSize: 20,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        },
      },
    });
    expect(result).toMatchObject({
      data: [{ id: 'audit-1' }],
      pagination: { page: 2, totalItems: 21, totalPages: 2 },
    });
  });

  it('uses the generated detail operation with the selected id', async () => {
    const get = vi.fn().mockResolvedValue({ data: { data: auditDto() } });

    const result = await getAuditLog(clientWithGet(get), 'audit-1');

    expect(get).toHaveBeenCalledWith('/api/v1/backoffice/audit-logs/{id}', {
      params: { path: { id: 'audit-1' } },
    });
    expect(result.id).toBe('audit-1');
  });
});

describe('getSystemHealthSnapshot', () => {
  it('reads the guarded detailed endpoint without cache reuse', async () => {
    const snapshot = healthSnapshot();
    const get = vi.fn().mockResolvedValue({ data: { data: snapshot } });

    const result = await getSystemHealthSnapshot(clientWithGet(get));

    expect(get).toHaveBeenCalledWith('/api/v1/backoffice/system/health', {
      cache: 'no-store',
    });
    expect(result).toEqual(snapshot);
  });

  it('fails closed when the detailed envelope is missing', async () => {
    const get = vi.fn().mockResolvedValue({ error: { error: { message: 'An toàn' } } });
    await expect(getSystemHealthSnapshot(clientWithGet(get))).rejects.toThrow('An toàn');
  });
});

const FIXED_NOW = new Date('2026-08-30T04:30:00.000Z');

function clientWithGet(get: ReturnType<typeof vi.fn>): SystemApiClient {
  return { GET: get } as unknown as SystemApiClient;
}

function healthSnapshot() {
  return {
    state: 'healthy' as const,
    checkedAt: FIXED_NOW.toISOString(),
    durationMs: 21,
    api: {
      state: 'healthy' as const,
      reason: 'ok' as const,
      latencyMs: 0,
      uptimeSeconds: 3600,
      version: 'dev',
    },
    database: {
      state: 'healthy' as const,
      reason: 'ok' as const,
      latencyMs: 12,
      appliedMigrationCount: 12,
      incompleteMigrationCount: 0,
    },
    storage: { state: 'healthy' as const, reason: 'ok' as const, latencyMs: 20 },
    mail: { state: 'healthy' as const, reason: 'ok' as const, latencyMs: 8 },
  };
}

function auditDto() {
  return {
    action: 'employee.disabled',
    actorType: 'SYSTEM' as const,
    createdAt: '2026-08-30T04:30:00.000Z',
    id: 'audit-1',
    resourceType: 'User',
  };
}
