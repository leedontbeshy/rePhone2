import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { GuestCommerceCsrfGuard } from '../auth/guest-commerce-csrf.guard.js';
import type { GuestOrderIdentityService } from './guest-order-identity.service.js';
import { GuestOrderMutationCsrfGuard } from './guest-order-mutation-csrf.guard.js';

describe('GuestOrderMutationCsrfGuard', () => {
  it('bypasses cookie CSRF for Bearer and guest-order header identities', () => {
    const cookieCsrf = { canActivate: vi.fn(() => false) };
    const guestOrders = { readToken: vi.fn<() => string | undefined>(() => undefined) };
    const guard = new GuestOrderMutationCsrfGuard(
      cookieCsrf as unknown as GuestCommerceCsrfGuard,
      guestOrders as unknown as GuestOrderIdentityService,
    );

    expect(guard.canActivate(context(request({ userId: 'customer-1' })))).toBe(true);
    guestOrders.readToken.mockReturnValueOnce('guest-token');
    expect(guard.canActivate(context(request()))).toBe(true);
    expect(cookieCsrf.canActivate).not.toHaveBeenCalled();
  });

  it('delegates anonymous cookie-authenticated mutations to the commerce CSRF guard', () => {
    const cookieCsrf = { canActivate: vi.fn(() => true) };
    const guard = new GuestOrderMutationCsrfGuard(
      cookieCsrf as unknown as GuestCommerceCsrfGuard,
      { readToken: () => undefined } as unknown as GuestOrderIdentityService,
    );
    const executionContext = context(request());

    expect(guard.canActivate(executionContext)).toBe(true);
    expect(cookieCsrf.canActivate).toHaveBeenCalledWith(executionContext);
  });
});

function request(auth?: { userId: string }): Request {
  return {
    auth:
      auth === undefined
        ? undefined
        : { userId: auth.userId, role: 'CUSTOMER', sessionId: 'session-1' },
  } as unknown as Request;
}

function context(value: Request): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => value }),
  } as unknown as ExecutionContext;
}
