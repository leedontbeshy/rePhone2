import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../common/errors/api-error.js';
import { BackofficeRateLimiter } from './backoffice-rate-limiter.service.js';
import { RolesGuard } from './roles.guard.js';

describe('backoffice security foundations', () => {
  it('allows configured staff roles and rejects customers', () => {
    const reflector = { getAllAndOverride: () => ['ADMIN', 'EMPLOYEE'] };
    const guard = new RolesGuard(reflector as never);

    expect(guard.canActivate(contextWithRole('EMPLOYEE'))).toBe(true);
    expect(() => guard.canActivate(contextWithRole('CUSTOMER'))).toThrow(ApiError);
    try {
      guard.canActivate(contextWithRole('CUSTOMER'));
    } catch (error) {
      expect(error).toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('enforces independent mutation and upload actor windows', () => {
    const limiter = new BackofficeRateLimiter();
    for (let index = 0; index < 20; index += 1) {
      limiter.consume('employee-1', 'upload');
    }
    expect(() => {
      limiter.consume('employee-1', 'upload');
    }).toThrow(ApiError);
    expect(() => {
      limiter.consume('employee-2', 'upload');
    }).not.toThrow();
    expect(() => {
      limiter.consume('employee-1', 'mutation');
    }).not.toThrow();
  });
});

function contextWithRole(role: 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER'): ExecutionContext {
  return {
    getHandler: () => contextWithRole,
    getClass: () => RolesGuard,
    switchToHttp: () => ({
      getRequest: () => ({ auth: { userId: 'user-1', role, sessionId: 'session-1' } }),
    }),
  } as unknown as ExecutionContext;
}
