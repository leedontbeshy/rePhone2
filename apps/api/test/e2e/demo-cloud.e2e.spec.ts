import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

describe('cloud demo with email disabled', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: Server;
  const previous = {
    DEMO_MODE: process.env.DEMO_MODE,
    MAIL_ENABLED: process.env.MAIL_ENABLED,
  };

  beforeAll(async () => {
    setTestEnvironment();
    process.env.DEMO_MODE = 'true';
    process.env.MAIL_ENABLED = 'false';
    const { createApplication } = await import('../../src/application.js');
    app = await createApplication({ enableSwagger: false });
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer() as Server;
    prisma = createTestPrisma();
    await resetTestDatabase(prisma);
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
    if (previous.DEMO_MODE === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previous.DEMO_MODE;
    if (previous.MAIL_ENABLED === undefined) delete process.env.MAIL_ENABLED;
    else process.env.MAIL_ENABLED = previous.MAIL_ENABLED;
  });

  it('keeps readiness available and rejects email flows without creating tokens', async () => {
    await request(server).get('/health/ready').expect(200);
    const before = await prisma.authToken.count();
    for (const [route, body] of [
      ['forgot-password', { email: 'customer@rephone.local' }],
      ['reset-password', { token: 'x'.repeat(32), newPassword: 'UpdatedDemo123' }],
      ['accept-employee-invitation', { token: 'x'.repeat(32), password: 'UpdatedDemo123' }],
    ] as const) {
      const response = await request(server).post(`/api/v1/auth/${route}`).send(body).expect(503);
      expect(response.body).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE' } });
    }
    expect(await prisma.authToken.count()).toBe(before);
  });

  it('allows existing accounts to log in and rolls back an unavailable employee invitation', async () => {
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@rephone.local', password: 'AdminDemo123' })
      .expect(200);
    const body = login.body as { data: { accessToken: string } };
    const before = {
      users: await prisma.user.count(),
      employees: await prisma.user.count({ where: { role: 'EMPLOYEE' } }),
      tokens: await prisma.authToken.count(),
      audit: await prisma.auditLog.count(),
    };
    await request(server)
      .post('/api/v1/backoffice/employees')
      .set('Authorization', `Bearer ${body.data.accessToken}`)
      .send({
        email: 'unavailable-invitation@example.invalid',
        fullName: 'Demo Employee',
        employeeCode: 'DEMO-UNAVAILABLE',
      })
      .expect(503);
    expect({
      users: await prisma.user.count(),
      employees: await prisma.user.count({ where: { role: 'EMPLOYEE' } }),
      tokens: await prisma.authToken.count(),
      audit: await prisma.auditLog.count(),
    }).toEqual(before);
  });
});
