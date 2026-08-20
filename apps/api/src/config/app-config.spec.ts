import { describe, expect, it } from 'vitest';
import { loadConfig } from './app-config.js';

function validEnvironment(): NodeJS.ProcessEnv {
  return {
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
  };
}

describe('loadConfig', () => {
  it('parses required values and applies P0 defaults', () => {
    const config = loadConfig(validEnvironment());

    expect(config.environment).toBe('test');
    expect(config.api.port).toBe(4001);
    expect(config.auth.accessTtlSeconds).toBe(900);
    expect(config.scheduler.enabled).toBe(true);
    expect(config.logging.level).toBe('silent');
  });

  it('reports variable names without exposing secret values', () => {
    const environment = validEnvironment();
    environment.JWT_ACCESS_SECRET = 'short-secret';

    expect(() => loadConfig(environment)).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => loadConfig(environment)).not.toThrow(/short-secret/);
  });

  it('rejects reused identifier keys', () => {
    const environment = validEnvironment();
    environment.IDENTIFIER_HMAC_KEY = environment.IDENTIFIER_ENCRYPTION_KEY;

    expect(() => loadConfig(environment)).toThrow(/IDENTIFIER_HMAC_KEY/);
  });

  it('rejects placeholder infrastructure secrets in production', () => {
    const environment = validEnvironment();
    environment.NODE_ENV = 'production';
    environment.API_PUBLIC_URL = 'https://api.rephone.vn';
    environment.WEB_PUBLIC_URL = 'https://rephone.vn';
    environment.WEB_ORIGIN = 'https://rephone.vn';
    environment.SUPABASE_SERVICE_ROLE_KEY = 'production-placeholder-service-role-key';

    expect(() => loadConfig(environment)).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
