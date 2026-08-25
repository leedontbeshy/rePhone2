import { describe, expect, it, vi } from 'vitest';
import { consumeFragmentToken } from './one-time-auth';

describe('consumeFragmentToken', () => {
  it('returns a valid token and always clears the URL fragment', () => {
    const clear = vi.fn();
    expect(consumeFragmentToken(`#token=${'a'.repeat(43)}`, clear)).toBe('a'.repeat(43));
    expect(clear).toHaveBeenCalledOnce();
  });

  it('rejects missing or malformed tokens after clearing the fragment', () => {
    const clear = vi.fn();
    expect(consumeFragmentToken('#token=short', clear)).toBeUndefined();
    expect(clear).toHaveBeenCalledOnce();
  });
});
