import type { IncomingMessage, ServerResponse } from 'node:http';
import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../config/app-config.js';
import { createLoggerParams, httpLogFields, REDACTED_LOG_PATHS } from './logger.config.js';

function loggerTestConfig(environment = 'test') {
  return loadConfig({
    NODE_ENV: environment,
    API_PORT: '4001',
    API_PUBLIC_URL: 'http://localhost:4001',
    WEB_PUBLIC_URL: 'http://localhost:3001',
    WEB_ORIGIN: 'http://localhost:3001',
    DATABASE_URL: `postgresql://rephone:rephone@localhost:5434/rephone_${environment === 'development' ? 'dev' : 'test'}`,
    DIRECT_URL: `postgresql://rephone:rephone@localhost:5434/rephone_${environment === 'development' ? 'dev' : 'test'}`,
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
  it('enables pretty transport only for local development', () => {
    const development = createLoggerParams(loggerTestConfig('development')).pinoHttp;
    const test = createLoggerParams(loggerTestConfig('test')).pinoHttp;

    expect(development).toMatchObject({
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, singleLine: true, translateTime: 'SYS:standard' },
      },
    });
    expect(test).not.toHaveProperty('transport');
  });

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

  it('correlates an authenticated request with only the safe actor identity', () => {
    const request = {
      method: 'PATCH',
      baseUrl: '/api/v1',
      route: { path: '/backoffice/settings' },
      auth: {
        userId: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6701',
        role: 'ADMIN',
        sessionId: 'must-not-be-logged',
      },
    } as unknown as IncomingMessage;

    expect(httpLogFields(request, { statusCode: 200 } as ServerResponse)).toEqual({
      method: 'PATCH',
      route: '/api/v1/backoffice/settings',
      actorType: 'USER',
      actorId: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6701',
      statusCode: 200,
    });
  });

  it('omits actor and route when Express has not resolved them', () => {
    const request = {
      method: 'OPTIONS',
      baseUrl: '/api/v1',
      route: { path: 42 },
    } as unknown as IncomingMessage;

    expect(httpLogFields(request, { statusCode: 204 } as ServerResponse)).toEqual({
      method: 'OPTIONS',
      statusCode: 204,
    });
  });

  it('merges safe HTTP fields into success and error log objects', () => {
    const pinoHttp = createLoggerParams(loggerTestConfig()).pinoHttp;
    if (typeof pinoHttp !== 'object' || Array.isArray(pinoHttp)) {
      throw new Error('Expected object pinoHttp configuration');
    }
    const configured = pinoHttp as typeof pinoHttp & {
      customSuccessObject: (
        request: IncomingMessage,
        response: ServerResponse,
        value: unknown,
      ) => Record<string, unknown>;
      customErrorObject: (
        request: IncomingMessage,
        response: ServerResponse,
        error: Error,
        value: unknown,
      ) => Record<string, unknown>;
    };
    const request = { method: 'POST' } as IncomingMessage;
    const response = { statusCode: 503 } as ServerResponse;
    const successObject = configured.customSuccessObject;
    const errorObject = configured.customErrorObject;

    expect(successObject(request, response, { requestId: 'request-1' })).toEqual({
      requestId: 'request-1',
      method: 'POST',
      statusCode: 503,
    });
    expect(errorObject(request, response, new Error('safe'), ['ignored'])).toEqual({
      method: 'POST',
      statusCode: 503,
    });
    expect(successObject(request, response, null)).toEqual({
      method: 'POST',
      statusCode: 503,
    });
  });
});
