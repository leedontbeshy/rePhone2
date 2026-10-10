import { afterEach, describe, expect, it, vi } from 'vitest';
import { startReferralNavigation } from './referral-navigation';
import { referralDestination } from './affiliate-api';

afterEach(() => {
  vi.useRealTimers();
});
describe('direct referral navigation', () => {
  it('preserves the exact inventory unit destination', () => {
    expect(referralDestination('/products/iphone-13/units/IP13-MID-001')).toBe(
      '/products/iphone-13/units/IP13-MID-001',
    );
  });
  it('waits for attribution before opening the product, with no second redirect', async () => {
    vi.useFakeTimers();
    let resolve!: () => void;
    const captured = new Promise<void>((done) => {
      resolve = done;
    });
    const navigate = vi.fn();
    startReferralNavigation(captured, navigate);
    expect(navigate).not.toHaveBeenCalled();
    resolve();
    await captured;
    expect(navigate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
  it('opens the product even if attribution fails', async () => {
    const navigate = vi.fn();
    startReferralNavigation(Promise.reject(new Error('unavailable')), navigate);
    await Promise.resolve();
    expect(navigate).toHaveBeenCalledOnce();
  });
  it('limits waiting and ignores a late response after navigating', async () => {
    vi.useFakeTimers();
    let resolve!: () => void;
    const captured = new Promise<void>((done) => {
      resolve = done;
    });
    const navigate = vi.fn();
    startReferralNavigation(captured, navigate);
    await vi.advanceTimersByTimeAsync(3000);
    expect(navigate).toHaveBeenCalledOnce();
    resolve();
    await captured;
    expect(navigate).toHaveBeenCalledOnce();
  });
  it('does not hijack navigation after the visitor leaves or the effect is replaced', async () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    const cancel = startReferralNavigation(Promise.resolve(), navigate);
    cancel();
    await vi.advanceTimersByTimeAsync(5000);
    expect(navigate).not.toHaveBeenCalled();
  });
});
