import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('web health route', () => {
  it('returns an uncached successful response without checking downstream services', () => {
    const response = GET();

    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
