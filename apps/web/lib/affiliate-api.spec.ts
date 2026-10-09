import { describe, expect, it } from 'vitest';
import { referralDestination } from './affiliate-api';
describe('Referral destinations', () => {
  it('allows only internal product and storefront routes', () => {
    expect(referralDestination('/products/iphone-13')).toBe('/products/iphone-13');
    for (const url of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/backoffice',
      '/products/x?to=https://evil.example',
      '/products/%2e%2e/admin',
      null,
    ])
      expect(referralDestination(url)).toBe('/products');
  });
});
