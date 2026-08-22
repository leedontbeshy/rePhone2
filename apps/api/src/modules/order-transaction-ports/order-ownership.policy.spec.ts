import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../common/errors/api-error.js';
import type { GuestCartIdentityService } from '../auth/guest-cart-identity.service.js';
import { GuestOrderIdentityService } from './guest-order-identity.service.js';
import { OrderOwnershipPolicy, type OrderOwnershipRecord } from './order-ownership.policy.js';

const guestOrders = new GuestOrderIdentityService();
const guestCarts = {
  readToken: (request: Request) => {
    const token = (request.cookies as Record<string, unknown> | undefined)?.rephone_guest_cart;
    return typeof token === 'string' ? token : undefined;
  },
  digestToken: (token: string) => createHash('sha256').update(token, 'utf8').digest('hex'),
} as unknown as GuestCartIdentityService;
const policy = new OrderOwnershipPolicy(guestOrders, guestCarts);

describe('OrderOwnershipPolicy', () => {
  it('allows only the customer that owns the order', () => {
    const order = record({ customerId: 'customer-1' });
    expect(() => {
      policy.assertAccess(request({ userId: 'customer-1', role: 'CUSTOMER' }), order);
    }).not.toThrow();
    expectApiError(() => {
      policy.assertAccess(request({ userId: 'customer-2', role: 'CUSTOMER' }), order);
    }, 'ORDER_NOT_FOUND');
  });

  it('rejects staff instead of falling back to guest credentials', () => {
    expectApiError(() => {
      policy.assertAccess(
        request({ userId: 'employee-1', role: 'EMPLOYEE' }),
        record({ customerId: 'employee-1' }),
      );
    }, 'FORBIDDEN');
  });

  it('allows a matching raw guest-order token', () => {
    const token = guestOrders.createToken();
    const order = record({ guestAccessTokenHash: guestOrders.digestToken(token) });
    expect(() => {
      policy.assertAccess(request(undefined, token), order);
    }).not.toThrow();
  });

  it('allows only a non-expired converted guest-cart cookie', () => {
    const token = guestOrders.createToken();
    const now = new Date('2026-08-22T12:00:00.000Z');
    const order = record({
      sourceCart: {
        status: 'CONVERTED',
        guestTokenHash: guestCarts.digestToken(token),
        expiresAt: new Date('2026-08-22T12:01:00.000Z'),
      },
    });
    expect(() => {
      policy.assertAccess(request(undefined, undefined, token), order, now);
    }).not.toThrow();
    expectApiError(() => {
      policy.assertAccess(
        request(undefined, undefined, token),
        order,
        new Date('2026-08-22T12:01:00.000Z'),
      );
    }, 'ORDER_NOT_FOUND');
  });
});

function record(overrides: Partial<OrderOwnershipRecord>): OrderOwnershipRecord {
  return {
    customerId: null,
    guestAccessTokenHash: null,
    sourceCart: { status: 'CONVERTED', guestTokenHash: null, expiresAt: null },
    ...overrides,
  };
}

function request(
  auth?: { userId: string; role: 'CUSTOMER' | 'EMPLOYEE'; sessionId?: string },
  orderToken?: string,
  cartToken?: string,
): Request {
  return {
    auth:
      auth === undefined
        ? undefined
        : { userId: auth.userId, role: auth.role, sessionId: auth.sessionId ?? 'session-1' },
    cookies: cartToken === undefined ? {} : { rephone_guest_cart: cartToken },
    get: (name: string) => (name.toLowerCase() === 'x-guest-order-token' ? orderToken : undefined),
  } as unknown as Request;
}

function expectApiError(action: () => void, code: ApiError['code']): void {
  try {
    action();
    throw new Error('Expected ApiError');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(code);
  }
}
