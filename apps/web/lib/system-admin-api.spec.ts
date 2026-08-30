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
  it('checks both machine endpoints outside the API prefix without cache reuse', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(healthResult(200, { status: 'ok' }, 'request-live'))
      .mockResolvedValueOnce(healthResult(200, { status: 'ok' }, 'request-ready'));

    const snapshot = await getSystemHealthSnapshot(clientWithGet(get), () => FIXED_NOW);

    expect(get).toHaveBeenNthCalledWith(1, '/health/live', { cache: 'no-store' });
    expect(get).toHaveBeenNthCalledWith(2, '/health/ready', { cache: 'no-store' });
    expect(snapshot).toEqual({
      checkedAt: FIXED_NOW.toISOString(),
      live: { state: 'healthy' },
      ready: { state: 'healthy' },
    });
    expect(JSON.stringify(snapshot)).not.toContain('request-live');
    expect(JSON.stringify(snapshot)).not.toContain('request-ready');
  });

  it('distinguishes a readiness degradation from an unreachable liveness probe', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValueOnce(healthResult(503, undefined, undefined, { status: 'error' }));

    const snapshot = await getSystemHealthSnapshot(clientWithGet(get), () => FIXED_NOW);

    expect(snapshot.live).toEqual({ state: 'unavailable' });
    expect(snapshot.ready).toEqual({ state: 'degraded' });
  });

  it('fails closed for an unexpected readiness payload', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(healthResult(200, { status: 'ok' }))
      .mockResolvedValueOnce(healthResult(200, { status: 'unexpected' }));

    const snapshot = await getSystemHealthSnapshot(clientWithGet(get), () => FIXED_NOW);

    expect(snapshot.ready).toEqual({ state: 'unavailable' });
  });
});

const FIXED_NOW = new Date('2026-08-30T04:30:00.000Z');

function clientWithGet(get: ReturnType<typeof vi.fn>): SystemApiClient {
  return { GET: get } as unknown as SystemApiClient;
}

function healthResult(status: number, data?: unknown, requestId?: string, error?: unknown) {
  const headers = new Headers();
  if (requestId !== undefined) headers.set('x-request-id', requestId);
  return {
    data,
    error,
    response: new Response(null, { headers, status }),
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
