import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { AuthRateLimiter } from '../../src/modules/auth/auth-rate-limiter.service.js';
import { BackofficeRateLimiter } from '../../src/modules/auth/backoffice-rate-limiter.service.js';
import { NotificationDeliveryService } from '../../src/modules/notifications/notification-delivery.service.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

describe('Slice 12 employee and customer HTTP contract', () => {
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
    vi.restoreAllMocks();
    app.get(AuthRateLimiter).clear();
    app.get(BackofficeRateLimiter).clear();
    await resetTestDatabase(prisma);
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('enforces the admin/employee/customer matrix and no-store on guarded responses', async () => {
    const employee = await login(server, 'EMPLOYEE');
    const customer = await login(server, 'CUSTOMER');

    const anonymous = await request(server).get('/api/v1/backoffice/employees').expect(401);
    expectNoStore(anonymous);

    const employeeManagement = await request(server)
      .get('/api/v1/backoffice/employees')
      .set(bearer(employee))
      .expect(403);
    expectNoStore(employeeManagement);

    const employeeCustomerRead = await request(server)
      .get('/api/v1/backoffice/customers')
      .set(bearer(employee))
      .expect(200);
    expectNoStore(employeeCustomerRead);
    expect(JSON.stringify(employeeCustomerRead.body)).not.toMatch(
      /passwordHash|normalizedEmail|addresses|authSessions|authTokens|guestAccessToken/i,
    );

    const customerBackoffice = await request(server)
      .get('/api/v1/backoffice/customers')
      .set(bearer(customer))
      .expect(403);
    expectNoStore(customerBackoffice);
  });

  it('creates, updates and replaces employee invitations without exposing raw tokens', async () => {
    const admin = await login(server, 'ADMIN');
    const created = await request(server)
      .post('/api/v1/backoffice/employees')
      .set(bearer(admin))
      .send({
        email: ' NEW.EMPLOYEE@EXAMPLE.COM ',
        fullName: ' New Employee ',
        phone: '0912345678',
        employeeCode: ' emp-012 ',
        hiredAt: '2026-08-25',
      })
      .expect(201);
    expectNoStore(created);
    const result = successRecord(created);
    expect(result['deliveryStatus']).toBe('SENT');
    const employee = objectProperty(result, 'employee');
    expect(employee).toMatchObject({
      email: 'new.employee@example.com',
      employeeCode: 'EMP-012',
      status: 'PENDING_VERIFICATION',
    });
    expect(JSON.stringify(created.body)).not.toMatch(/rawToken|tokenHash|passwordHash/i);

    const employeeId = stringProperty(employee, 'id');
    const firstToken = await prisma.authToken.findFirstOrThrow({
      where: { userId: employeeId, purpose: 'EMPLOYEE_INVITATION', consumedAt: null },
    });
    expect(firstToken.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: employeeId } })).passwordHash,
    ).toBeNull();

    const updated = await request(server)
      .patch(`/api/v1/backoffice/employees/${employeeId}`)
      .set(bearer(admin))
      .send({ fullName: 'Updated Employee', employeeCode: 'emp-013', phone: null })
      .expect(200);
    expect(successRecord(updated)).toMatchObject({
      fullName: 'Updated Employee',
      employeeCode: 'EMP-013',
      phone: null,
    });

    const resent = await request(server)
      .post(`/api/v1/backoffice/employees/${employeeId}/resend-invitation`)
      .set(bearer(admin))
      .send({})
      .expect(200);
    expect(successRecord(resent)).toMatchObject({ employeeId, deliveryStatus: 'SENT' });
    const invitations = await prisma.authToken.findMany({
      where: { userId: employeeId, purpose: 'EMPLOYEE_INVITATION' },
      orderBy: { createdAt: 'asc' },
    });
    expect(invitations).toHaveLength(2);
    expect(invitations[0]?.consumedAt).not.toBeNull();
    expect(invitations[1]?.tokenHash).not.toBe(firstToken.tokenHash);
    expect(await prisma.auditLog.count({ where: { resourceId: employeeId } })).toBe(3);
  });

  it('does not roll back an invited employee when SMTP delivery fails', async () => {
    vi.spyOn(app.get(NotificationDeliveryService), 'deliver').mockResolvedValueOnce('FAILED');
    const admin = await login(server, 'ADMIN');
    const response = await request(server)
      .post('/api/v1/backoffice/employees')
      .set(bearer(admin))
      .send({
        email: 'mail-failed@example.com',
        fullName: 'Mail Failed',
        employeeCode: 'EMP-MAIL-FAILED',
      })
      .expect(201);

    expect(successRecord(response)['deliveryStatus']).toBe('FAILED');
    const employee = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'mail-failed@example.com' },
    });
    expect(employee).toMatchObject({ status: 'PENDING_VERIFICATION', passwordHash: null });
    expect(
      await prisma.authToken.count({
        where: { userId: employee.id, purpose: 'EMPLOYEE_INVITATION', consumedAt: null },
      }),
    ).toBe(1);
  });

  it('revokes employee credentials atomically and restores the correct active state', async () => {
    const employeeAccess = await login(server, 'EMPLOYEE');
    const admin = await login(server, 'ADMIN');
    const employee = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'employee@rephone.local' },
    });
    await prisma.authToken.create({
      data: {
        userId: employee.id,
        purpose: 'RESET_PASSWORD',
        tokenHash: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await request(server)
      .post(`/api/v1/backoffice/employees/${employee.id}/disable`)
      .set(bearer(admin))
      .send({ reason: 'Nhân viên đã nghỉ việc' })
      .expect(200);

    await request(server).get('/api/v1/account').set(bearer(employeeAccess)).expect(401);
    expect(
      await prisma.authSession.count({ where: { userId: employee.id, revokedAt: null } }),
    ).toBe(0);
    expect(await prisma.authToken.count({ where: { userId: employee.id, consumedAt: null } })).toBe(
      0,
    );

    const enabled = await request(server)
      .post(`/api/v1/backoffice/employees/${employee.id}/enable`)
      .set(bearer(admin))
      .send({ reason: 'Nhân viên quay lại làm việc' })
      .expect(200);
    expect(successRecord(enabled)).toMatchObject({ status: 'ACTIVE', disabledAt: null });
  });

  it('keeps disable concurrent with refresh free of surviving credentials', async () => {
    const employeeLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'employee@rephone.local', password: 'EmployeeDemo123' })
      .expect(200);
    const originalAccess = stringProperty(successRecord(employeeLogin), 'accessToken');
    const refreshCookie = cookie(employeeLogin, 'rephone_refresh');
    const admin = await login(server, 'ADMIN');
    const employee = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'employee@rephone.local' },
    });

    const [refresh, disabled] = await Promise.all([
      request(server)
        .post('/api/v1/auth/refresh')
        .set({
          Origin: 'http://localhost:3001',
          'X-Rephone-CSRF': '1',
          'Content-Type': 'application/json',
          Cookie: refreshCookie,
        })
        .send({}),
      request(server)
        .post(`/api/v1/backoffice/employees/${employee.id}/disable`)
        .set(bearer(admin))
        .send({ reason: 'Khóa tài khoản trong kiểm thử đồng thời' }),
    ]);

    expect(disabled.status).toBe(200);
    expect([200, 401]).toContain(refresh.status);
    await request(server).get('/api/v1/account').set(bearer(originalAccess)).expect(401);
    if (refresh.status === 200) {
      const refreshedAccess = stringProperty(successRecord(refresh), 'accessToken');
      await request(server).get('/api/v1/account').set(bearer(refreshedAccess)).expect(401);
    }
    expect(
      await prisma.authSession.count({ where: { userId: employee.id, revokedAt: null } }),
    ).toBe(0);
  });

  it('serializes invitation acceptance against resend so only one token path wins', async () => {
    const admin = await login(server, 'ADMIN');
    const rawToken = 'slice12-invitation-token-with-at-least-256-bits-0001';
    const employee = await prisma.user.create({
      data: {
        email: 'race.employee@example.com',
        normalizedEmail: 'race.employee@example.com',
        fullName: 'Race Employee',
        employeeCode: 'EMP-RACE',
        role: 'EMPLOYEE',
        status: 'PENDING_VERIFICATION',
      },
    });
    await prisma.authToken.create({
      data: {
        userId: employee.id,
        purpose: 'EMPLOYEE_INVITATION',
        tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const [accepted, resent] = await Promise.all([
      request(server)
        .post('/api/v1/auth/accept-employee-invitation')
        .send({ token: rawToken, password: 'EmployeeRace123' }),
      request(server)
        .post(`/api/v1/backoffice/employees/${employee.id}/resend-invitation`)
        .set(bearer(admin))
        .send({}),
    ]);

    expect(
      (accepted.status === 204 && resent.status === 409) ||
        (accepted.status === 422 && resent.status === 200),
    ).toBe(true);
    const current = await prisma.user.findUniqueOrThrow({ where: { id: employee.id } });
    const activeInvitations = await prisma.authToken.count({
      where: { userId: employee.id, purpose: 'EMPLOYEE_INVITATION', consumedAt: null },
    });
    if (current.status === 'ACTIVE') {
      expect(activeInvitations).toBe(0);
    } else {
      expect(current.status).toBe('PENDING_VERIFICATION');
      expect(activeInvitations).toBe(1);
    }
  });

  it('lets only admin suspend and activate a customer without exposing or mutating history', async () => {
    const employee = await login(server, 'EMPLOYEE');
    const customerAccess = await login(server, 'CUSTOMER');
    const admin = await login(server, 'ADMIN');
    const customer = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'customer@rephone.local' },
    });
    const addressCount = await prisma.customerAddress.count({ where: { userId: customer.id } });

    await request(server)
      .post(`/api/v1/backoffice/customers/${customer.id}/suspend`)
      .set(bearer(employee))
      .send({ reason: 'Kiểm tra bảo mật tài khoản' })
      .expect(403);

    const suspended = await request(server)
      .post(`/api/v1/backoffice/customers/${customer.id}/suspend`)
      .set(bearer(admin))
      .send({ reason: 'Kiểm tra bảo mật tài khoản' })
      .expect(200);
    expect(successRecord(suspended)).toMatchObject({ status: 'SUSPENDED' });
    await request(server).get('/api/v1/account').set(bearer(customerAccess)).expect(401);
    expect(await prisma.customerAddress.count({ where: { userId: customer.id } })).toBe(
      addressCount,
    );

    const activated = await request(server)
      .post(`/api/v1/backoffice/customers/${customer.id}/activate`)
      .set(bearer(admin))
      .send({ reason: 'Đã xác minh an toàn tài khoản' })
      .expect(200);
    expect(successRecord(activated)).toMatchObject({ status: 'ACTIVE', suspendedAt: null });
    expect(await prisma.auditLog.count({ where: { resourceId: customer.id } })).toBe(2);
  });
});

async function login(server: Server, role: 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER'): Promise<string> {
  const credentials = {
    ADMIN: ['admin@rephone.local', 'AdminDemo123'],
    EMPLOYEE: ['employee@rephone.local', 'EmployeeDemo123'],
    CUSTOMER: ['customer@rephone.local', 'CustomerDemo123'],
  } as const;
  const [email, password] = credentials[role];
  const response = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return stringProperty(successRecord(response), 'accessToken');
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function expectNoStore(response: Response): void {
  expect(response.headers['cache-control']).toBe('no-store');
}

function cookie(response: Response, name: string): string {
  const header: unknown = response.get('set-cookie');
  const cookies =
    typeof header === 'string'
      ? [header]
      : Array.isArray(header) && header.every((value) => typeof value === 'string')
        ? header
        : [];
  const match = cookies.find((value) => value.startsWith(`${name}=`));
  if (match === undefined) throw new Error(`Missing ${name} cookie`);
  return match.split(';', 1)[0] ?? match;
}

function successRecord(response: Response): Record<string, unknown> {
  return objectProperty(response.body as unknown, 'data');
}

function objectProperty(value: unknown, key: string): Record<string, unknown> {
  const source = record(value);
  const property = source[key];
  if (!isRecord(property)) throw new Error(`Expected ${key} to be an object`);
  return property;
}

function stringProperty(value: Record<string, unknown>, key: string): string {
  const property = value[key];
  if (typeof property !== 'string') throw new Error(`Expected ${key} to be a string`);
  return property;
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Expected an object');
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
