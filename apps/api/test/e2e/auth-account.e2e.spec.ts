import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthRateLimiter } from '../../src/modules/auth/auth-rate-limiter.service.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

const WEB_ORIGIN = 'http://localhost:3001';
const CSRF_HEADERS = {
  Origin: WEB_ORIGIN,
  'X-Rephone-CSRF': '1',
  'Content-Type': 'application/json',
};

describe('auth and account HTTP contract', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: Server;

  beforeAll(async () => {
    setTestEnvironment();
    const { createApplication } = await import('../../src/application.js');
    app = await createApplication({ enableSwagger: false });
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer() as Server;
    prisma = createTestPrisma();
  });

  beforeEach(async () => {
    app.get(AuthRateLimiter).clear();
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('keeps registration and login responses enumeration-safe without creating a session', async () => {
    const registration = await registerCustomer(server, 'alice@example.com', 'Alice');

    expect(successData(registration)).toEqual({
      message: 'Yêu cầu tạo tài khoản đã được tiếp nhận. Bạn có thể đăng nhập để tiếp tục.',
    });
    expect(
      await prisma.user.findUniqueOrThrow({ where: { normalizedEmail: 'alice@example.com' } }),
    ).toMatchObject({ email: 'alice@example.com', fullName: 'Alice', status: 'ACTIVE' });

    const duplicate = await request(server)
      .post('/api/v1/auth/register')
      .send({
        email: ' ALICE@example.com ',
        password: 'Different123',
        fullName: 'Different Name',
      })
      .expect(201);
    expect(successData(duplicate)).toEqual(successData(registration));
    expect(await prisma.user.count({ where: { normalizedEmail: 'alice@example.com' } })).toBe(1);
    expect(await prisma.authSession.count()).toBe(0);
    expect(registration.headers['set-cookie']).toBeUndefined();
    expect(duplicate.headers['set-cookie']).toBeUndefined();

    const unknown = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'missing@example.com', password: 'Wrong1234' })
      .expect(401);
    const wrongPassword = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@example.com', password: 'Wrong1234' })
      .expect(401);

    expect(errorCode(unknown)).toBe('INVALID_CREDENTIALS');
    expect(errorCode(wrongPassword)).toBe('INVALID_CREDENTIALS');
    expect(errorMessage(unknown)).toBe(errorMessage(wrongPassword));
  });

  it('enforces CSRF, rotates refresh generations, detects reuse and revokes the family', async () => {
    await registerCustomer(server, 'rotate@example.com', 'Rotate User');
    const login = await loginCustomer(server, 'rotate@example.com');
    const originalCookie = refreshCookie(login);
    const originalAccessToken = stringProperty(successData(login), 'accessToken');

    const rejectedCsrf = await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', originalCookie)
      .send({})
      .expect(403);
    expect(errorCode(rejectedCsrf)).toBe('CSRF_VALIDATION_FAILED');

    const refreshed = await request(server)
      .post('/api/v1/auth/refresh')
      .set(CSRF_HEADERS)
      .set('Cookie', originalCookie)
      .send({})
      .expect(200);
    const successorCookie = refreshCookie(refreshed);
    const successorAccessToken = stringProperty(successData(refreshed), 'accessToken');

    const revokedAccess = await request(server)
      .get('/api/v1/account')
      .set('Authorization', `Bearer ${originalAccessToken}`)
      .expect(401);
    expect(errorCode(revokedAccess)).toBe('SESSION_REVOKED');

    await request(server)
      .get('/api/v1/account')
      .set('Authorization', `Bearer ${successorAccessToken}`)
      .expect(200);

    const reuse = await request(server)
      .post('/api/v1/auth/refresh')
      .set(CSRF_HEADERS)
      .set('Cookie', originalCookie)
      .send({})
      .expect(401);
    expect(errorCode(reuse)).toBe('SESSION_REVOKED');

    const revokedSuccessor = await request(server)
      .post('/api/v1/auth/refresh')
      .set(CSRF_HEADERS)
      .set('Cookie', successorCookie)
      .send({})
      .expect(401);
    expect(errorCode(revokedSuccessor)).toBe('SESSION_REVOKED');
  });

  it('creates only one successor under concurrent refresh and revokes it as strict reuse', async () => {
    await registerCustomer(server, 'concurrent@example.com', 'Concurrent User');
    const login = await loginCustomer(server, 'concurrent@example.com');
    const cookie = refreshCookie(login);

    const responses = await Promise.all([
      request(server).post('/api/v1/auth/refresh').set(CSRF_HEADERS).set('Cookie', cookie).send({}),
      request(server).post('/api/v1/auth/refresh').set(CSRF_HEADERS).set('Cookie', cookie).send({}),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 401]);
    const sessions = await prisma.authSession.findMany({
      where: { user: { normalizedEmail: 'concurrent@example.com' } },
      orderBy: { createdAt: 'asc' },
    });
    expect(sessions).toHaveLength(2);
    expect(sessions.every(({ revokedAt }) => revokedAt !== null)).toBe(true);
  });

  it('revokes access immediately on logout and password change', async () => {
    await registerCustomer(server, 'password@example.com', 'Password User');
    const firstLogin = await loginCustomer(server, 'password@example.com');
    const firstAccess = stringProperty(successData(firstLogin), 'accessToken');

    await request(server)
      .post('/api/v1/auth/logout')
      .set(CSRF_HEADERS)
      .set('Cookie', refreshCookie(firstLogin))
      .send({})
      .expect(204);
    await request(server)
      .get('/api/v1/account')
      .set('Authorization', `Bearer ${firstAccess}`)
      .expect(401);

    const secondLogin = await loginCustomer(server, 'password@example.com');
    const secondAccess = stringProperty(successData(secondLogin), 'accessToken');
    await request(server)
      .post('/api/v1/account/change-password')
      .set('Authorization', `Bearer ${secondAccess}`)
      .send({ currentPassword: 'Customer123', newPassword: 'Changed1234' })
      .expect(204);
    await request(server)
      .get('/api/v1/account')
      .set('Authorization', `Bearer ${secondAccess}`)
      .expect(401);
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'password@example.com', password: 'Customer123' })
      .expect(401);
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'password@example.com', password: 'Changed1234' })
      .expect(200);
  });

  it('consumes reset and employee invitation tokens exactly once', async () => {
    await registerCustomer(server, 'reset@example.com', 'Reset User');
    const resetUser = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'reset@example.com' },
    });
    const resetToken = 'reset-token-with-at-least-256-bits-0123456789';
    await prisma.authToken.create({
      data: {
        userId: resetUser.id,
        purpose: 'RESET_PASSWORD',
        tokenHash: digest(resetToken),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await request(server)
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, newPassword: 'ResetDone123' })
      .expect(204);
    const reusedReset = await request(server)
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, newPassword: 'ResetAgain123' })
      .expect(422);
    expect(errorCode(reusedReset)).toBe('ONE_TIME_TOKEN_INVALID');

    const employee = await prisma.user.create({
      data: {
        email: 'employee@example.com',
        normalizedEmail: 'employee@example.com',
        fullName: 'Employee',
        employeeCode: 'EMP-E2E',
        role: 'EMPLOYEE',
        status: 'PENDING_VERIFICATION',
      },
    });
    const invitationToken = 'invitation-token-with-at-least-256-bits-012345';
    await prisma.authToken.create({
      data: {
        userId: employee.id,
        purpose: 'EMPLOYEE_INVITATION',
        tokenHash: digest(invitationToken),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await request(server)
      .post('/api/v1/auth/accept-employee-invitation')
      .send({ token: invitationToken, password: 'Employee123' })
      .expect(204);
    await request(server)
      .post('/api/v1/auth/accept-employee-invitation')
      .send({ token: invitationToken, password: 'Employee456' })
      .expect(422);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: employee.id } })).toMatchObject({
      status: 'ACTIVE',
    });
  });

  it('hides another customer address and maintains one active default atomically', async () => {
    await registerCustomer(server, 'owner@example.com', 'Owner');
    await registerCustomer(server, 'other@example.com', 'Other');
    const owner = await loginCustomer(server, 'owner@example.com');
    const other = await loginCustomer(server, 'other@example.com');
    const ownerAccess = stringProperty(successData(owner), 'accessToken');
    const otherAccess = stringProperty(successData(other), 'accessToken');

    const first = await createAddress(server, ownerAccess, 'Nhà', true);
    const second = await createAddress(server, ownerAccess, 'Công ty', true);
    const firstId = stringProperty(successData(first), 'id');
    const secondId = stringProperty(successData(second), 'id');

    const hiddenAddress = await request(server)
      .patch(`/api/v1/account/addresses/${firstId}`)
      .set('Authorization', `Bearer ${otherAccess}`)
      .send({ label: 'Không được phép' })
      .expect(404);
    expect(errorCode(hiddenAddress)).toBe('RESOURCE_NOT_FOUND');

    const active = await request(server)
      .get('/api/v1/account/addresses')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    const activeAddresses = successArray(active);
    expect(activeAddresses).toHaveLength(2);
    expect(activeAddresses.filter((address) => address['isDefault'] === true)).toEqual([
      expect.objectContaining({ id: secondId }),
    ]);

    await request(server)
      .delete(`/api/v1/account/addresses/${secondId}`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(204);
    const afterArchive = await prisma.customerAddress.findMany({
      where: { user: { normalizedEmail: 'owner@example.com' }, archivedAt: null, isDefault: true },
    });
    expect(afterArchive).toHaveLength(0);
  });
});

function registerCustomer(server: Server, email: string, fullName: string) {
  return request(server)
    .post('/api/v1/auth/register')
    .send({ email, password: 'Customer123', fullName })
    .expect(201);
}

function loginCustomer(server: Server, email: string) {
  return request(server)
    .post('/api/v1/auth/login')
    .send({ email, password: 'Customer123' })
    .expect(200);
}

function createAddress(server: Server, accessToken: string, label: string, isDefault: boolean) {
  return request(server)
    .post('/api/v1/account/addresses')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      label,
      receiverName: 'Nguyễn Văn An',
      phone: '0900000000',
      addressLine: '123 Đường Demo',
      ward: 'Phường 1',
      district: 'Quận 1',
      province: 'TP. Hồ Chí Minh',
      isDefault,
    })
    .expect(201);
}

function refreshCookie(response: request.Response): string {
  const header: unknown = response.get('set-cookie');
  const cookies =
    typeof header === 'string'
      ? [header]
      : Array.isArray(header) && header.every((value) => typeof value === 'string')
        ? header
        : [];
  const cookie = cookies.find((value) => value.startsWith('rephone_refresh='));
  if (cookie === undefined) {
    throw new Error('Missing refresh cookie');
  }
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Lax');
  expect(cookie).toContain('Path=/api/v1/auth');
  return cookie.split(';', 1)[0] ?? cookie;
}

function digest(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function successData(response: request.Response): Record<string, unknown> {
  const body: unknown = response.body;
  if (!isRecord(body) || !isRecord(body['data'])) {
    throw new Error('Expected a success data object');
  }
  return body['data'];
}

function successArray(response: request.Response): Array<Record<string, unknown>> {
  const body: unknown = response.body;
  if (!isRecord(body) || !Array.isArray(body['data']) || !body['data'].every(isRecord)) {
    throw new Error('Expected a success data array');
  }
  return body['data'];
}

function errorCode(response: request.Response): string {
  return errorProperty(response, 'code');
}

function errorMessage(response: request.Response): string {
  return errorProperty(response, 'message');
}

function errorProperty(response: request.Response, property: string): string {
  const body: unknown = response.body;
  if (!isRecord(body) || !isRecord(body['error'])) {
    throw new Error('Expected an error object');
  }
  return stringProperty(body['error'], property);
}

function stringProperty(value: Record<string, unknown>, property: string): string {
  const propertyValue = value[property];
  if (typeof propertyValue !== 'string') {
    throw new Error(`Expected ${property} to be a string`);
  }
  return propertyValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
