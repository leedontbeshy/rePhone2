import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import sharp from 'sharp';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

describe('Slice 12 store, settings and audit HTTP contract', () => {
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

  it('publishes only safe store information without authentication', async () => {
    const response = await request(server).get('/api/v1/store').expect(200);

    const store = successRecord(response);
    expect(store['currency']).toBe('VND');
    expect(store['timezone']).toBe('Asia/Ho_Chi_Minh');
    expect(typeof objectProperty(store, 'pickup')['locationName']).toBe('string');
    expect(JSON.stringify(response.body)).not.toMatch(
      /bankAccount|bankName|bankQr|version|updatedBy|objectPath|bucket/i,
    );
  });

  it('enforces admin-only settings access and no-store on guarded responses', async () => {
    const employee = await login(server, 'EMPLOYEE');
    const admin = await login(server, 'ADMIN');

    expectNoStore(await request(server).get('/api/v1/backoffice/settings').expect(401));
    expectNoStore(
      await request(server).get('/api/v1/backoffice/settings').set(bearer(employee)).expect(403),
    );
    const allowed = await request(server)
      .get('/api/v1/backoffice/settings')
      .set(bearer(admin))
      .expect(200);
    expectNoStore(allowed);
    expect(successRecord(allowed)).toMatchObject({ version: 1, currency: 'VND' });

    expectNoStore(await request(server).get('/api/v1/backoffice/system/health').expect(401));
    expectNoStore(
      await request(server)
        .get('/api/v1/backoffice/system/health')
        .set(bearer(employee))
        .expect(403),
    );
    const response = await request(server)
      .get('/api/v1/backoffice/system/health')
      .set(bearer(admin))
      .expect(200);
    expectNoStore(response);
    expect(successRecord(response)).toMatchObject({
      state: 'degraded',
      api: { state: 'healthy', reason: 'ok' },
      database: { state: 'healthy', reason: 'ok' },
      storage: { state: 'healthy', reason: 'ok' },
      mail: { state: 'not_configured', reason: 'not_configured' },
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /databaseUrl|serviceRole|bucket|smtp|password|secret|objectPath|stack/i,
    );
  });

  it('uses compare-and-swap, returns the current version and audits only safe deltas', async () => {
    const admin = await login(server, 'ADMIN');
    const updated = await request(server)
      .patch('/api/v1/backoffice/settings')
      .set(bearer(admin))
      .send({ expectedVersion: 1, bankAccountHolder: 'REPHONE SAFE HOLDER' })
      .expect(200);
    expectNoStore(updated);
    expect(successRecord(updated)['version']).toBe(2);

    const stale = await request(server)
      .patch('/api/v1/backoffice/settings')
      .set(bearer(admin))
      .send({ expectedVersion: 1, storeName: 'Stale update' })
      .expect(409);
    expectNoStore(stale);
    expect(stale.body).toMatchObject({
      error: {
        code: 'SETTINGS_VERSION_CONFLICT',
        details: [expect.objectContaining({ current: { version: 2 } })],
      },
    });

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'settings.updated' },
      orderBy: { createdAt: 'desc' },
    });
    const serialized = JSON.stringify({ changes: audit.changes, metadata: audit.metadata });
    expect(serialized).toContain('bankAccountHolder');
    expect(serialized).not.toContain('REPHONE SAFE HOLDER');
    expect(serialized).not.toContain('Điều khoản');
    expect(await prisma.auditLog.count({ where: { action: 'settings.updated' } })).toBe(1);
  });

  it('rejects money values that exceed the database precision', async () => {
    const admin = await login(server, 'ADMIN');

    const response = await request(server)
      .patch('/api/v1/backoffice/settings')
      .set(bearer(admin))
      .send({
        expectedVersion: 1,
        defaultShippingFee: '1000000000000000',
        shippingDepositAmount: '1000000000000000',
      })
      .expect(400);

    expectNoStore(response);
    expect(await prisma.storeSettings.findFirstOrThrow()).toMatchObject({
      version: 1,
    });
  });

  it('validates and attaches bank QR with the same settings CAS boundary', async () => {
    const admin = await login(server, 'ADMIN');
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();

    const response = await request(server)
      .post('/api/v1/backoffice/settings/bank-qr')
      .set(bearer(admin))
      .field('expectedVersion', '1')
      .attach('file', png, { filename: 'bank-qr.png', contentType: 'image/png' })
      .expect(200);
    expectNoStore(response);
    const settings = successRecord(response);
    expect(settings['version']).toBe(2);
    expect(String(settings['bankQrUrl'])).toContain('/storage/v1/object/public/');

    const stale = await request(server)
      .post('/api/v1/backoffice/settings/bank-qr')
      .set(bearer(admin))
      .field('expectedVersion', '1')
      .attach('file', png, { filename: 'bank-qr.png', contentType: 'image/png' })
      .expect(409);
    expectNoStore(stale);
  });

  it('keeps audit query admin-only and sanitizes historical records again on read', async () => {
    const employee = await login(server, 'EMPLOYEE');
    const adminToken = await login(server, 'ADMIN');
    const admin = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'admin@rephone.local' },
    });
    const resourceId = '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6799';
    const historical = await prisma.auditLog.create({
      data: {
        actorType: 'USER',
        actorUserId: admin.id,
        action: 'security.test',
        resourceType: 'ReleaseProbe',
        resourceId,
        requestId: 'request-system-e2e',
        ipAddress: '127.0.0.1',
        userAgent: 'safe-agent '.repeat(150),
        changes: { password: 'must-not-leak', safeStatus: 'ACTIVE' },
        metadata: {
          nested: { bankAccountNumber: '0000111122223333', objectPath: 'private/file.pdf' },
        },
      },
    });

    expectNoStore(
      await request(server).get('/api/v1/backoffice/audit-logs').set(bearer(employee)).expect(403),
    );
    const list = await request(server)
      .get('/api/v1/backoffice/audit-logs')
      .query({ action: 'security.*', resourceId, page: 1, pageSize: 10 })
      .set(bearer(adminToken))
      .expect(200);
    expectNoStore(list);
    const item = successList(list)[0];
    expect(item).toBeDefined();
    if (item === undefined) throw new Error('Expected an audit list item');
    expect(item).not.toHaveProperty('ipAddress');
    expect(item).not.toHaveProperty('userAgent');
    expect(JSON.stringify(item)).toContain('safeStatus');
    expect(JSON.stringify(item)).not.toMatch(/must-not-leak|0000111122223333|private\/file/i);

    const detail = await request(server)
      .get(`/api/v1/backoffice/audit-logs/${historical.id}`)
      .set(bearer(adminToken))
      .expect(200);
    expectNoStore(detail);
    const projected = successRecord(detail);
    expect(projected['ipAddress']).toBe('127.0.0.1');
    expect((projected['userAgent'] as string).length).toBeLessThanOrEqual(1000);
    expect(JSON.stringify(projected)).not.toMatch(/must-not-leak|0000111122223333|private\/file/i);
  });
});

async function login(server: Server, role: 'ADMIN' | 'EMPLOYEE'): Promise<string> {
  const credentials = {
    ADMIN: ['admin@rephone.local', 'AdminDemo123'],
    EMPLOYEE: ['employee@rephone.local', 'EmployeeDemo123'],
  } as const;
  const [email, password] = credentials[role];
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

function successList(response: Response): Record<string, unknown>[] {
  const body = response.body as unknown;
  if (!isRecord(body) || !Array.isArray(body['data'])) throw new Error('Expected list envelope');
  return body['data'].map((item) => {
    if (!isRecord(item)) throw new Error('Expected list item');
    return item;
  });
}

function objectProperty(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const property = value[key];
  if (!isRecord(property)) throw new Error(`Expected ${key} object`);
  return property;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
