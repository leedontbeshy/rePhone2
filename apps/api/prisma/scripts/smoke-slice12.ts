import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  accessTokenSessionId,
  assertSlice12FullSmokeSafety,
  parseSlice12SmokeMode,
  type Slice12SmokeIdentityInput,
} from '../../src/release/slice12-smoke.policy.js';
import { seedDatabase } from '../seed-data.js';
import { findSlice12PreflightViolations } from './preflight-slice12.js';
import {
  arrayProperty,
  assertNoStore,
  data,
  errorCode,
  record,
  requiredEnvironment,
  Slice10ApiClient,
} from './slice10-script-support.js';

type SmokeActor = 'anonymous' | 'customer' | 'employee' | 'admin';
type SmokeRole = 'CUSTOMER' | 'EMPLOYEE' | 'ADMIN';

interface SmokeCredentials extends Slice12SmokeIdentityInput {
  adminPassword: string;
  employeePassword: string;
  customerPassword: string;
}

interface SmokeIdentityRecord {
  id: string;
  email: string;
  role: SmokeRole;
}

interface RoleProbe {
  name: string;
  path: string;
  method?: 'GET' | 'POST' | 'PATCH';
  jsonBody?: unknown;
  multipartExpectedVersion?: number;
  expected: Record<SmokeActor, number>;
}

const NON_EXISTENT_USER_ID = '0199ffff-ffff-7fff-8fff-ffffffffffff';
const FORBIDDEN_PUBLIC_STORE_KEYS = new Set([
  'bankname',
  'bankaccountnumber',
  'bankaccountholder',
  'bankqrbucket',
  'bankqrobjectpath',
  'bankqrurl',
  'version',
  'updatedby',
]);

export async function runSlice12Smoke(): Promise<void> {
  loadWorkspaceEnvironment();
  const mode = parseSlice12SmokeMode(process.env['SLICE12_SMOKE_MODE']);
  const identityInput = mode === 'smoke' ? optionalSmokeIdentityInput() : undefined;
  assertSlice12FullSmokeSafety({
    mode,
    ...(process.env['SLICE12_SMOKE_CONFIRM'] === undefined
      ? {}
      : { confirmation: process.env['SLICE12_SMOKE_CONFIRM'] }),
    ...(process.env['NODE_ENV'] === undefined ? {} : { nodeEnvironment: process.env['NODE_ENV'] }),
    ...(identityInput === undefined ? {} : { identities: identityInput }),
  });
  const credentials = mode === 'smoke' ? smokeCredentials() : undefined;

  const connectionString = requiredEnvironment('DATABASE_URL', 'Slice 12 smoke');
  const apiPublicUrl = requiredEnvironment('API_PUBLIC_URL', 'Slice 12 smoke');
  const webOrigin = requiredEnvironment('WEB_ORIGIN', 'Slice 12 smoke');
  const api = new Slice10ApiClient(apiPublicUrl);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  let smokeSessionIds: string[] = [];

  try {
    await assertHealth(apiPublicUrl, api);
    await assertPublicStore(api);
    const beforeChecks = await assertReadOnlyDatabaseSafety(prisma, 'before');
    if (mode === 'preflight') {
      writeResult({
        status: 'passed',
        mode,
        checks: ['health-live-ready', 'public-store-safe-projection', ...beforeChecks],
      });
      return;
    }

    if (credentials === undefined) throw new Error('Slice 12 smoke credentials are unavailable');
    const identities = await requireDedicatedIdentities(prisma, credentials);
    const tokens = await loginDedicatedIdentities(api, credentials, identities, webOrigin);
    smokeSessionIds = Object.values(tokens).map(accessTokenSessionId);
    const latestAudit = await prisma.auditLog.findFirst({
      select: { id: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (latestAudit === null) {
      throw new Error(
        'Slice 12 full smoke requires at least one existing AuditLog from an application command',
      );
    }

    const settings = await prisma.storeSettings.findUniqueOrThrow({ where: { key: 'STORE' } });
    const staleVersion = settings.version + 1;
    const settingsBefore = await settingsFingerprint(prisma);
    await assertExactRoleMatrix(api, tokens, {
      employeeId: roleIdentity(identities, 'EMPLOYEE').id,
      customerId: roleIdentity(identities, 'CUSTOMER').id,
      auditLogId: latestAudit.id,
      staleVersion,
      storeName: settings.storeName,
    });
    if ((await settingsFingerprint(prisma)) !== settingsBefore) {
      throw new Error('Stale StoreSettings CAS probe changed settings or wrote an audit record');
    }

    await assertAuditReadSafety(api, tokens.admin, latestAudit.id, [
      credentials.adminPassword,
      credentials.employeePassword,
      credentials.customerPassword,
      tokens.admin,
      tokens.employee,
      tokens.customer,
    ]);

    await seedDatabase(prisma);
    const seedBefore = await operationalFingerprint(prisma);
    await seedDatabase(prisma);
    await seedDatabase(prisma);
    if ((await operationalFingerprint(prisma)) !== seedBefore) {
      throw new Error('Running the seed twice changed the operational fingerprint');
    }
    const afterChecks = await assertReadOnlyDatabaseSafety(prisma, 'after');

    writeResult({
      status: 'passed',
      mode,
      checks: [
        'health-live-ready',
        'public-store-safe-projection',
        ...beforeChecks,
        'dedicated-admin-employee-customer-login',
        'exact-17-operation-role-matrix',
        'stale-settings-cas-non-mutating',
        'audit-no-store-request-id-redaction',
        'double-seed-operational-fingerprint',
        ...afterChecks,
      ],
    });
  } finally {
    if (smokeSessionIds.length > 0) {
      await prisma.authSession.deleteMany({
        where: { id: { in: smokeSessionIds } },
      });
    }
    await prisma.$disconnect();
  }
}

async function assertHealth(apiPublicUrl: string, api: Slice10ApiClient): Promise<void> {
  const live = await fetch(new URL('/health/live', apiPublicUrl));
  if (live.status !== 200) {
    throw new Error(`health/live: expected 200, received ${live.status.toString()}`);
  }
  await api.assertReady();
}

async function assertPublicStore(api: Slice10ApiClient): Promise<void> {
  const result = await api.call('/store', 200);
  const store = data(result.body);
  if (store['currency'] !== 'VND' || store['timezone'] !== 'Asia/Ho_Chi_Minh') {
    throw new Error('Public store returned an unsupported currency or timezone');
  }
  for (const field of ['storeName', 'storePhone', 'storeAddress'] as const) {
    if (typeof store[field] !== 'string' || store[field].trim().length === 0) {
      throw new Error(`Public store field ${field} is blank or missing`);
    }
  }
  const pickup = record(store['pickup']);
  if (
    typeof pickup['locationName'] !== 'string' ||
    typeof pickup['address'] !== 'string' ||
    typeof pickup['holdMinutes'] !== 'number'
  ) {
    throw new Error('Public store pickup projection is incomplete');
  }
  visitObjectKeys(store, (key) => {
    if (FORBIDDEN_PUBLIC_STORE_KEYS.has(normalizeKey(key))) {
      throw new Error(`Public store exposed forbidden field ${key}`);
    }
  });
}

async function assertReadOnlyDatabaseSafety(
  prisma: PrismaClient,
  stage: 'before' | 'after',
): Promise<string[]> {
  const violations = await findSlice12PreflightViolations(prisma);
  const failed = violations.filter(({ count }) => count !== 0);
  if (failed.length > 0) {
    throw new Error(
      `Slice 12 ${stage} preflight failed: ${failed
        .map(({ checkName, count }) => `${checkName}=${count.toString()}`)
        .join(', ')}`,
    );
  }
  const triggers = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM pg_trigger
    WHERE tgname = 'audit_logs_append_only'
      AND tgenabled <> 'D'
      AND NOT tgisinternal
  `;
  if (triggers[0]?.count !== 1) {
    throw new Error('AuditLog append-only trigger is missing or disabled');
  }
  return [
    ...violations.map(({ checkName }) => `${stage}-preflight:${checkName}`),
    `${stage}-audit-append-only-trigger`,
  ];
}

async function requireDedicatedIdentities(
  prisma: PrismaClient,
  credentials: SmokeCredentials,
): Promise<SmokeIdentityRecord[]> {
  const expected = [
    { email: credentials.adminEmail, role: 'ADMIN' as const },
    { email: credentials.employeeEmail, role: 'EMPLOYEE' as const },
    { email: credentials.customerEmail, role: 'CUSTOMER' as const },
  ];
  const identities: SmokeIdentityRecord[] = [];
  for (const input of expected) {
    const found = await prisma.user.findUnique({
      where: { normalizedEmail: input.email.trim().toLowerCase() },
      select: { id: true, email: true, role: true, status: true, passwordHash: true },
    });
    if (
      found === null ||
      found.role !== input.role ||
      found.status !== 'ACTIVE' ||
      found.passwordHash === null
    ) {
      throw new Error(`Dedicated ${input.role} smoke identity is missing or not ACTIVE`);
    }
    identities.push({ id: found.id, email: found.email, role: found.role });
  }
  return identities;
}

async function loginDedicatedIdentities(
  api: Slice10ApiClient,
  credentials: SmokeCredentials,
  identities: readonly SmokeIdentityRecord[],
  webOrigin: string,
): Promise<Record<Exclude<SmokeActor, 'anonymous'>, string>> {
  const tokens = {
    admin: await api.login(credentials.adminEmail, credentials.adminPassword, webOrigin),
    employee: await api.login(credentials.employeeEmail, credentials.employeePassword, webOrigin),
    customer: await api.login(credentials.customerEmail, credentials.customerPassword, webOrigin),
  };
  for (const actor of ['admin', 'employee', 'customer'] as const) {
    const expectedRole = actor.toUpperCase() as SmokeRole;
    const identity = roleIdentity(identities, expectedRole);
    const account = await callWithRequestId(api, '/account', 200, tokens[actor]);
    const projection = data(account.body);
    if (projection['id'] !== identity.id || projection['role'] !== expectedRole) {
      throw new Error(`Dedicated ${expectedRole} login returned the wrong account projection`);
    }
  }
  return tokens;
}

async function assertExactRoleMatrix(
  api: Slice10ApiClient,
  tokens: Record<Exclude<SmokeActor, 'anonymous'>, string>,
  input: {
    employeeId: string;
    customerId: string;
    auditLogId: string;
    staleVersion: number;
    storeName: string;
  },
): Promise<void> {
  const adminOnly = { anonymous: 401, customer: 403, employee: 403, admin: 200 };
  const customerRead = { anonymous: 401, customer: 403, employee: 200, admin: 200 };
  const adminMissing = { anonymous: 401, customer: 403, employee: 403, admin: 404 };
  const customerMutationMissing = { anonymous: 401, customer: 403, employee: 403, admin: 404 };
  const probes: RoleProbe[] = [
    {
      name: 'list employees',
      path: '/backoffice/employees?page=1&pageSize=1',
      expected: adminOnly,
    },
    {
      name: 'create employee',
      path: '/backoffice/employees',
      method: 'POST',
      jsonBody: {},
      expected: { ...adminOnly, admin: 400 },
    },
    {
      name: 'employee detail',
      path: `/backoffice/employees/${input.employeeId}`,
      expected: adminOnly,
    },
    {
      name: 'update employee',
      path: `/backoffice/employees/${NON_EXISTENT_USER_ID}`,
      method: 'PATCH',
      jsonBody: { fullName: 'Slice 12 Smoke Probe' },
      expected: adminMissing,
    },
    {
      name: 'resend invitation',
      path: `/backoffice/employees/${NON_EXISTENT_USER_ID}/resend-invitation`,
      method: 'POST',
      expected: adminMissing,
    },
    {
      name: 'disable employee',
      path: `/backoffice/employees/${NON_EXISTENT_USER_ID}/disable`,
      method: 'POST',
      jsonBody: { reason: 'Slice 12 smoke permission probe' },
      expected: adminMissing,
    },
    {
      name: 'enable employee',
      path: `/backoffice/employees/${NON_EXISTENT_USER_ID}/enable`,
      method: 'POST',
      jsonBody: { reason: 'Slice 12 smoke permission probe' },
      expected: adminMissing,
    },
    {
      name: 'list customers',
      path: '/backoffice/customers?page=1&pageSize=1',
      expected: customerRead,
    },
    {
      name: 'customer detail',
      path: `/backoffice/customers/${input.customerId}`,
      expected: customerRead,
    },
    {
      name: 'suspend customer',
      path: `/backoffice/customers/${NON_EXISTENT_USER_ID}/suspend`,
      method: 'POST',
      jsonBody: { reason: 'Slice 12 smoke permission probe' },
      expected: customerMutationMissing,
    },
    {
      name: 'activate customer',
      path: `/backoffice/customers/${NON_EXISTENT_USER_ID}/activate`,
      method: 'POST',
      jsonBody: { reason: 'Slice 12 smoke permission probe' },
      expected: customerMutationMissing,
    },
    {
      name: 'public store',
      path: '/store',
      expected: { anonymous: 200, customer: 200, employee: 200, admin: 200 },
    },
    { name: 'get settings', path: '/backoffice/settings', expected: adminOnly },
    {
      name: 'update settings stale CAS',
      path: '/backoffice/settings',
      method: 'PATCH',
      jsonBody: { expectedVersion: input.staleVersion, storeName: input.storeName },
      expected: { ...adminOnly, admin: 409 },
    },
    {
      name: 'upload bank QR stale CAS',
      path: '/backoffice/settings/bank-qr',
      method: 'POST',
      multipartExpectedVersion: input.staleVersion,
      expected: { ...adminOnly, admin: 409 },
    },
    {
      name: 'list audit logs',
      path: '/backoffice/audit-logs?page=1&pageSize=1',
      expected: adminOnly,
    },
    {
      name: 'audit detail',
      path: `/backoffice/audit-logs/${input.auditLogId}`,
      expected: adminOnly,
    },
  ];
  if (probes.length !== 17) throw new Error('Slice 12 role matrix must contain exactly 17 probes');

  for (const probe of probes) {
    for (const actor of ['anonymous', 'customer', 'employee', 'admin'] as const) {
      const expectedStatus = probe.expected[actor];
      const requestId = randomUUID();
      const response = await api.call(
        probe.path,
        expectedStatus,
        probeRequest(probe, actor === 'anonymous' ? undefined : tokens[actor], requestId),
      );
      assertResponseRequestId(response.response, requestId, `${probe.name}/${actor}`);
      if (probe.path.startsWith('/backoffice/')) {
        assertNoStore(response.response, `${probe.name}/${actor}`);
      }
      if (expectedStatus >= 400) {
        assertExpectedError(response.body, expectedStatus, requestId, `${probe.name}/${actor}`);
      } else {
        assertSuccessEnvelope(response.body, probe.name);
      }
    }
  }
}

function probeRequest(probe: RoleProbe, token: string | undefined, requestId: string): RequestInit {
  const headers: Record<string, string> = { 'X-Request-Id': requestId };
  const method = probe.method ?? 'GET';
  if (token !== undefined) headers['Authorization'] = `Bearer ${token}`;
  if (probe.multipartExpectedVersion !== undefined) {
    const form = new FormData();
    form.append('expectedVersion', probe.multipartExpectedVersion.toString());
    return { method, headers, body: form };
  }
  if (probe.jsonBody !== undefined) {
    headers['Content-Type'] = 'application/json';
    return { method, headers, body: JSON.stringify(probe.jsonBody) };
  }
  return { method, headers };
}

async function assertAuditReadSafety(
  api: Slice10ApiClient,
  adminToken: string,
  auditLogId: string,
  sensitiveValues: readonly string[],
): Promise<void> {
  const list = await callWithRequestId(
    api,
    '/backoffice/audit-logs?page=1&pageSize=100',
    200,
    adminToken,
  );
  assertNoStore(list.response, 'audit list');
  const entries = arrayProperty(record(list.body), 'data').map(record);
  if (entries.length === 0) throw new Error('Audit list returned no rows');
  for (const entry of entries) {
    if ('ipAddress' in entry || 'userAgent' in entry) {
      throw new Error('Audit list exposed IP address or user-agent');
    }
    assertAuditJsonSafe(entry['changes']);
    assertAuditJsonSafe(entry['metadata']);
  }

  const detail = await callWithRequestId(
    api,
    `/backoffice/audit-logs/${auditLogId}`,
    200,
    adminToken,
  );
  assertNoStore(detail.response, 'audit detail');
  const detailData = data(detail.body);
  assertAuditJsonSafe(detailData['changes']);
  assertAuditJsonSafe(detailData['metadata']);
  const serialized = JSON.stringify([list.body, detail.body]);
  if (sensitiveValues.some((value) => value.length > 0 && serialized.includes(value))) {
    throw new Error('Audit response exposed a smoke credential or access token');
  }
}

async function callWithRequestId(
  api: Slice10ApiClient,
  path: string,
  expectedStatus: number,
  token?: string,
) {
  const requestId = randomUUID();
  const result = await api.call(path, expectedStatus, {
    headers: {
      'X-Request-Id': requestId,
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    },
  });
  assertResponseRequestId(result.response, requestId, path);
  return result;
}

function assertResponseRequestId(response: Response, expected: string, label: string): void {
  if (response.headers.get('x-request-id') !== expected) {
    throw new Error(`${label}: response request ID did not match the accepted request ID`);
  }
}

function assertExpectedError(
  body: unknown,
  status: number,
  requestId: string,
  label: string,
): void {
  const expectedCode = new Map<number, readonly string[]>([
    [400, ['VALIDATION_FAILED']],
    [401, ['AUTH_REQUIRED', 'ACCESS_TOKEN_INVALID']],
    [403, ['FORBIDDEN']],
    [404, ['RESOURCE_NOT_FOUND']],
    [409, ['SETTINGS_VERSION_CONFLICT']],
  ]).get(status);
  const actualCode = errorCode(body);
  if (expectedCode === undefined || !expectedCode.includes(actualCode)) {
    throw new Error(`${label}: unexpected error code ${actualCode}`);
  }
  const envelope = record(record(body)['error']);
  if (envelope['requestId'] !== requestId) {
    throw new Error(`${label}: error envelope request ID did not match its response header`);
  }
}

function assertSuccessEnvelope(body: unknown, label: string): void {
  const envelope = record(body);
  if (!('data' in envelope)) throw new Error(`${label}: success response is missing data`);
  if (Array.isArray(envelope['data'])) {
    const meta = record(envelope['meta']);
    record(meta['pagination']);
  }
}

function assertAuditJsonSafe(value: unknown): void {
  visitObjectKeys(value, (key) => {
    const normalized = normalizeKey(key);
    if (
      [
        'authorization',
        'apikey',
        'bankaccount',
        'bankaccountnumber',
        'ciphertext',
        'contact',
        'contactsnapshot',
        'cookie',
        'customername',
        'eid',
        'encryptionkey',
        'evidencebucket',
        'evidencedigest',
        'evidenceobjectpath',
        'evidencepath',
        'evidencesha256',
        'evidenceurl',
        'imei',
        'imei1',
        'imei2',
        'identifier',
        'identifiervalue',
        'objectpath',
        'rawidentifier',
        'serial',
        'servicerolekey',
        'shippingaddress',
        'shippingaddresssnapshot',
        'signedurl',
        'sha256',
      ].includes(normalized) ||
      [
        'password',
        'token',
        'cookie',
        'secret',
        'credential',
        'authorization',
        'hmac',
        'cipher',
      ].some((fragment) => normalized.includes(fragment)) ||
      ['hash', 'digest', 'signedurl', 'objectpath', 'bucket', 'address', 'email', 'phone'].some(
        (suffix) => normalized.endsWith(suffix),
      )
    ) {
      throw new Error(`Audit response exposed forbidden field ${key}`);
    }
  });
}

async function settingsFingerprint(prisma: PrismaClient): Promise<string> {
  const [settings, updateAuditCount, qrAuditCount] = await Promise.all([
    prisma.storeSettings.findUniqueOrThrow({ where: { key: 'STORE' } }),
    prisma.auditLog.count({ where: { action: 'settings.updated' } }),
    prisma.auditLog.count({ where: { action: 'settings.bank_qr_updated' } }),
  ]);
  return hashValue({ settings, updateAuditCount, qrAuditCount });
}

async function operationalFingerprint(prisma: PrismaClient): Promise<string> {
  const snapshot = await Promise.all([
    prisma.storeSettings.findMany({ orderBy: { id: 'asc' } }),
    prisma.user.findMany({
      select: {
        id: true,
        role: true,
        status: true,
        employeeCode: true,
        hiredAt: true,
        emailVerifiedAt: true,
        passwordChangedAt: true,
        lastLoginAt: true,
        suspendedAt: true,
        disabledAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { id: 'asc' },
    }),
    prisma.cart.findMany({
      select: { id: true, customerId: true, status: true, expiresAt: true, updatedAt: true },
      orderBy: { id: 'asc' },
    }),
    prisma.order.findMany({
      select: {
        id: true,
        status: true,
        fulfillmentStatus: true,
        paymentStatus: true,
        pickupHoldUntil: true,
        pickupReadyAt: true,
        pickedUpAt: true,
        confirmedAt: true,
        completedAt: true,
        cancelledAt: true,
        updatedAt: true,
      },
      orderBy: { id: 'asc' },
    }),
    prisma.payment.findMany({
      select: {
        id: true,
        status: true,
        expiresAt: true,
        submittedAt: true,
        reviewedAt: true,
        evidenceBucket: true,
        evidenceObjectPath: true,
        updatedAt: true,
      },
      orderBy: { id: 'asc' },
    }),
    prisma.refund.findMany({
      select: {
        id: true,
        status: true,
        processingAt: true,
        completedAt: true,
        terminalAt: true,
        evidenceBucket: true,
        evidenceObjectPath: true,
        updatedAt: true,
      },
      orderBy: { id: 'asc' },
    }),
    prisma.inventoryReservation.findMany({
      select: {
        id: true,
        status: true,
        holdReason: true,
        expiresAt: true,
        releasedAt: true,
        consumedAt: true,
      },
      orderBy: { id: 'asc' },
    }),
    prisma.shipment.findMany({
      select: {
        id: true,
        status: true,
        shippedAt: true,
        deliveredAt: true,
        failedAt: true,
        returnedAt: true,
        updatedAt: true,
      },
      orderBy: { id: 'asc' },
    }),
    prisma.warranty.findMany({
      select: {
        id: true,
        inventoryUnitId: true,
        status: true,
        startAt: true,
        endAt: true,
        voidedAt: true,
        updatedAt: true,
      },
      orderBy: { id: 'asc' },
    }),
    prisma.afterSalesRequest.findMany({
      select: {
        id: true,
        status: true,
        attachments: true,
        inventoryInspectionId: true,
        replacementInventoryUnitId: true,
        refundId: true,
        receivedAt: true,
        inspectedAt: true,
        resolvedAt: true,
        returnedAt: true,
        cancelledAt: true,
        updatedAt: true,
      },
      orderBy: { id: 'asc' },
    }),
    prisma.inventoryUnit.findMany({
      select: {
        id: true,
        locationId: true,
        lifecycleStatus: true,
        soldAt: true,
        updatedAt: true,
      },
      orderBy: { id: 'asc' },
    }),
    prisma.inventoryInspection.findMany({
      select: {
        id: true,
        status: true,
        overallResult: true,
        inspectedAt: true,
        isCurrent: true,
        updatedAt: true,
      },
      orderBy: { id: 'asc' },
    }),
    prisma.stockLevel.findMany({
      select: { id: true, quantityOnHand: true, quantityReserved: true, updatedAt: true },
      orderBy: { id: 'asc' },
    }),
    prisma.voucher.findMany({
      select: { id: true, status: true, startsAt: true, endsAt: true, updatedAt: true },
      orderBy: { id: 'asc' },
    }),
    prisma.voucherUsage.findMany({
      select: { id: true, status: true, consumedAt: true, releasedAt: true },
      orderBy: { id: 'asc' },
    }),
    prisma.warrantyPolicy.findMany({
      select: { id: true, status: true, archivedAt: true, updatedAt: true },
      orderBy: { id: 'asc' },
    }),
    prisma.auditLog.count(),
  ]);
  return hashValue(snapshot);
}

function roleIdentity(
  identities: readonly SmokeIdentityRecord[],
  role: SmokeRole,
): SmokeIdentityRecord {
  const identity = identities.find((candidate) => candidate.role === role);
  if (identity === undefined) throw new Error(`Missing dedicated ${role} smoke identity`);
  return identity;
}

function smokeCredentials(): SmokeCredentials {
  return {
    adminEmail: requiredEnvironment('SLICE12_SMOKE_ADMIN_EMAIL', 'Slice 12 full smoke'),
    adminPassword: requiredEnvironment('SLICE12_SMOKE_ADMIN_PASSWORD', 'Slice 12 full smoke'),
    employeeEmail: requiredEnvironment('SLICE12_SMOKE_EMPLOYEE_EMAIL', 'Slice 12 full smoke'),
    employeePassword: requiredEnvironment('SLICE12_SMOKE_EMPLOYEE_PASSWORD', 'Slice 12 full smoke'),
    customerEmail: requiredEnvironment('SLICE12_SMOKE_CUSTOMER_EMAIL', 'Slice 12 full smoke'),
    customerPassword: requiredEnvironment('SLICE12_SMOKE_CUSTOMER_PASSWORD', 'Slice 12 full smoke'),
  };
}

function optionalSmokeIdentityInput(): Slice12SmokeIdentityInput | undefined {
  const adminEmail = process.env['SLICE12_SMOKE_ADMIN_EMAIL']?.trim();
  const employeeEmail = process.env['SLICE12_SMOKE_EMPLOYEE_EMAIL']?.trim();
  const customerEmail = process.env['SLICE12_SMOKE_CUSTOMER_EMAIL']?.trim();
  if (
    adminEmail === undefined ||
    adminEmail.length === 0 ||
    employeeEmail === undefined ||
    employeeEmail.length === 0 ||
    customerEmail === undefined ||
    customerEmail.length === 0
  ) {
    return undefined;
  }
  return { adminEmail, employeeEmail, customerEmail };
}

function hashValue(value: unknown): string {
  return createHash('sha256')
    .update(
      JSON.stringify(value, (_key, candidate: unknown) =>
        typeof candidate === 'bigint' ? candidate.toString() : candidate,
      ),
    )
    .digest('hex');
}

function visitObjectKeys(value: unknown, visitor: (key: string) => void): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      visitObjectKeys(entry, visitor);
    });
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, nested] of Object.entries(value)) {
    visitor(key);
    visitObjectKeys(nested, visitor);
  }
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function writeResult(result: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && import.meta.url === pathToFileURL(resolve(entrypoint)).href;
}

if (isMainModule()) await runSlice12Smoke();
