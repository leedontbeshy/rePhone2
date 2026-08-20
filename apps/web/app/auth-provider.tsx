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
import { apiBaseUrl } from '../lib/api';

type AuthUser = components['schemas']['AuthUserDto'];
type ApiClient = ReturnType<typeof createApiClient>;
type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface LoginInput {
  email: string;
  password: string;
}

interface RegisterInput extends LoginInput {
  fullName: string;
  phone?: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  client: ApiClient;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const accessToken = useRef<string | undefined>(undefined);
  const refreshInFlight = useRef<Promise<string | undefined> | undefined>(undefined);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  const clearSession = useCallback(() => {
    accessToken.current = undefined;
    setUser(null);
    setStatus('anonymous');
  }, []);

  const acceptSession = useCallback((session: ParsedSession) => {
    accessToken.current = session.accessToken;
    setUser(session.user);
    setStatus('authenticated');
  }, []);

  const refreshAccessToken = useCallback((): Promise<string | undefined> => {
    if (refreshInFlight.current !== undefined) {
      return refreshInFlight.current;
    }

    const pending = fetch(`${apiBaseUrl.replace(/\/$/, '')}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Rephone-CSRF': '1',
      },
      body: '{}',
    })
      .then(async (response) => {
        if (!response.ok) {
          clearSession();
          return undefined;
        }
        const parsed = parseSessionResponse(await response.json());
        if (parsed === undefined) {
          clearSession();
          return undefined;
        }
        acceptSession(parsed);
        return parsed.accessToken;
      })
      .catch(() => {
        clearSession();
        return undefined;
      })
      .finally(() => {
        if (refreshInFlight.current === pending) {
          refreshInFlight.current = undefined;
        }
      });

    refreshInFlight.current = pending;
    return pending;
  }, [acceptSession, clearSession]);

  const client = useMemo(
    () =>
      createApiClient({
        baseUrl: apiBaseUrl,
        getAccessToken: () => accessToken.current,
        refreshAccessToken,
        onUnauthorized: clearSession,
      }),
    [clearSession, refreshAccessToken],
  );

  useEffect(() => {
    void refreshAccessToken();
  }, [refreshAccessToken]);

  const login = useCallback(
    async (input: LoginInput) => {
      const result = await client.POST('/api/v1/auth/login', { body: input });
      if (result.data === undefined) {
        throw new Error('Email hoặc mật khẩu không đúng.');
      }
      acceptSession(result.data.data);
    },
    [acceptSession, client],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const result = await client.POST('/api/v1/auth/register', { body: input });
      if (result.data === undefined) {
        throw new Error('Không thể tạo tài khoản. Vui lòng kiểm tra lại thông tin.');
      }
    },
    [client],
  );

  const logout = useCallback(async () => {
    try {
      await fetch(`${apiBaseUrl.replace(/\/$/, '')}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Rephone-CSRF': '1',
        },
        body: '{}',
      });
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, client, login, register, logout }),
    [client, login, logout, register, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}

interface ParsedSession {
  accessToken: string;
  user: AuthUser;
}

function parseSessionResponse(value: unknown): ParsedSession | undefined {
  if (!isRecord(value) || !isRecord(value['data'])) {
    return undefined;
  }
  const data = value['data'];
  if (typeof data['accessToken'] !== 'string' || !isAuthUser(data['user'])) {
    return undefined;
  }
  return { accessToken: data['accessToken'], user: data['user'] };
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value['id'] === 'string' &&
    typeof value['email'] === 'string' &&
    ['ADMIN', 'EMPLOYEE', 'CUSTOMER'].includes(String(value['role'])) &&
    ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DISABLED'].includes(String(value['status'])) &&
    typeof value['fullName'] === 'string' &&
    (typeof value['phone'] === 'string' || value['phone'] === null)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
