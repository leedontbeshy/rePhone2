import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../config/app-config.js';
import { createLoggerParams } from './logger.config.js';

function loggerTestConfig() {
  return loadConfig({
    NODE_ENV: 'test',
    API_PORT: '4001',
    API_PUBLIC_URL: 'http://localhost:4001',
    WEB_PUBLIC_URL: 'http://localhost:3001',
    WEB_ORIGIN: 'http://localhost:3001',
    DATABASE_URL: 'postgresql://rephone:rephone@localhost:5433/rephone_test',
    DIRECT_URL: 'postgresql://rephone:rephone@localhost:5433/rephone_test',
    JWT_ACCESS_SECRET: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
    IDENTIFIER_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
    IDENTIFIER_HMAC_KEY: 'YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk=',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    SUPABASE_PUBLIC_BUCKET: 'public-test',
    SUPABASE_PRIVATE_BUCKET: 'private-test',
    SUPABASE_STORE_BUCKET: 'store-test',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    SMTP_SECURE: 'false',
    MAIL_FROM: 'rePhone Test <no-reply@rephone.local>',
  });
}

describe('createLoggerParams', () => {
  it('removes sensitive HTTP and domain fields', () => {
    const params = createLoggerParams(loggerTestConfig());
    const pinoHttp = params.pinoHttp;
    expect(typeof pinoHttp).toBe('object');
    if (typeof pinoHttp !== 'object' || Array.isArray(pinoHttp) || !('redact' in pinoHttp)) {
      throw new Error('Expected object pinoHttp configuration');
    }
    const paths = (pinoHttp.redact as { paths: string[] }).paths;

    expect(paths).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.idempotency-key',
        'req.headers.x-guest-order-token',
        '*.password',
        '*.refreshToken',
        '*.accessToken',
        '*.guestAccessToken',
        '*.guestAccessTokenHash',
        '*.imei',
        '*.signedUrl',
        '*.bankAccountNumber',
        '*.shippingAddressSnapshot',
        '*.contact',
      ]),
    );
  });
});
