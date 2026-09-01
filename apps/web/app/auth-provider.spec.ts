import { describe, expect, it, vi } from 'vitest';
import {
  AuthActionError,
  authErrorFromResponse,
  createMemoryAuthSession,
  createSingleFlight,
  isSessionCheckFailure,
  parseSessionResponse,
  requestCookieAuthSession,
  type AuthUser,
  type ParsedSession,
} from './auth-provider';

const customer: AuthUser = {
  id: '0198d5df-6ea4-7eb7-a321-60abcf89e511',
  email: 'customer@example.com',
  fullName: 'Nguyễn Văn An',
  phone: null,
  role: 'CUSTOMER',
  status: 'ACTIVE',
};

function session(accessToken = 'access-1', user = customer): ParsedSession {
  return { accessToken, user };
}

describe('AuthProvider foundations', () => {
  it('keeps the access token in the memory session and clears it without a persistence adapter', () => {
    const memory = createMemoryAuthSession();
    memory.accept(session());

    expect(memory.getAccessToken()).toBe('access-1');
    expect(memory.getUser()).toEqual(customer);

    memory.clear();
    expect(memory.getAccessToken()).toBeUndefined();
    expect(memory.getUser()).toBeNull();
  });

  it('syncs authoritative account identity fields only for the active user', () => {
    const memory = createMemoryAuthSession();
    memory.accept(session());

    expect(
      memory.syncAccountProfile({ id: customer.id, fullName: 'Tên mới', phone: '0909000000' }),
    ).toMatchObject({ fullName: 'Tên mới', phone: '0909000000' });
    expect(
      memory.syncAccountProfile({
        id: '0198d5df-6ea4-7eb7-a321-60abcf89e599',
        fullName: 'Sai user',
        phone: null,
      }),
    ).toBeNull();
    expect(memory.getUser()).toMatchObject({ fullName: 'Tên mới', phone: '0909000000' });
  });

  it('does not let a stale refresh overwrite an authoritative profile update', () => {
    const memory = createMemoryAuthSession();
    memory.accept(session());
    const revisionBeforeProfileUpdate = memory.captureRevision();

    memory.syncAccountProfile({ id: customer.id, fullName: 'Tên mới', phone: '0909000000' });

    expect(
      memory.acceptIfCurrent(
        revisionBeforeProfileUpdate,
        session('stale-refresh', { ...customer, fullName: 'Tên cũ' }),
      ),
    ).toEqual({ accessToken: 'access-1', applied: false });
    expect(memory.getUser()).toMatchObject({ fullName: 'Tên mới', phone: '0909000000' });
  });

  it('does not let a stale refresh overwrite a later login or restore a logged-out session', () => {
    const memory = createMemoryAuthSession();
    const initialRevision = memory.captureRevision();

    memory.accept(session('login-token'));
    expect(memory.acceptIfCurrent(initialRevision, session('stale-refresh'))).toEqual({
      accessToken: 'login-token',
      applied: false,
    });

    const loggedInRevision = memory.captureRevision();
    memory.clear();
    expect(memory.acceptIfCurrent(loggedInRevision, session('late-refresh'))).toEqual({
      accessToken: undefined,
      applied: false,
    });
  });

  it('deduplicates the active key and queues a new key until the current refresh settles', async () => {
    const releases: Array<(value: string) => void> = [];
    const work = vi.fn(
      (key: string) =>
        new Promise<string>((resolve) => {
          releases.push((value) => {
            resolve(key + ':' + value);
          });
        }),
    );
    const refresh = createSingleFlight<string, string>(work);

    const first = refresh('session-a');
    const second = refresh('session-a');
    const next = refresh('session-b');
    const nextDuplicate = refresh('session-b');
    expect(first).toBe(second);
    expect(next).toBe(nextDuplicate);
    expect(work).toHaveBeenCalledOnce();

    releases[0]?.('access-1');
    await expect(first).resolves.toBe('session-a:access-1');
    expect(work).toHaveBeenCalledTimes(2);
    expect(work).toHaveBeenLastCalledWith('session-b');

    releases[1]?.('access-2');
    await expect(next).resolves.toBe('session-b:access-2');
  });

  it('continues the refresh queue after a rejected or synchronously thrown job', async () => {
    const failure = new Error('refresh failed');
    const work = vi
      .fn<(key: string) => Promise<string>>()
      .mockRejectedValueOnce(failure)
      .mockImplementationOnce(() => {
        throw failure;
      })
      .mockResolvedValueOnce('access-c');
    const refresh = createSingleFlight<string, string>(work);

    const first = refresh('session-a');
    const second = refresh('session-b');
    const third = refresh('session-c');

    await expect(first).rejects.toBe(failure);
    await expect(second).rejects.toBe(failure);
    await expect(third).resolves.toBe('access-c');
    expect(work.mock.calls.map(([key]) => key)).toEqual(['session-a', 'session-b', 'session-c']);
  });

  it('sends refresh with the HttpOnly-cookie transport proof and parses the session', async () => {
    const fetcher = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { ...session(), expiresIn: 900 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(requestCookieAuthSession('refresh', fetcher)).resolves.toEqual(session());
    expect(fetcher).toHaveBeenCalledOnce();
    const [, init] = fetcher.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', body: '{}' });
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Rephone-CSRF')).toBe('1');
  });

  it('preserves stable API error semantics and field details', () => {
    const error = authErrorFromResponse(
      {
        error: {
          code: 'DUPLICATE_RESOURCE',
          message: 'Resource already exists',
          requestId: 'request-1',
          details: [{ field: 'email', code: 'UNIQUE', message: 'duplicate' }],
        },
      },
      409,
      'fallback',
    );

    expect(error).toBeInstanceOf(AuthActionError);
    expect(error).toMatchObject({
      code: 'DUPLICATE_RESOURCE',
      status: 409,
      requestId: 'request-1',
      details: [{ field: 'email', code: 'UNIQUE', message: 'duplicate' }],
    });
  });

  it('rejects malformed session payloads instead of accepting an untrusted bearer value', () => {
    expect(
      parseSessionResponse({ data: { accessToken: 'token', user: { role: 'CUSTOMER' } } }),
    ).toBe(undefined);
  });

  it('distinguishes an absent session from a failed session check', () => {
    expect(
      isSessionCheckFailure(new AuthActionError('AUTH_REQUIRED', 'anonymous', { status: 401 })),
    ).toBe(false);
    expect(
      isSessionCheckFailure(new AuthActionError('SESSION_REVOKED', 'revoked', { status: 401 })),
    ).toBe(false);
    expect(isSessionCheckFailure(new AuthActionError('NETWORK_ERROR', 'offline'))).toBe(true);
    expect(
      isSessionCheckFailure(new AuthActionError('SERVICE_UNAVAILABLE', 'offline', { status: 503 })),
    ).toBe(true);
    expect(isSessionCheckFailure(new Error('unexpected'))).toBe(true);
  });
});
