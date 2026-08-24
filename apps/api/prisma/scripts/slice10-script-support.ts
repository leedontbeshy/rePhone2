import type { PrismaClient } from '../../src/generated/prisma/client.js';

export interface ScriptIdentity {
  customerId: string;
  employeeId: string;
  customerEmail: string;
  customerToken: string;
  employeeToken: string;
}

export interface CompletedPickupOrder {
  id: string;
  orderNumber: string;
  grandTotal: string;
  paymentId: string;
}

export interface ApiCallResult {
  response: Response;
  body: unknown;
}

export class Slice10ApiClient {
  private readonly baseUrl: string;
  private readonly origin: string;

  public constructor(apiPublicUrl: string) {
    this.baseUrl = new URL('/api/v1', apiPublicUrl).href.replace(/\/$/, '');
    this.origin = new URL(apiPublicUrl).origin;
  }

  public async assertReady(): Promise<void> {
    const response = await fetch(`${this.origin}/health/ready`);
    if (response.status !== 200) {
      throw new Error(`health/ready: expected 200, received ${response.status.toString()}`);
    }
  }

  public async login(email: string, password: string, webOrigin: string): Promise<string> {
    const result = await this.call('/auth/login', 200, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: webOrigin },
      body: JSON.stringify({ email, password }),
    });
    return stringProperty(data(result.body), 'accessToken');
  }

  public call(
    path: string,
    expectedStatus: number | readonly number[],
    init?: RequestInit,
  ): Promise<ApiCallResult> {
    return call(this.baseUrl, path, expectedStatus, init);
  }
}

export async function prepareScriptIdentity(
  prisma: PrismaClient,
  api: Slice10ApiClient,
  input: {
    customerEmail: string;
    employeeEmail: string;
    employeeCode: string;
    label: string;
    webOrigin: string;
    seedCustomerEmail: string;
    seedCustomerPassword: string;
    seedEmployeeEmail: string;
    seedEmployeePassword: string;
  },
): Promise<ScriptIdentity> {
  const [seedCustomer, seedEmployee] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: input.seedCustomerEmail.trim().toLowerCase() },
      select: { passwordHash: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: input.seedEmployeeEmail.trim().toLowerCase() },
      select: { passwordHash: true },
    }),
  ]);
  if (seedCustomer.passwordHash === null || seedEmployee.passwordHash === null) {
    throw new Error('Seed identities must have password hashes before Slice 10 scripts run');
  }

  const now = new Date();
  const [customer, employee] = await Promise.all([
    prisma.user.upsert({
      where: { normalizedEmail: input.customerEmail },
      update: {
        email: input.customerEmail,
        passwordHash: seedCustomer.passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        fullName: `${input.label} Customer`,
        employeeCode: null,
        hiredAt: null,
        disabledAt: null,
        suspendedAt: null,
      },
      create: {
        email: input.customerEmail,
        normalizedEmail: input.customerEmail,
        passwordHash: seedCustomer.passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        fullName: `${input.label} Customer`,
        emailVerifiedAt: now,
      },
      select: { id: true },
    }),
    prisma.user.upsert({
      where: { normalizedEmail: input.employeeEmail },
      update: {
        email: input.employeeEmail,
        passwordHash: seedEmployee.passwordHash,
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        fullName: `${input.label} Employee`,
        employeeCode: input.employeeCode,
        hiredAt: new Date('2026-08-24T00:00:00.000Z'),
        disabledAt: null,
        suspendedAt: null,
      },
      create: {
        email: input.employeeEmail,
        normalizedEmail: input.employeeEmail,
        passwordHash: seedEmployee.passwordHash,
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        fullName: `${input.label} Employee`,
        employeeCode: input.employeeCode,
        hiredAt: new Date('2026-08-24T00:00:00.000Z'),
        emailVerifiedAt: now,
      },
      select: { id: true },
    }),
  ]);
  const [customerToken, employeeToken] = await Promise.all([
    api.login(input.customerEmail, input.seedCustomerPassword, input.webOrigin),
    api.login(input.employeeEmail, input.seedEmployeePassword, input.webOrigin),
  ]);
  await Promise.all([
    assertApiIdentity(api, customerToken, customer.id, 'CUSTOMER'),
    assertApiIdentity(api, employeeToken, employee.id, 'EMPLOYEE'),
  ]);
  return {
    customerId: customer.id,
    employeeId: employee.id,
    customerEmail: input.customerEmail,
    customerToken,
    employeeToken,
  };
}

export async function createCompletedPickupOrder(
  prisma: PrismaClient,
  api: Slice10ApiClient,
  identity: ScriptIdentity,
  input: { variantSku: string; marker: string },
): Promise<CompletedPickupOrder> {
  await clearCart(api, identity.customerToken);
  const variantId = await findPickupAccessory(api, input.variantSku);
  await api.call(
    '/cart/items',
    [200, 201],
    authenticated(identity.customerToken, 'POST', {
      itemType: 'ACCESSORY',
      variantId,
      quantity: 1,
    }),
  );
  const preview = data(
    (
      await api.call(
        '/checkouts/preview',
        200,
        authenticated(identity.customerToken, 'POST', { fulfillmentType: 'PICKUP' }),
      )
    ).body,
  );
  const pricing = recordProperty(preview, 'pricing');
  const grandTotal = stringProperty(pricing, 'grandTotal');
  if (BigInt(grandTotal) <= 0n) {
    throw new Error('Slice 10 refund fixtures require a positive pickup total');
  }
  const created = await api.call(
    '/checkouts',
    201,
    authenticated(identity.customerToken, 'POST', {
      fulfillmentType: 'PICKUP',
      contact: {
        fullName: 'Slice 10 Fixture Customer',
        email: identity.customerEmail,
        phone: '0900000000',
      },
      customerNote: input.marker,
      expectedCartUpdatedAt: stringProperty(preview, 'cartUpdatedAt'),
      expectedGrandTotal: grandTotal,
      expectedDepositRequired: stringProperty(pricing, 'depositRequired'),
    }),
  );
  assertNoStore(created.response, '/checkouts');
  const order = recordProperty(data(created.body), 'order');
  const orderId = stringProperty(order, 'id');
  const orderNumber = stringProperty(order, 'orderNumber');

  await api.call(
    `/backoffice/orders/${orderId}/confirm`,
    200,
    authenticated(identity.employeeToken, 'POST'),
  );
  await api.call(
    `/backoffice/orders/${orderId}/start-preparing`,
    200,
    authenticated(identity.employeeToken, 'POST'),
  );
  await api.call(
    `/backoffice/orders/${orderId}/mark-pickup-ready`,
    200,
    authenticated(identity.employeeToken, 'POST'),
  );
  const completed = await api.call(
    `/backoffice/orders/${orderId}/complete-pickup`,
    200,
    authenticated(identity.employeeToken, 'POST', { confirmCashCollected: true }),
  );
  assertNoStore(completed.response, `/backoffice/orders/${orderId}/complete-pickup`);

  const persisted = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: true },
  });
  const payment = only(
    persisted.payments.filter(
      ({ purpose, method, status }) =>
        purpose === 'FULL_PAYMENT' && method === 'CASH' && status === 'VERIFIED',
    ),
    `${orderNumber}: expected exactly one verified CASH payment`,
  );
  if (
    persisted.status !== 'COMPLETED' ||
    persisted.fulfillmentStatus !== 'COMPLETED' ||
    persisted.paymentStatus !== 'PAID' ||
    persisted.grandTotal.toString() !== grandTotal ||
    persisted.paidAmount.toString() !== grandTotal ||
    persisted.refundedAmount.toString() !== '0'
  ) {
    throw new Error(`${orderNumber}: completed pickup finance is inconsistent`);
  }
  return { id: orderId, orderNumber, grandTotal, paymentId: payment.id };
}

export async function deleteScriptSessions(
  prisma: PrismaClient,
  userIds: readonly string[],
  createdAt: Date,
): Promise<void> {
  await prisma.authSession.deleteMany({
    where: { userId: { in: [...userIds] }, createdAt: { gte: createdAt } },
  });
}

export function authenticated(token: string, method = 'GET', body?: unknown): RequestInit {
  return {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

export function multipart(
  token: string,
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
  note: string,
): RequestInit {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeType }), filename);
  form.append('note', note);
  return { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form };
}

export function data(body: unknown): Record<string, unknown> {
  return recordProperty(record(body), 'data');
}

export function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Expected an object');
  return value;
}

export function recordProperty(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  return record(value[key]);
}

export function arrayProperty(value: Record<string, unknown>, key: string): unknown[] {
  const property = value[key];
  if (!Array.isArray(property)) throw new Error(`Expected ${key} to be an array`);
  return property;
}

export function stringProperty(value: Record<string, unknown>, key: string): string {
  const property = value[key];
  if (typeof property !== 'string') throw new Error(`Expected ${key} to be a string`);
  return property;
}

export function stringArrayProperty(value: Record<string, unknown>, key: string): string[] {
  const property = arrayProperty(value, key);
  if (!property.every((item): item is string => typeof item === 'string')) {
    throw new Error(`Expected ${key} to be a string array`);
  }
  return property;
}

export function assertNoStore(response: Response, path: string): void {
  const cacheControl = response.headers.get('cache-control')?.toLowerCase() ?? '';
  if (!cacheControl.includes('no-store')) {
    throw new Error(`${path}: response is missing Cache-Control no-store`);
  }
}

export function assertNoForbiddenProjectionKeys(value: unknown): void {
  const forbidden = new Set([
    'evidenceBucket',
    'evidenceObjectPath',
    'evidenceMimeType',
    'evidenceFileSize',
    'evidenceSha256',
    'processedById',
    'terminalById',
    'note',
  ]);
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!isRecord(candidate)) return;
    for (const [key, nested] of Object.entries(candidate)) {
      if (forbidden.has(key)) throw new Error(`Public response exposed forbidden field ${key}`);
      visit(nested);
    }
  };
  visit(value);
}

export function requiredEnvironment(name: string, purpose = 'Slice 10 script'): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for ${purpose}`);
  }
  return value;
}

export function databaseName(connectionString: string): string {
  const pathname = new URL(connectionString).pathname;
  const name = decodeURIComponent(pathname.slice(pathname.lastIndexOf('/') + 1));
  if (name.length === 0) throw new Error('DATABASE_URL does not contain a database name');
  return name;
}

export function errorCode(body: unknown): string {
  if (!isRecord(body) || !isRecord(body['error']) || typeof body['error']['code'] !== 'string') {
    return 'UNKNOWN_ERROR';
  }
  return body['error']['code'];
}

async function assertApiIdentity(
  api: Slice10ApiClient,
  token: string,
  expectedId: string,
  expectedRole: 'CUSTOMER' | 'EMPLOYEE',
): Promise<void> {
  const account = data((await api.call('/account', 200, authenticated(token))).body);
  if (account['id'] !== expectedId || account['role'] !== expectedRole) {
    throw new Error('API_PUBLIC_URL and DATABASE_URL do not resolve the same Slice 10 target');
  }
}

async function clearCart(api: Slice10ApiClient, customerToken: string): Promise<void> {
  const cart = data((await api.call('/cart', 200, authenticated(customerToken))).body);
  for (const item of arrayProperty(cart, 'items').map(record)) {
    await api.call(
      `/cart/items/${stringProperty(item, 'id')}`,
      204,
      authenticated(customerToken, 'DELETE'),
    );
  }
}

async function findPickupAccessory(api: Slice10ApiClient, configuredSku: string): Promise<string> {
  for (let page = 1; page <= 10; page += 1) {
    const response = await api.call(
      `/products?productType=ACCESSORY&page=${page.toString()}&pageSize=100`,
      200,
    );
    const rows = arrayProperty(record(response.body), 'data');
    if (rows.length === 0) break;
    for (const row of rows.map(record)) {
      const slug = stringProperty(row, 'slug');
      const product = data((await api.call(`/products/${encodeURIComponent(slug)}`, 200)).body);
      for (const variant of arrayProperty(product, 'variants').map(record)) {
        if (stringProperty(variant, 'sku') !== configuredSku) continue;
        const availability = recordProperty(variant, 'fulfillmentAvailability');
        if (availability['inStock'] === true && availability['pickup'] === true) {
          return stringProperty(variant, 'id');
        }
      }
    }
  }
  throw new Error(
    `Configured Slice 10 variant ${configuredSku} is not public, pickup-capable and available`,
  );
}

async function call(
  baseUrl: string,
  path: string,
  expectedStatus: number | readonly number[],
  init?: RequestInit,
): Promise<ApiCallResult> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = response.status === 204 ? '' : await response.text();
  const body: unknown = text.length === 0 ? null : parseJson(text, path);
  const accepted = Array.isArray(expectedStatus)
    ? expectedStatus.includes(response.status)
    : response.status === expectedStatus;
  if (!accepted) {
    throw new Error(
      `${path}: expected ${(Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus]).join('|')}, received ${response.status.toString()} (${errorCode(body)})`,
    );
  }
  return { response, body };
}

function parseJson(value: string, path: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${path}: response was not valid JSON`);
  }
}

function only<T>(values: readonly T[], message: string): T {
  if (values.length !== 1 || values[0] === undefined) throw new Error(message);
  return values[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
