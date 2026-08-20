import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setTestEnvironment } from '../support/test-environment.js';

describe('readiness', () => {
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

  it('returns ready only after the database migration exists', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/health/ready')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toBeTypeOf('string');
  });
});
