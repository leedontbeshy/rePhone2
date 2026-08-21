import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../common/errors/api-error.js';
import { loadConfig } from '../../config/app-config.js';
import { GuestCartIdentityService } from './guest-cart-identity.service.js';
import { GuestCommerceCsrfGuard } from './guest-commerce-csrf.guard.js';
import { OptionalSessionGuard } from './optional-session.guard.js';

const config = loadConfig({
  NODE_ENV: 'test',
  API_PORT: '4001',
  API_PUBLIC_URL: 'http://localhost:4001',
  WEB_PUBLIC_URL: 'http://localhost:3001',
  WEB_ORIGIN: 'http://localhost:3001',
  DATABASE_URL: 'postgresql://rephone:rephone@localhost:5433/rephone_test',
  DIRECT_URL: 'postgresql://rephone:rephone@localhost:5433/rephone_test',
  JWT_ACCESS_SECRET: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
  ARGON2_MEMORY_KIB: '8192',
  ARGON2_TIME_COST: '1',
  ARGON2_PARALLELISM: '1',
  IDENTIFIER_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  IDENTIFIER_HMAC_KEY: 'YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk=',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  SUPABASE_PUBLIC_BUCKET: 'public-test',
  SUPABASE_PRIVATE_BUCKET: 'private-test',
  SUPABASE_STORE_BUCKET: 'store-test',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_SECURE: 'false',
  MAIL_FROM: 'rePhone Test <no-reply@rephone.local>',
});

describe('guest commerce security foundations', () => {
  it('creates opaque tokens, stores deterministic digests and configures an HttpOnly cookie', () => {
    const identity = new GuestCartIdentityService(config);
    const token = identity.createToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(identity.digestToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(identity.cookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/api/v1',
      maxAge: 30 * 24 * 60 * 60 * 1_000,
    });
  });

  it('allows missing Bearer but still delegates malformed Bearer to the resolver', async () => {
    const calls: Array<{ required: boolean }> = [];
    const guard = new OptionalSessionGuard({
      resolve: async (_request: Request, required: boolean) => {
        calls.push({ required });
        return undefined;
      },
    } as never);

    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
    expect(calls).toEqual([{ required: false }]);
  });

  it('requires CSRF proof only for guest JSON mutations', () => {
    const guard = new GuestCommerceCsrfGuard(config);

    expect(() => guard.canActivate(contextFor({ auth: customerAuth }))).not.toThrow();
    expect(() =>
      guard.canActivate(
        contextFor({
          headers: {
            origin: 'http://localhost:3001',
            'x-rephone-csrf': '1',
            'content-type': 'application/json; charset=utf-8',
          },
        }),
      ),
    ).not.toThrow();
    expect(() => guard.canActivate(contextFor({ headers: {} }))).toThrow(ApiError);
  });
});

const customerAuth = { userId: 'customer-1', role: 'CUSTOMER', sessionId: 'session-1' } as const;

function contextFor({
  auth,
  headers = {},
}: {
  auth?: typeof customerAuth;
  headers?: Record<string, string>;
}): ExecutionContext {
  const request = {
    auth,
    get: (name: string) => headers[name.toLowerCase()],
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
