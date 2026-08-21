import { describe, expect, it } from 'vitest';
import {
  captureGuestOrderToken,
  checkoutChangedPreview,
  orderTokenStorageKey,
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
});
