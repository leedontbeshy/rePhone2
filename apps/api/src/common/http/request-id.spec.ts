import { describe, expect, it } from 'vitest';
import { isValidRequestId } from './request-id.js';

describe('isValidRequestId', () => {
  it('accepts UUID and ULID correlation IDs', () => {
    expect(isValidRequestId('0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e1')).toBe(true);
    expect(isValidRequestId('01K33Y8ZZZ9YV3JYH6K9XW4T6Q')).toBe(true);
  });

  it('rejects arbitrary or oversized values', () => {
    expect(isValidRequestId('not-a-request-id')).toBe(false);
    expect(isValidRequestId('x'.repeat(65))).toBe(false);
  });
});
