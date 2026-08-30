import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

describe('Operations overview HTTP contract', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: Server;

  beforeAll(async () => {
    setTestEnvironment();
    const { createApplication } = await import('../../src/application.js');
    app = await createApplication({ enableSwagger: false });
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = createTestPrisma();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('returns one no-store aggregate snapshot to employees and admins', async () => {
    const [employee, admin] = await Promise.all([
      login(server, 'employee@rephone.local', 'EmployeeDemo123'),
      login(server, 'admin@rephone.local', 'AdminDemo123'),
    ]);
    const expectedActiveOrders = await prisma.order.count({
      where: { status: { in: ['PLACED', 'CONFIRMED', 'PROCESSING'] } },
    });

    for (const token of [employee, admin]) {
      const response = await request(server)
        .get('/api/v1/backoffice/overview')
        .set(bearer(token))
        .expect(200);

      expectNoStore(response);
      const overview = successRecord(response);
      expect(overview['generatedAt']).toEqual(expect.any(String));
      expect(overview['metrics']).toMatchObject({ activeOrders: expectedActiveOrders });
      expect(Array.isArray(overview['priorities'])).toBe(true);
      expect(Array.isArray(overview['recentOrders'])).toBe(true);
      expect((overview['recentOrders'] as unknown[]).length).toBeLessThanOrEqual(5);
      expect(JSON.stringify(overview['recentOrders'])).not.toMatch(/customerEmail|customerPhone/i);
    }
  });

  it('rejects anonymous and customer access without exposing a snapshot', async () => {
    expectNoStore(await request(server).get('/api/v1/backoffice/overview').expect(401));
    const customer = await login(server, 'customer@rephone.local', 'CustomerDemo123');
    expectNoStore(
      await request(server).get('/api/v1/backoffice/overview').set(bearer(customer)).expect(403),
    );
  });
});

async function login(server: Server, email: string, password: string): Promise<string> {
  const response = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return String(successRecord(response)['accessToken']);
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function expectNoStore(response: Response): void {
  expect(response.headers['cache-control']).toBe('no-store');
}

function successRecord(response: Response): Record<string, unknown> {
  const body = response.body as unknown;
  if (!isRecord(body) || !isRecord(body['data'])) throw new Error('Expected success envelope');
  return body['data'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
