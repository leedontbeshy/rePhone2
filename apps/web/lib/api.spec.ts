import { describe, expect, it } from 'vitest';
import { resolveBrowserApiBaseUrl } from './api';

describe('browser API configuration', () => {
  it('uses the same-origin gateway by default', () => {
    expect(resolveBrowserApiBaseUrl(undefined)).toBe('/api/v1');
    expect(resolveBrowserApiBaseUrl('   ')).toBe('/api/v1');
  });

  it('accepts an explicit public override without a trailing slash', () => {
    expect(resolveBrowserApiBaseUrl(' https://rephone.vn/api/v1/ ')).toBe(
      'https://rephone.vn/api/v1',
    );
  });
});
