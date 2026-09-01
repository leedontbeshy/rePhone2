'use client';

import { createApiClient, type components } from '@rephone/api-client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { browserApiBaseUrl } from '../lib/api';

export type AuthUser = components['schemas']['AuthUserDto'];
export type AuthRole = AuthUser['role'];
export type AccountStatus = AuthUser['status'];
export type AuthAccountProfile = Pick<
  components['schemas']['AccountDto'],
  'id' | 'fullName' | 'phone'
>;
type ApiClient = ReturnType<typeof createApiClient>;
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  fullName: string;
  phone?: string;
}

export interface AuthErrorDetail {
  code: string;
  field?: string;
  message: string;
}

export type AuthErrorCode =
  components['schemas']['ApiErrorBodyDto']['code'] | 'INVALID_RESPONSE' | 'NETWORK_ERROR';

export class AuthActionError extends Error {
  public readonly code: AuthErrorCode;
  public readonly details: readonly AuthErrorDetail[];
  public readonly requestId: string | undefined;
  public readonly status: number | undefined;

  public constructor(
    code: AuthErrorCode,
    message: string,
    options: {
      details?: readonly AuthErrorDetail[];
      requestId?: string;
      status?: number;
    } = {},
  ) {
    super(message);
    this.name = 'AuthActionError';
    this.code = code;
    this.details = options.details ?? [];
    this.requestId = options.requestId;
    this.status = options.status;
  }
}

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  role: AuthRole | null;
  accountStatus: AccountStatus | null;
  sessionCheckFailed: boolean;
  client: ApiClient;
  logoutPending: boolean;
  login: (input: LoginInput) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  retrySessionCheck: () => Promise<void>;
  syncAccountProfile: (profile: AuthAccountProfile) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthViewState {
  status: AuthStatus;
  user: AuthUser | null;
}

export interface ParsedSession {
  accessToken: string;
  user: AuthUser;
}

interface GuardedSessionResult {
  accessToken: string | undefined;
  applied: boolean;
}

export interface MemoryAuthSession {
  accept: (session: ParsedSession) => void;
  acceptIfCurrent: (revision: number, session: ParsedSession) => GuardedSessionResult;
  captureRevision: () => number;
  clear: () => void;
  clearIfCurrent: (revision: number) => GuardedSessionResult;
  getAccessToken: () => string | undefined;
  getUser: () => AuthUser | null;
  syncAccountProfile: (profile: AuthAccountProfile) => AuthUser | null;
}

/**
 * Keeps the bearer credential in a closure only. It intentionally has no persistence adapter.
 * The revision guards prevent an older refresh request from restoring a session after login/logout.
 */
export function createMemoryAuthSession(): MemoryAuthSession {
  let accessToken: string | undefined;
  let user: AuthUser | null = null;
  let revision = 0;

  const accept = (session: ParsedSession) => {
    revision += 1;
    accessToken = session.accessToken;
    user = session.user;
  };

  const clear = () => {
    revision += 1;
    accessToken = undefined;
    user = null;
  };

  return {
    accept,
    acceptIfCurrent(expectedRevision, session) {
      if (revision !== expectedRevision) return { accessToken, applied: false };
      accept(session);
      return { accessToken, applied: true };
    },
    captureRevision: () => revision,
    clear,
    clearIfCurrent(expectedRevision) {
      if (revision !== expectedRevision) return { accessToken, applied: false };
      clear();
      return { accessToken, applied: true };
    },
    getAccessToken: () => accessToken,
    getUser: () => user,
    syncAccountProfile(profile) {
      if (user === null || user.id !== profile.id) return null;
      revision += 1;
      user = {
        ...user,
        fullName: profile.fullName,
        ...(profile.phone === undefined ? {} : { phone: profile.phone }),
      };
      return user;
    },
  };
}

export function createSingleFlight<TKey, TValue>(
  work: (key: TKey) => Promise<TValue>,
): (key: TKey) => Promise<TValue> {
  let inFlight: { key: TKey; promise: Promise<TValue> } | undefined;
  const queue: Array<{
    key: TKey;
    promise: Promise<TValue>;
    reject: (reason?: unknown) => void;
    resolve: (value: TValue | PromiseLike<TValue>) => void;
  }> = [];

  const runNext = () => {
    if (inFlight !== undefined) return;
    const next = queue.shift();
    if (next === undefined) return;

    inFlight = { key: next.key, promise: next.promise };
    let pending: Promise<TValue>;
    try {
      pending = Promise.resolve(work(next.key));
    } catch (caught) {
      pending = Promise.reject(
        caught instanceof Error ? caught : new Error('Refresh work failed unexpectedly.'),
      );
    }
    void pending
      .then(next.resolve, next.reject)
      .finally(() => {
        if (inFlight?.promise === next.promise) inFlight = undefined;
        runNext();
      });
  };

  return (key) => {
    if (inFlight !== undefined && Object.is(inFlight.key, key)) return inFlight.promise;
    const queued = queue.find((entry) => Object.is(entry.key, key));
    if (queued !== undefined) return queued.promise;

    let resolve!: (value: TValue | PromiseLike<TValue>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<TValue>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    queue.push({ key, promise, reject, resolve });
    runNext();
    return promise;
  };
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const memoryRef = useRef<MemoryAuthSession | null>(null);
  if (memoryRef.current === null) memoryRef.current = createMemoryAuthSession();
  const memory = memoryRef.current;

  const logoutInFlight = useRef<Promise<void> | undefined>(undefined);
  const [authState, setAuthState] = useState<AuthViewState>({ status: 'loading', user: null });
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);

  const syncAuthenticatedSession = useCallback(
    (session: ParsedSession) => {
      memory.accept(session);
      setSessionCheckFailed(false);
      setAuthState({ status: 'authenticated', user: session.user });
    },
    [memory],
  );

  const clearSession = useCallback(() => {
    memory.clear();
    setSessionCheckFailed(false);
    setAuthState({ status: 'anonymous', user: null });
  }, [memory]);

  const refreshWork = useCallback(
    async (expectedAccessToken?: string): Promise<string | undefined> => {
      if (memory.getAccessToken() !== expectedAccessToken) return undefined;
      const expectedRevision = memory.captureRevision();
      try {
        const session = await requestCookieAuthSession('refresh');
        const result = memory.acceptIfCurrent(expectedRevision, session);
        if (result.applied) {
          setSessionCheckFailed(false);
          setAuthState({ status: 'authenticated', user: session.user });
        }
        return result.applied ? result.accessToken : undefined;
      } catch (caught) {
        const result = memory.clearIfCurrent(expectedRevision);
        if (result.applied) {
          setSessionCheckFailed(isSessionCheckFailure(caught));
          setAuthState({ status: 'anonymous', user: null });
        }
        return undefined;
      }
    },
    [memory],
  );

  const refreshAccessToken = useMemo(() => createSingleFlight(refreshWork), [refreshWork]);

  const retrySessionCheck = useCallback(async () => {
    setSessionCheckFailed(false);
    setAuthState({ status: 'loading', user: null });
    await refreshAccessToken(memory.getAccessToken());
  }, [memory, refreshAccessToken]);

  const client = useMemo(
    () =>
      createApiClient({
        baseUrl: browserApiBaseUrl,
        getAccessToken: memory.getAccessToken,
        refreshAccessToken,
        onUnauthorized: clearSession,
      }),
    [clearSession, memory, refreshAccessToken],
  );

  useEffect(() => {
    void refreshAccessToken(undefined);
  }, [refreshAccessToken]);

  const login = useCallback(
    async (input: LoginInput) => {
      try {
        if (logoutInFlight.current !== undefined) await logoutInFlight.current;
        const result = await client.POST('/api/v1/auth/login', { body: input });
        if (result.data === undefined) {
          throw authErrorFromResponse(result.error, result.response.status, 'Không thể đăng nhập.');
        }
        const session = parseSessionResponse(result.data);
        if (session === undefined) {
          throw new AuthActionError('INVALID_RESPONSE', 'Phản hồi đăng nhập không hợp lệ.', {
            status: result.response.status,
          });
        }
        syncAuthenticatedSession(session);
        return session.user;
      } catch (caught) {
        throw toAuthActionError(caught, 'Không thể kết nối để đăng nhập.');
      }
    },
    [client, syncAuthenticatedSession],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      try {
        const result = await client.POST('/api/v1/auth/register', { body: input });
        if (result.data === undefined) {
          throw authErrorFromResponse(
            result.error,
            result.response.status,
            'Không thể tạo tài khoản.',
          );
        }
        // Registration deliberately does not create or accept an authenticated session.
      } catch (caught) {
        throw toAuthActionError(caught, 'Không thể kết nối để tạo tài khoản.');
      }
    },
    [client],
  );

  const logout = useCallback((): Promise<void> => {
    if (logoutInFlight.current !== undefined) return logoutInFlight.current;

    setLogoutPending(true);
    clearSession();
    const pending = requestCookieAuthEndpoint('logout')
      .then(() => undefined)
      .finally(() => {
        if (logoutInFlight.current === pending) logoutInFlight.current = undefined;
        setLogoutPending(false);
      });
    logoutInFlight.current = pending;
    return pending;
  }, [clearSession]);

  const syncAccountProfile = useCallback(
    (profile: AuthAccountProfile) => {
      const nextUser = memory.syncAccountProfile(profile);
      if (nextUser !== null) setAuthState({ status: 'authenticated', user: nextUser });
    },
    [memory],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status: authState.status,
      user: authState.user,
      role: authState.user?.role ?? null,
      accountStatus: authState.user?.status ?? null,
      sessionCheckFailed,
      client,
      logoutPending,
      login,
      register,
      logout,
      retrySessionCheck,
      syncAccountProfile,
    }),
    [
      authState,
      client,
      login,
      logout,
      logoutPending,
      register,
      retrySessionCheck,
      sessionCheckFailed,
      syncAccountProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

export async function requestCookieAuthSession(
  endpoint: 'refresh',
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<ParsedSession> {
  const value = await requestCookieAuthEndpoint(endpoint, fetcher);
  const session = parseSessionResponse(value);
  if (session === undefined) {
    throw new AuthActionError('INVALID_RESPONSE', 'Phản hồi phiên đăng nhập không hợp lệ.');
  }
  return session;
}

export async function requestCookieAuthEndpoint(
  endpoint: 'logout' | 'refresh',
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(`${browserApiBaseUrl}/auth/${endpoint}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Rephone-CSRF': '1',
      },
      body: '{}',
    });
  } catch (caught) {
    throw toAuthActionError(caught, 'Không thể kết nối tới phiên đăng nhập.');
  }

  const body = response.status === 204 ? undefined : await readJsonSafely(response);
  if (!response.ok) {
    throw authErrorFromResponse(body, response.status, 'Không thể cập nhật phiên đăng nhập.');
  }
  return body;
}

export function parseSessionResponse(value: unknown): ParsedSession | undefined {
  if (!isRecord(value) || !isRecord(value['data'])) return undefined;
  const data = value['data'];
  if (typeof data['accessToken'] !== 'string' || !isAuthUser(data['user'])) return undefined;
  return { accessToken: data['accessToken'], user: data['user'] };
}

export function isSessionCheckFailure(caught: unknown): boolean {
  if (!(caught instanceof AuthActionError)) return true;
  return !['AUTH_REQUIRED', 'ACCESS_TOKEN_INVALID', 'SESSION_REVOKED'].includes(caught.code);
}

export function authErrorFromResponse(
  value: unknown,
  status: number | undefined,
  fallback: string,
): AuthActionError {
  if (!isRecord(value) || !isRecord(value['error'])) {
    return new AuthActionError('INVALID_RESPONSE', fallback, {
      ...(status === undefined ? {} : { status }),
    });
  }

  const error = value['error'];
  const code = typeof error['code'] === 'string' ? error['code'] : 'INVALID_RESPONSE';
  const details = Array.isArray(error['details'])
    ? error['details'].flatMap((detail): AuthErrorDetail[] => {
        if (!isRecord(detail) || typeof detail['message'] !== 'string') return [];
        return [
          {
            code: typeof detail['code'] === 'string' ? detail['code'] : 'INVALID',
            message: detail['message'],
            ...(typeof detail['field'] === 'string' ? { field: detail['field'] } : {}),
          },
        ];
      })
    : [];

  return new AuthActionError(
    code as AuthErrorCode,
    typeof error['message'] === 'string' ? error['message'] : fallback,
    {
      details,
      ...(typeof error['requestId'] === 'string' ? { requestId: error['requestId'] } : {}),
      ...(status === undefined ? {} : { status }),
    },
  );
}

export function toAuthActionError(caught: unknown, message: string): AuthActionError {
  if (caught instanceof AuthActionError) return caught;
  return new AuthActionError('NETWORK_ERROR', message);
}

async function readJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['email'] === 'string' &&
    ['ADMIN', 'EMPLOYEE', 'CUSTOMER'].includes(String(value['role'])) &&
    ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DISABLED'].includes(String(value['status'])) &&
    typeof value['fullName'] === 'string' &&
    (typeof value['phone'] === 'string' || value['phone'] === null || value['phone'] === undefined)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
