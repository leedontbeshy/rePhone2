import { describe, expect, it, vi } from 'vitest';
import {
  captureGuestOrderToken,
  checkoutChangedPreview,
  customerApiError,
  orderTokenStorageKey,
  orderUrlWithoutFragment,
  readGuestOrderToken,
  removeGuestOrderToken,
  resolveGuestOrderToken,
} from './order-access.js';

describe('guest order access', () => {
  it('captures only a valid fragment token under an order-scoped key', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const token = 'A'.repeat(43);
    expect(captureGuestOrderToken('RPH-20260821-23456789', `#token=${token}`, storage)).toBe(token);
    expect(values.get(orderTokenStorageKey('RPH-20260821-23456789'))).toBe(token);
    expect(captureGuestOrderToken('RPH-20260821-23456789', '', storage)).toBe(token);
  });

  it('reads and removes only the credential for the requested order', () => {
    const values = new Map([
      [orderTokenStorageKey('RPH-1'), 'A'.repeat(43)],
      [orderTokenStorageKey('RPH-2'), 'B'.repeat(43)],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
    };
    expect(readGuestOrderToken('RPH-1', storage)).toBe('A'.repeat(43));
    removeGuestOrderToken('RPH-1', storage);
    expect(readGuestOrderToken('RPH-1', storage)).toBeUndefined();
    expect(readGuestOrderToken('RPH-2', storage)).toBe('B'.repeat(43));
  });

  it('never reads or forwards a guest credential for an authenticated session', () => {
    const storage = { getItem: vi.fn(() => 'A'.repeat(43)), setItem: vi.fn() };
    expect(
      resolveGuestOrderToken('authenticated', 'RPH-1', '#token=' + 'B'.repeat(43), storage),
    ).toBeUndefined();
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('keeps anonymous cookie access possible without a stored token and strips fragments safely', () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
    expect(resolveGuestOrderToken('anonymous', 'RPH-1', '', storage)).toBeUndefined();
    expect(orderUrlWithoutFragment('/orders/RPH-1', '?from=receipt')).toBe(
      '/orders/RPH-1?from=receipt',
    );
  });

  it('extracts the authoritative preview from a review-required error', () => {
    const current = { pricing: { grandTotal: '100000' } };
    expect(
      checkoutChangedPreview({
        error: {
          code: 'CHECKOUT_REVIEW_REQUIRED',
          details: [{ code: 'CHECKOUT_CHANGED', current }],
        },
      }),
    ).toEqual(current);
  });

  it('maps service errors to customer copy without exposing backend messages', () => {
    expect(
      customerApiError(
        {
          error: {
            code: 'ACCESS_TOKEN_INVALID',
            message: 'Access token invalid; refresh session was revoked.',
          },
        },
        'Không thể mở đơn hàng.',
      ),
    ).toBe('Liên kết này không còn dùng được. Hãy đăng nhập để tiếp tục.');

    expect(
      customerApiError(
        { error: { code: 'UNKNOWN_ERROR', message: 'Unexpected provider payload.' } },
        'Không thể mở đơn hàng.',
      ),
    ).toBe('Không thể mở đơn hàng.');
  });
});
