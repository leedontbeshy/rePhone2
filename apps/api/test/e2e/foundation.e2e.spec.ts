import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setTestEnvironment } from '../support/test-environment.js';

describe('foundation HTTP contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    setTestEnvironment();
    const { createApplication } = await import('../../src/application.js');
    app = await createApplication({ enableSwagger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves liveness outside the API prefix without an envelope', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/health/live')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('serves readiness outside the API prefix when migrations are applied', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/health/ready')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('preserves a valid caller request ID', async () => {
    const requestId = '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e1';
    const response = await request(app.getHttpServer() as Server)
      .get('/health/live')
      .set('X-Request-Id', requestId)
      .expect(200);

    expect(response.headers['x-request-id']).toBe(requestId);
  });

  it('returns the stable error envelope for an unknown business route', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/api/v1/missing')
      .expect(404);

    expect(response.body).toEqual({
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Không tìm thấy tài nguyên.',
        details: [],
        requestId: response.headers['x-request-id'],
      },
    });
  });
});
