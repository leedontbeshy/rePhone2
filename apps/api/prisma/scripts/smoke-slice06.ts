import { createHash } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';

loadWorkspaceEnvironment();

const connectionString = requiredEnvironment('DATABASE_URL');
const apiBaseUrl = new URL('/api/v1', requiredEnvironment('API_PUBLIC_URL')).href.replace(
  /\/$/,
  '',
);
const webOrigin = requiredEnvironment('WEB_ORIGIN');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const smokeStartedAt = new Date();
const smokeCustomerEmail = 'slice06-smoke-customer@rephone.local';

try {
  const accessory = await publicAccessory();
  const guest = await createGuestCart(accessory.variantId);
  const guestPreview = data(
    (
      await call(
        '/checkouts/preview',
        200,
        guestMutation(guest.cookie, { fulfillmentType: 'SHIPPING' }),
      )
    ).body,
  );
  const guestCreateBody = checkoutBody(guestPreview, 'SHIPPING');
  const guestCreated = await call('/checkouts', 201, guestMutation(guest.cookie, guestCreateBody));
  const guestResult = data(guestCreated.body);
  const guestOrder = recordPropertyAsRecord(guestResult, 'order');
  const guestOrderNumber = stringProperty(guestOrder, 'orderNumber');
  const guestAccessToken = stringProperty(guestResult, 'guestAccessToken');
  const persistedGuestOrder = await prisma.order.findUniqueOrThrow({
    where: { orderNumber: guestOrderNumber },
  });
  if (
    persistedGuestOrder.guestAccessTokenHash !==
    createHash('sha256').update(guestAccessToken).digest('hex')
  ) {
    throw new Error('Guest order token was not persisted as SHA-256');
  }
  await call('/checkouts', 200, guestMutation(guest.cookie, guestCreateBody));
  await call(`/orders/${guestOrderNumber}`, 200, {
    headers: { 'X-Guest-Order-Token': guestAccessToken },
  });
  await call(
    `/orders/${guestOrderNumber}/cancel`,
    200,
    orderTokenMutation(guestAccessToken, { reason: 'Hủy đơn guest sau rollout smoke' }),
  );

  const customerPassword = requiredEnvironment('SEED_CUSTOMER_PASSWORD');
  const customer = await ensureSmokeCustomer();
  const activeCart = await prisma.cart.findFirst({
    where: { customerId: customer.id, status: 'ACTIVE' },
    include: { items: true },
  });
  if (activeCart !== null && activeCart.items.length > 0) {
    throw new Error('Seed customer has a non-empty active cart; aborting smoke without mutation');
  }
  const customerToken = await login(smokeCustomerEmail, customerPassword);
  await call(
    '/cart/items',
    activeCart === null ? 201 : 200,
    authenticated(customerToken, 'POST', {
      itemType: 'ACCESSORY',
      variantId: accessory.variantId,
      quantity: 1,
    }),
  );
  const customerPreview = data(
    (
      await call(
        '/checkouts/preview',
        200,
        authenticated(customerToken, 'POST', { fulfillmentType: 'PICKUP' }),
      )
    ).body,
  );
  const customerCreated = await call(
    '/checkouts',
    201,
    authenticated(customerToken, 'POST', checkoutBody(customerPreview, 'PICKUP')),
  );
  const customerOrder = recordPropertyAsRecord(data(customerCreated.body), 'order');
  const customerOrderNumber = stringProperty(customerOrder, 'orderNumber');
  await call('/orders?page=1&pageSize=20', 200, authenticated(customerToken));
  await call(`/orders/${customerOrderNumber}`, 200, authenticated(customerToken));
  await call(
    `/orders/${customerOrderNumber}/cancel`,
    200,
    authenticated(customerToken, 'POST', { reason: 'Hủy đơn customer sau rollout smoke' }),
  );

  for (const orderNumber of [guestOrderNumber, customerOrderNumber]) {
    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber },
      include: { reservations: true, voucherUsage: true, payments: true },
    });
    if (
      order.status !== 'CANCELLED' ||
      order.reservations.some(({ status }) => status === 'ACTIVE')
    ) {
      throw new Error(`${orderNumber}: cancellation did not release the order`);
    }
    if (order.voucherUsage?.status === 'RESERVED') {
      throw new Error(`${orderNumber}: cancellation did not release voucher usage`);
    }
    if (order.payments.some(({ status }) => status === 'AWAITING_PROOF')) {
      throw new Error(`${orderNumber}: cancellation did not terminalize payment`);
    }
  }
  const auditActors = await prisma.auditLog.findMany({
    where: { resourceId: { in: [persistedGuestOrder.id, stringProperty(customerOrder, 'id')] } },
    select: { actorType: true, action: true },
  });
  if (
    !auditActors.some(
      ({ actorType, action }) => actorType === 'GUEST' && action === 'order.created',
    )
  ) {
    throw new Error('Guest order audit was not written');
  }
  if (
    !auditActors.some(({ actorType, action }) => actorType === 'USER' && action === 'order.created')
  ) {
    throw new Error('Customer order audit was not written');
  }

  process.stdout.write(
    `${JSON.stringify({
      status: 'passed',
      guestOrderNumber,
      customerOrderNumber,
      checks: [
        'guest-shipping-create-replay-token',
        'customer-pickup-list-detail',
        'reservation-release',
        'payment-terminalization',
        'user-and-guest-audit',
      ],
    })}\n`,
  );
} finally {
  const customer = await prisma.user.findUnique({
    where: { normalizedEmail: smokeCustomerEmail },
    select: { id: true },
  });
  if (customer !== null) {
    await prisma.authSession.deleteMany({
      where: { userId: customer.id, createdAt: { gte: smokeStartedAt } },
    });
  }
  await prisma.$disconnect();
}

async function ensureSmokeCustomer(): Promise<{ id: string }> {
  const seedCustomer = await prisma.user.findUniqueOrThrow({
    where: {
      normalizedEmail: requiredEnvironment('SEED_CUSTOMER_EMAIL').trim().toLowerCase(),
    },
    select: { passwordHash: true },
  });
  if (seedCustomer.passwordHash === null) {
    throw new Error('Seed customer password hash is missing');
  }

  return prisma.user.upsert({
    where: { normalizedEmail: smokeCustomerEmail },
    update: {
      email: smokeCustomerEmail,
      passwordHash: seedCustomer.passwordHash,
      role: 'CUSTOMER',
      status: 'ACTIVE',
      fullName: 'Slice 06 Smoke Customer',
      disabledAt: null,
      suspendedAt: null,
    },
    create: {
      email: smokeCustomerEmail,
      normalizedEmail: smokeCustomerEmail,
      passwordHash: seedCustomer.passwordHash,
      role: 'CUSTOMER',
      status: 'ACTIVE',
      fullName: 'Slice 06 Smoke Customer',
      emailVerifiedAt: smokeStartedAt,
    },
    select: { id: true },
  });
}

async function publicAccessory(): Promise<{ variantId: string }> {
  const products = await call('/products?productType=ACCESSORY&page=1&pageSize=20', 200);
  for (const item of arrayProperty(record(products.body), 'data')) {
    const slug = stringProperty(record(item), 'slug');
    const product = data((await call(`/products/${slug}`, 200)).body);
    const variant = arrayProperty(product, 'variants')
      .map(record)
      .find((candidate) => {
        const availability = recordPropertyAsRecord(candidate, 'fulfillmentAvailability');
        return availability['inStock'] === true;
      });
    if (variant !== undefined) return { variantId: stringProperty(variant, 'id') };
  }
  throw new Error('No public in-stock accessory exists for Slice 06 smoke');
}

async function createGuestCart(variantId: string): Promise<{ cookie: string }> {
  const response = await call(
    '/cart/items',
    201,
    guestMutation(undefined, { itemType: 'ACCESSORY', variantId, quantity: 1 }),
  );
  const cookie = response.response.headers.get('set-cookie')?.split(';')[0];
  if (cookie === undefined || !cookie.startsWith('rephone_guest_cart=')) {
    throw new Error('Guest cart cookie missing');
  }
  return { cookie };
}

function checkoutBody(preview: Record<string, unknown>, fulfillmentType: 'PICKUP' | 'SHIPPING') {
  const pricing = recordPropertyAsRecord(preview, 'pricing');
  return {
    fulfillmentType,
    contact: {
      fullName: 'Slice 06 Smoke',
      email: 'slice06-smoke@example.com',
      phone: '0900000000',
    },
    ...(fulfillmentType === 'SHIPPING'
      ? {
          shippingAddress: {
            receiverName: 'Slice 06 Smoke',
            phone: '0900000000',
            addressLine: '1 Nguyễn Huệ',
            ward: 'Bến Nghé',
            district: 'Quận 1',
            province: 'TP.HCM',
          },
        }
      : {}),
    expectedCartUpdatedAt: stringProperty(preview, 'cartUpdatedAt'),
    expectedGrandTotal: stringProperty(pricing, 'grandTotal'),
    expectedDepositRequired: stringProperty(pricing, 'depositRequired'),
  };
}

async function call(path: string, expectedStatus: number, init?: RequestInit) {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const text = response.status === 204 ? '' : await response.text();
  const body: unknown = text.length === 0 ? null : JSON.parse(text);
  if (response.status !== expectedStatus) {
    const error = recordPropertyAsRecord(record(body), 'error');
    throw new Error(
      `${path}: expected ${expectedStatus.toString()}, received ${response.status.toString()} (${String(error['code'])})`,
    );
  }
  return { response, body };
}

function guestMutation(cookie: string | undefined, body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: {
      Origin: webOrigin,
      'X-Rephone-CSRF': '1',
      'Content-Type': 'application/json',
      ...(cookie === undefined ? {} : { Cookie: cookie }),
    },
    body: JSON.stringify(body),
  };
}

function orderTokenMutation(token: string, body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'X-Guest-Order-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

async function login(email: string, password: string): Promise<string> {
  const response = await call('/auth/login', 200, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return stringProperty(data(response.body), 'accessToken');
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function data(body: unknown): Record<string, unknown> {
  return recordPropertyAsRecord(record(body), 'data');
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected an object');
  }
  return value as Record<string, unknown>;
}

function recordPropertyAsRecord(value: Record<string, unknown>, key: string) {
  return record(value[key]);
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
