import { JwtService } from '@nestjs/jwt';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../common/errors/api-error.js';
import { loadConfig } from '../../config/app-config.js';
import { AuthRateLimiter } from './auth-rate-limiter.service.js';
import { RegisterDto } from './auth.dto.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

const testConfig = () =>
  loadConfig({
    NODE_ENV: 'test',
    API_PORT: '4001',
    API_PUBLIC_URL: 'http://localhost:4001',
    WEB_PUBLIC_URL: 'http://localhost:3001',
    WEB_ORIGIN: 'http://localhost:3001',
    DATABASE_URL: 'postgresql://rephone:rephone@localhost:5433/rephone_test',
    DIRECT_URL: 'postgresql://rephone:rephone@localhost:5433/rephone_test',
    JWT_ACCESS_SECRET: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
    ARGON2_MEMORY_KIB: '8192',
    ARGON2_TIME_COST: '1',
    ARGON2_PARALLELISM: '1',
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

describe('auth security primitives', () => {
  it('hashes the exact password without trimming it', async () => {
    const service = new PasswordService(testConfig());
    const passwordHash = await service.hash(' Abc12345 ');

    await expect(service.verify(passwordHash, ' Abc12345 ')).resolves.toBe(true);
    await expect(service.verify(passwordHash, 'Abc12345')).resolves.toBe(false);
  });

  it('rejects passwords without a letter/number or with edge whitespace at the DTO boundary', async () => {
    const invalidPasswords = ['abcdefgh', '12345678', ' Abc12345', 'Abc12345 '];

    for (const password of invalidPasswords) {
      const input = new RegisterDto();
      input.email = 'customer@example.com';
      input.fullName = 'Customer';
      input.password = password;
      await expect(validate(input)).resolves.not.toHaveLength(0);
    }
  });

  it('creates opaque tokens as digests and signs the accepted JWT claims', async () => {
    const config = testConfig();
    const service = new TokenService(new JwtService({ secret: config.auth.accessSecret }), config);
    const opaqueToken = service.createOpaqueToken();
    const digest = service.digestOpaqueToken(opaqueToken);
    const accessToken = await service.signAccessToken(
      '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e1',
      'CUSTOMER',
      '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e2',
    );
    const claims = await service.verifyAccessToken(accessToken);

    expect(opaqueToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(claims).toMatchObject({
      sub: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e1',
      role: 'CUSTOMER',
      sessionId: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e2',
      iss: 'rephone-api',
      aud: 'rephone-web',
    });
  });

  it('returns a Retry-After header when a login bucket is exhausted', () => {
    const limiter = new AuthRateLimiter();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      limiter.login('127.0.0.1', 'customer@example.com');
    }

    try {
      limiter.login('127.0.0.1', 'customer@example.com');
      throw new Error('Expected the limiter to reject the sixth attempt');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe('RATE_LIMITED');
      expect((error as ApiError).headers['Retry-After']).toMatch(/^\d+$/);
    }
  });
});
