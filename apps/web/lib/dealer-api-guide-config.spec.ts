import { describe, expect, it } from 'vitest';
import { dealerApiGuideConfiguration } from './dealer-api-guide-config';

describe('dealer API guide connection configuration', () => {
  it('uses the current API without changing an internal TEST environment', () => {
    expect(
      dealerApiGuideConfiguration({
        dealerEnvironment: 'TEST',
        apiPublicUrl: 'http://localhost:4000/',
      }),
    ).toEqual({ apiBaseUrl: 'http://localhost:4000/api/v1', currentEnvironment: 'TEST' });
  });

  it('uses the current production API and adds the version prefix only once', () => {
    expect(
      dealerApiGuideConfiguration({
        dealerEnvironment: 'LIVE',
        apiPublicUrl: 'https://api.example.test/api/v1/',
        publicApiBaseUrl: 'https://other.example.test/api/v1',
      }),
    ).toEqual({ apiBaseUrl: 'https://api.example.test/api/v1', currentEnvironment: 'LIVE' });
  });

  it('falls back to an absolute public client API address', () => {
    expect(
      dealerApiGuideConfiguration({
        dealerEnvironment: 'LIVE',
        publicApiBaseUrl: 'https://api.example.test/api/v1',
      }),
    ).toEqual({ apiBaseUrl: 'https://api.example.test/api/v1', currentEnvironment: 'LIVE' });
  });

  it('does not invent a public API address from a relative URL or missing configuration', () => {
    expect(dealerApiGuideConfiguration({ publicApiBaseUrl: '/api/v1' }).apiBaseUrl).toBe('');
    expect(dealerApiGuideConfiguration({}).apiBaseUrl).toBe('');
  });

  it.each([
    'https://user:password@example.test',
    'https://api.example.test?key=private',
    'https://api.example.test#private',
    'file:///api/v1',
    'not a URL',
  ])('does not expose an invalid or secret-bearing connection address: %s', (apiPublicUrl) => {
    expect(dealerApiGuideConfiguration({ apiPublicUrl, dealerEnvironment: 'TEST' })).toEqual({
      apiBaseUrl: '',
      currentEnvironment: 'TEST',
    });
  });
});
