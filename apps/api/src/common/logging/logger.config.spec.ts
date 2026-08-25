import type { IncomingMessage, ServerResponse } from 'node:http';
import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../config/app-config.js';
import { createLoggerParams, httpLogFields, REDACTED_LOG_PATHS } from './logger.config.js';

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
        "req.headers['idempotency-key']",
        "req.headers['x-guest-order-token']",
        'password',
        '*.*.refreshTokenHash',
        '*.guestAccessTokenHash',
        '*.imei1Hmac',
        '*.signedUrl',
        '*.evidenceSha256',
        '*.objectPath',
        '*.bankAccountNumber',
        '*.shippingAddressSnapshot',
        '*.recipient',
      ]),
    );
  });

  it('actually removes sensitive headers and nested payload values', () => {
    let output = '';
    const destination = new Writable({
      write(chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
        output += Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
        callback();
      },
    });
    const logger = pino({ redact: { paths: REDACTED_LOG_PATHS, remove: true } }, destination);

    logger.info({
      req: {
        headers: {
          authorization: 'Bearer secret',
          cookie: 'session=secret',
          'x-guest-order-token': 'guest-secret',
        },
      },
      payload: { password: 'password-secret', refreshTokenHash: 'hash-secret' },
      metadata: { evidenceObjectPath: 'refunds/private/file.pdf' },
      requestId: 'safe-request-id',
    });

    const entry = JSON.parse(output.trim()) as Record<string, unknown>;
    expect(JSON.stringify(entry)).not.toContain('secret');
    expect(entry.requestId).toBe('safe-request-id');
  });

  it('adds a route template and never copies the raw URL to the HTTP summary', () => {
    const request = {
      method: 'GET',
      url: '/api/v1/orders/private-order?token=secret',
      baseUrl: '/api/v1',
      route: { path: '/orders/:orderNumber' },
    } as unknown as IncomingMessage;
    const response = { statusCode: 200 } as ServerResponse;

    const summary = httpLogFields(request, response);

    expect(summary).toEqual({
      method: 'GET',
      route: '/api/v1/orders/:orderNumber',
      statusCode: 200,
    });
    expect(JSON.stringify(summary)).not.toContain('private-order');
  });
});
