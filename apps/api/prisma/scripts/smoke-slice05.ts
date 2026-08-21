import { createHash } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';

loadWorkspaceEnvironment();

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString.length === 0) {
  throw new Error('DATABASE_URL is required for the Slice 05 smoke test');
}

const apiBaseUrl = new URL(
  '/api/v1',
  process.env.API_PUBLIC_URL ?? 'http://localhost:4000',
).href.replace(/\/$/, '');
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const suffix = Date.now().toString();
const smokeEmail = `slice05-smoke-${suffix}@example.com`;
const normalizedSmokeEmail = smokeEmail.toLowerCase();
const smokePassword = 'Slice05Smoke123';
const smokeVoucherCode = `S05-${suffix}`;
const guestTokenHashes: string[] = [];
const smokeStartedAt = new Date();
let smokeVoucherId: string | undefined;

try {
  const reservationsBefore = await prisma.inventoryReservation.count();
  const emptyCart = await call('/cart', 200);
  if (recordProperty(data(emptyCart.body), 'id') !== null) {
    throw new Error('Guest GET cart created a persisted identity');
  }
  if (emptyCart.response.headers.get('set-cookie') !== null) {
    throw new Error('Guest GET cart unexpectedly set a cookie');
  }

  const products = await call('/products?productType=ACCESSORY&page=1&pageSize=10', 200);
  const firstProduct = record(arrayProperty(record(products.body), 'data')[0]);
  const slug = stringProperty(firstProduct, 'slug');
  const product = await call(`/products/${slug}`, 200);
  const variant = arrayProperty(data(product.body), 'variants')
    .map(record)
    .find((candidate) =>
      recordProperty(record(recordProperty(candidate, 'fulfillmentAvailability')), 'inStock'),
    );
  if (variant === undefined) throw new Error('No public in-stock accessory variant is available');
  const variantId = stringProperty(variant, 'id');

  let created = await call(
    '/cart/items',
    201,
    jsonMutation({ itemType: 'ACCESSORY', variantId, quantity: 2 }),
  );
  const guestCookie = validateGuestCookie(created.response);
  guestTokenHashes.push(await assertGuestTokenHashed(guestCookie));

  const guestHeaders = mutationHeaders(guestCookie);
  const updated = await call('/cart/items', 200, {
    method: 'POST',
    headers: guestHeaders,
    body: JSON.stringify({ itemType: 'ACCESSORY', variantId, quantity: 3 }),
  });
  const updatedItems = arrayProperty(data(updated.body), 'items');
  if (updatedItems.length !== 1 || numberProperty(record(updatedItems[0]), 'quantity') !== 3) {
    throw new Error('Cart add did not preserve set-quantity semantics');
  }
  const firstItemId = stringProperty(record(updatedItems[0]), 'id');
  await call(`/cart/items/${firstItemId}`, 200, {
    method: 'PATCH',
    headers: guestHeaders,
    body: JSON.stringify({ quantity: 4 }),
  });
  await call(`/cart/items/${firstItemId}`, 204, {
    method: 'DELETE',
    headers: guestHeaders,
    body: '{}',
  });

  created = await call(
    '/cart/items',
    201,
    jsonMutation({ itemType: 'ACCESSORY', variantId, quantity: 2 }),
  );
  const mergeCookie = validateGuestCookie(created.response);
  guestTokenHashes.push(await assertGuestTokenHashed(mergeCookie));

  await call('/auth/register', 201, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: smokeEmail,
      password: smokePassword,
      fullName: 'Slice 05 Smoke',
    }),
  });
  const customerToken = await login(smokeEmail, smokePassword, mergeCookie);
  const merged = await call('/cart/merge', 200, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${customerToken}`,
      Cookie: mergeCookie,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const mergedItems = arrayProperty(data(merged.body), 'items');
  if (mergedItems.length !== 1 || numberProperty(record(mergedItems[0]), 'quantity') !== 2) {
    throw new Error('Customer cart merge was not deterministic');
  }

  const wishlistCreated = await call(
    '/wishlist/items',
    201,
    authenticated(customerToken, 'POST', { itemType: 'ACCESSORY', variantId }),
  );
  const wishlistItemId = stringProperty(data(wishlistCreated.body), 'id');
  const wishlist = await call('/wishlist', 200, authenticated(customerToken));
  if (
    arrayProperty(record(wishlist.body), 'data').length !== 1 ||
    wishlist.response.headers.get('cache-control') !== 'no-store'
  ) {
    throw new Error('Wishlist projection or no-store policy failed');
  }
  await call(`/wishlist/items/${wishlistItemId}`, 204, authenticated(customerToken, 'DELETE'));

  const guestVouchers = voucherCodes(await call('/vouchers?page=1&pageSize=20', 200));
  if (!guestVouchers.includes('WELCOME100') || guestVouchers.includes('IPHONE5')) {
    throw new Error('Guest voucher visibility failed');
  }
  const customerVouchers = voucherCodes(
    await call('/vouchers?page=1&pageSize=20', 200, authenticated(customerToken)),
  );
  if (!customerVouchers.includes('WELCOME100') || !customerVouchers.includes('IPHONE5')) {
    throw new Error('Customer voucher visibility failed');
  }

  const employeeToken = await login(
    requiredEnvironment('SEED_EMPLOYEE_EMAIL'),
    requiredEnvironment('SEED_EMPLOYEE_PASSWORD'),
  );
  await call('/backoffice/vouchers', 403, authenticated(employeeToken));
  const adminToken = await login(
    requiredEnvironment('SEED_ADMIN_EMAIL'),
    requiredEnvironment('SEED_ADMIN_PASSWORD'),
  );
  const voucherCreated = await call(
    '/backoffice/vouchers',
    201,
    authenticated(adminToken, 'POST', {
      code: smokeVoucherCode,
      name: 'Slice 05 smoke voucher',
      description: 'Temporary rollout verification',
      discountType: 'PERCENT',
      discountValue: '10',
      maxDiscountAmount: '100000',
      minimumOrderAmount: '100000',
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2030-01-01T00:00:00.000Z',
      totalUsageLimit: 10,
      perCustomerLimit: null,
      visibility: 'PUBLIC',
      scopeType: 'ORDER',
      scopeConfig: null,
    }),
  );
  smokeVoucherId = stringProperty(data(voucherCreated.body), 'id');
  await call(
    `/backoffice/vouchers/${smokeVoucherId}`,
    200,
    authenticated(adminToken, 'PATCH', { name: 'Slice 05 smoke updated' }),
  );
  await call(
    `/backoffice/vouchers/${smokeVoucherId}/activate`,
    200,
    authenticated(adminToken, 'POST', {}),
  );
  await call(
    `/backoffice/vouchers/${smokeVoucherId}/pause`,
    200,
    authenticated(adminToken, 'POST', { reason: 'Pause rollout smoke' }),
  );
  await call(
    `/backoffice/vouchers/${smokeVoucherId}/archive`,
    200,
    authenticated(adminToken, 'POST', { reason: 'Archive rollout smoke' }),
  );
  const usages = await call(
    `/backoffice/vouchers/${smokeVoucherId}/usages`,
    200,
    authenticated(adminToken),
  );
  if (arrayProperty(record(usages.body), 'data').length !== 0) {
    throw new Error('Smoke voucher unexpectedly has usages');
  }

  const reservationsAfter = await prisma.inventoryReservation.count();
  if (reservationsAfter !== reservationsBefore) throw new Error('Cart flow changed reservations');

  process.stdout.write(
    `${JSON.stringify({
      status: 'passed',
      checks: [
        'guest-cookie-hash',
        'cart-set-update-remove',
        'customer-merge',
        'wishlist',
        'voucher-visibility',
        'admin-lifecycle',
        'employee-rbac',
        'no-reservation',
      ],
    })}\n`,
  );
} finally {
  await cleanupSmokeData();
  await prisma.$disconnect();
}

async function call(path: string, expectedStatus: number, init?: RequestInit) {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const text = response.status === 204 ? '' : await response.text();
  const body: unknown = text.length === 0 ? null : JSON.parse(text);
  if (response.status !== expectedStatus) {
    const error = recordProperty(record(recordProperty(record(body), 'error')), 'code');
    throw new Error(
      `${path}: expected ${String(expectedStatus)}, received ${String(response.status)} (${String(error)})`,
    );
  }
  return { response, body };
}

function jsonMutation(body: unknown): RequestInit {
  return { method: 'POST', headers: mutationHeaders(), body: JSON.stringify(body) };
}

function mutationHeaders(cookie?: string): Record<string, string> {
  return {
    Origin: webOrigin,
    'X-Rephone-CSRF': '1',
    'Content-Type': 'application/json',
    ...(cookie === undefined ? {} : { Cookie: cookie }),
  };
}

function authenticated(token: string, method = 'GET', body?: unknown): RequestInit {
  return {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

async function login(email: string, password: string, cookie?: string): Promise<string> {
  const response = await call('/auth/login', 200, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie === undefined ? {} : { Cookie: cookie }),
    },
    body: JSON.stringify({ email, password }),
  });
  return stringProperty(data(response.body), 'accessToken');
}

function validateGuestCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie') ?? '';
  if (!setCookie.includes('HttpOnly') || !setCookie.includes('SameSite=Lax')) {
    throw new Error('Guest cart cookie is missing required flags');
  }
  const cookie = setCookie.split(';')[0];
  if (cookie === undefined || !cookie.startsWith('rephone_guest_cart=')) {
    throw new Error('Guest cart cookie is missing');
  }
  return cookie;
}

async function assertGuestTokenHashed(cookie: string): Promise<string> {
  const rawToken = cookie.slice(cookie.indexOf('=') + 1);
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const persisted = await prisma.cart.findFirst({ where: { guestTokenHash: tokenHash } });
  if (persisted === null || persisted.guestTokenHash === rawToken) {
    throw new Error('Guest cart token was not persisted as a SHA-256 hash');
  }
  return tokenHash;
}

function voucherCodes(result: Awaited<ReturnType<typeof call>>): string[] {
  return arrayProperty(record(result.body), 'data').map((voucher) =>
    stringProperty(record(voucher), 'code'),
  );
}

async function cleanupSmokeData(): Promise<void> {
  if (smokeVoucherId !== undefined) {
    await prisma.auditLog.deleteMany({ where: { resourceId: smokeVoucherId } });
    await prisma.voucherUsage.deleteMany({ where: { voucherId: smokeVoucherId } });
    await prisma.voucher.deleteMany({ where: { id: smokeVoucherId } });
  }

  const smokeUser = await prisma.user.findUnique({
    where: { normalizedEmail: normalizedSmokeEmail },
    select: { id: true },
  });
  if (smokeUser !== null) {
    const carts = await prisma.cart.findMany({
      where: { customerId: smokeUser.id },
      select: { id: true },
    });
    await deleteCarts(carts.map((cart) => cart.id));
    await prisma.wishlistItem.deleteMany({ where: { customerId: smokeUser.id } });
    await prisma.authSession.deleteMany({ where: { userId: smokeUser.id } });
    await prisma.authToken.deleteMany({ where: { userId: smokeUser.id } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: smokeUser.id } });
    await prisma.user.delete({ where: { id: smokeUser.id } });
  }

  const guestCarts = await prisma.cart.findMany({
    where: { guestTokenHash: { in: guestTokenHashes } },
    select: { id: true },
  });
  await deleteCarts(guestCarts.map((cart) => cart.id));

  const seedUsers = await prisma.user.findMany({
    where: {
      normalizedEmail: {
        in: [
          requiredEnvironment('SEED_ADMIN_EMAIL'),
          requiredEnvironment('SEED_EMPLOYEE_EMAIL'),
        ].map((email) => email.toLowerCase()),
      },
    },
    select: { id: true },
  });
  await prisma.authSession.deleteMany({
    where: { userId: { in: seedUsers.map((user) => user.id) }, createdAt: { gte: smokeStartedAt } },
  });
}

async function deleteCarts(cartIds: string[]): Promise<void> {
  if (cartIds.length === 0) return;
  await prisma.cartItem.deleteMany({ where: { cartId: { in: cartIds } } });
  await prisma.cart.deleteMany({ where: { id: { in: cartIds } } });
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function data(body: unknown): Record<string, unknown> {
  return record(recordProperty(record(body), 'data'));
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected an object');
  }
  return value as Record<string, unknown>;
}

function recordProperty(value: Record<string, unknown>, key: string): unknown {
  return value[key];
}

function arrayProperty(value: Record<string, unknown>, key: string): unknown[] {
  const property = value[key];
  if (!Array.isArray(property)) throw new Error(`Expected ${key} to be an array`);
  return property;
}

function stringProperty(value: Record<string, unknown>, key: string): string {
  const property = value[key];
  if (typeof property !== 'string') throw new Error(`Expected ${key} to be a string`);
  return property;
}

function numberProperty(value: Record<string, unknown>, key: string): number {
  const property = value[key];
  if (typeof property !== 'number') throw new Error(`Expected ${key} to be a number`);
  return property;
}
