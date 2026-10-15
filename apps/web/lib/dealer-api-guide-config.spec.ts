import { describe, expect, it } from 'vitest';
import { dealerApiGuideConfiguration, dealerApiGuidePortalUrl } from './dealer-api-guide-config';

describe('dealer API guide connection configuration', () => {
  it('uses the current TEST API when no separate sandbox address is configured', () => {
    expect(
      dealerApiGuideConfiguration({
        dealerEnvironment: 'TEST',
        apiPublicUrl: 'http://localhost:4000/',
      }),
    ).toMatchObject({
      liveApiUrl: '',
      sandboxApiUrl: 'http://localhost:4000/api/v1',
      initialEnvironment: 'TEST',
    });
  });

  it('keeps Live and Sandbox addresses separate and does not duplicate the API prefix', () => {
    expect(
      dealerApiGuideConfiguration({
        dealerEnvironment: 'LIVE',
        apiPublicUrl: 'https://api.example.test/api/v1/',
        sandboxApiUrl: 'https://sandbox.example.test/api/v1/',
        sandboxWebUrl: 'https://sandbox-web.example.test/',
      }),
    ).toEqual({
      liveApiUrl: 'https://api.example.test/api/v1',
      sandboxApiUrl: 'https://sandbox.example.test/api/v1',
      sandboxWebUrl: 'https://sandbox-web.example.test',
      currentEnvironment: 'LIVE',
      initialEnvironment: 'TEST',
    });
  });

  it('selects Live when it is the only configured environment', () => {
    expect(
      dealerApiGuideConfiguration({
        dealerEnvironment: 'LIVE',
        publicApiBaseUrl: 'https://api.example.test/api/v1',
      }),
    ).toMatchObject({
      liveApiUrl: 'https://api.example.test/api/v1',
      sandboxApiUrl: '',
      initialEnvironment: 'LIVE',
    });
  });

  it('keeps a TEST site on its current API instead of another configured sandbox instance', () => {
    expect(
      dealerApiGuideConfiguration({
        dealerEnvironment: 'TEST',
        apiPublicUrl: 'https://current-test.example.test',
        sandboxApiUrl: 'https://other-test.example.test/api/v1',
      }),
    ).toMatchObject({ sandboxApiUrl: 'https://current-test.example.test/api/v1' });
  });

  it('directs API-key creation to the portal of the selected environment', () => {
    expect(dealerApiGuidePortalUrl('LIVE', 'TEST', 'https://sandbox.example.test/')).toBe(
      'https://sandbox.example.test/dealer',
    );
    expect(dealerApiGuidePortalUrl('LIVE', 'LIVE', 'https://sandbox.example.test')).toBe('/dealer');
    expect(dealerApiGuidePortalUrl('TEST', 'TEST', '')).toBe('/dealer');
    expect(dealerApiGuidePortalUrl('LIVE', 'TEST', '')).toBe('');
    expect(dealerApiGuidePortalUrl('TEST', 'LIVE', '')).toBe('');
  });

  it('does not present relative URLs or embedded credentials as customer connection addresses', () => {
    expect(
      dealerApiGuideConfiguration({
        dealerEnvironment: 'TEST',
        apiPublicUrl: 'https://user:password@example.test',
        publicApiBaseUrl: '/api/v1',
        sandboxApiUrl: 'https://sandbox.example.test?key=private',
      }),
    ).toMatchObject({ liveApiUrl: '', sandboxApiUrl: '' });
  });
});
