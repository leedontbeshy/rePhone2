import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedDatabase } from '../seed-data.js';

loadWorkspaceEnvironment();

const connectionString = requiredEnvironment('DATABASE_URL');
const apiBaseUrl = new URL('/api/v1', requiredEnvironment('API_PUBLIC_URL')).href.replace(
  /\/$/,
  '',
);
const webOrigin = requiredEnvironment('WEB_ORIGIN');
const privateBucket = requiredEnvironment('SUPABASE_PRIVATE_BUCKET');
const supabase = createClient(
  new URL(requiredEnvironment('SUPABASE_URL')).origin,
  requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const smokeStartedAt = new Date();
const smokeCustomerEmail = 'slice07-smoke-customer@rephone.local';
const smokeEmployeeEmail = 'slice07-smoke-employee@rephone.local';
const proofBytes = await readFile(
  new URL('../demo-assets/catalog/cap-usb-c-to-lightning.png', import.meta.url),
);

interface SmokeOrderAccess {
  orderId: string;
  orderNumber: string;
  paymentId: string;
  expectedAmount: string;
  customerToken?: string;
  guestAccessToken?: string;
}

const trackedOrders: SmokeOrderAccess[] = [];
let employeeToken: string | undefined;
let customerToken: string | undefined;

try {
  await assertPrivateBucket();
  const accessory = await publicAccessory();
  const smokeUsers = await ensureSmokeUsers();
  employeeToken = await login(smokeEmployeeEmail, requiredEnvironment('SEED_EMPLOYEE_PASSWORD'));
  customerToken = await login(smokeCustomerEmail, requiredEnvironment('SEED_CUSTOMER_PASSWORD'));
  await clearDedicatedCustomerCart(customerToken);

  const customerOrder = await createCustomerShippingOrder(accessory.variantId, customerToken);
  trackedOrders.push(customerOrder);
  const customerSubmitted = data(
    (
      await call(
        `/payments/${customerOrder.paymentId}/submit-proof`,
        200,
        proofSubmission({ Authorization: `Bearer ${customerToken}` }),
      )
    ).body,
  );
  const customerEvidence = await assertSubmittedState(customerOrder, customerSubmitted);
  await assertReseedPreservesOperationalState(customerOrder);
  await assertBackofficeEvidenceFlow(customerOrder, employeeToken, customerEvidence);

  const verifyBody = { receivedAmount: customerOrder.expectedAmount };
  const verified = data(
    (
      await call(
        `/backoffice/payments/${customerOrder.paymentId}/verify`,
        200,
        authenticated(employeeToken, 'POST', verifyBody),
      )
    ).body,
  );
  assertReviewResult(verified, 'VERIFIED', 'CONFIRMED');
  const verifyReplay = data(
    (
      await call(
        `/backoffice/payments/${customerOrder.paymentId}/verify`,
        200,
        authenticated(employeeToken, 'POST', verifyBody),
      )
    ).body,
  );
  if (stringProperty(verifyReplay, 'notificationDelivery') !== 'SKIPPED_REPLAY') {
    throw new Error('Verify replay did not skip duplicate notification delivery');
  }
  await assertVerifiedState(customerOrder);
  await call(
    `/orders/${customerOrder.orderNumber}/cancel`,
    200,
    authenticated(customerToken, 'POST', { reason: 'Hủy đơn đã verify sau Slice 07 smoke' }),
  );
  await call(
    `/orders/${customerOrder.orderNumber}/cancel`,
    200,
    authenticated(customerToken, 'POST', { reason: 'Hủy đơn đã verify sau Slice 07 smoke' }),
  );
  await assertVerifiedCancellation(customerOrder);

  const guestOrder = await createGuestShippingOrder(accessory.variantId);
  trackedOrders.push(guestOrder);
  const guestSubmitted = data(
    (
      await call(
        `/payments/${guestOrder.paymentId}/submit-proof`,
        200,
        proofSubmission({ 'X-Guest-Order-Token': requiredGuestToken(guestOrder) }),
      )
    ).body,
  );
  const guestEvidence = await assertSubmittedState(guestOrder, guestSubmitted);
  const rejectBody = { reason: 'Chứng từ smoke được từ chối để kết thúc đơn an toàn' };
  const rejected = data(
    (
      await call(
        `/backoffice/payments/${guestOrder.paymentId}/reject`,
        200,
        authenticated(employeeToken, 'POST', rejectBody),
      )
    ).body,
  );
  assertReviewResult(rejected, 'REJECTED', 'CANCELLED');
  const rejectReplay = data(
    (
      await call(
        `/backoffice/payments/${guestOrder.paymentId}/reject`,
        200,
        authenticated(employeeToken, 'POST', rejectBody),
      )
    ).body,
  );
  if (stringProperty(rejectReplay, 'notificationDelivery') !== 'SKIPPED_REPLAY') {
    throw new Error('Reject replay did not skip duplicate notification delivery');
  }
  await assertRejectedState(guestOrder, guestEvidence);
  const guestDetail = data(
    (
      await call(`/orders/${guestOrder.orderNumber}`, 200, {
        headers: { 'X-Guest-Order-Token': requiredGuestToken(guestOrder) },
      })
    ).body,
  );
  assertNoEvidenceLeak(guestDetail, guestEvidence);

  await assertAuditAndRedaction(customerOrder, guestOrder, customerEvidence, guestEvidence);
  await assertStockCounters(trackedOrders);

  process.stdout.write(
    `${JSON.stringify({
      status: 'passed',
      customerOrderNumber: customerOrder.orderNumber,
      guestOrderNumber: guestOrder.orderNumber,
      checks: [
        'private-bucket-policy',
        'customer-proof-submit',
        'double-seed-operational-state-safety',
        'employee-list-detail-signed-read',
        'verify-and-replay',
        'verified-cancel-and-refund',
        'guest-proof-submit',
        'reject-and-replay',
        'reservation-and-stock-release',
        'audit-redaction',
      ],
    })}\n`,
  );

  await deleteSmokeSessions([smokeUsers.customerId, smokeUsers.employeeId]);
} catch (error) {
  const cleanupFailures = await terminalizeTrackedOrders();
  if (cleanupFailures.length > 0) {
    const original = error instanceof Error ? error.message : 'Unknown Slice 07 smoke failure';
    throw new Error(`${original}; application cleanup failed for ${cleanupFailures.join(', ')}`, {
      cause: error,
    });
  }
  throw error;
} finally {
  const users = await prisma.user.findMany({
    where: { normalizedEmail: { in: [smokeCustomerEmail, smokeEmployeeEmail] } },
    select: { id: true },
  });
  await deleteSmokeSessions(users.map(({ id }) => id));
  await prisma.$disconnect();
}

async function assertPrivateBucket(): Promise<void> {
  const { data: bucket, error } = await supabase.storage.getBucket(privateBucket);
  if (error !== null) {
    throw new Error('Configured Slice 07 private storage bucket is unavailable');
  }
  if (bucket.public) {
    throw new Error('Configured Slice 07 evidence bucket is public');
  }
}

async function ensureSmokeUsers(): Promise<{ customerId: string; employeeId: string }> {
  const [seedCustomer, seedEmployee] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: requiredEnvironment('SEED_CUSTOMER_EMAIL').toLowerCase() },
      select: { passwordHash: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: requiredEnvironment('SEED_EMPLOYEE_EMAIL').toLowerCase() },
      select: { passwordHash: true },
    }),
  ]);
  if (seedCustomer.passwordHash === null || seedEmployee.passwordHash === null) {
    throw new Error('Seed smoke credentials are missing password hashes');
  }

  const [customer, employee] = await Promise.all([
    prisma.user.upsert({
      where: { normalizedEmail: smokeCustomerEmail },
      update: {
        email: smokeCustomerEmail,
        passwordHash: seedCustomer.passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        fullName: 'Slice 07 Smoke Customer',
        employeeCode: null,
        hiredAt: null,
        disabledAt: null,
        suspendedAt: null,
      },
      create: {
        email: smokeCustomerEmail,
        normalizedEmail: smokeCustomerEmail,
        passwordHash: seedCustomer.passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        fullName: 'Slice 07 Smoke Customer',
        emailVerifiedAt: smokeStartedAt,
      },
      select: { id: true },
    }),
    prisma.user.upsert({
      where: { normalizedEmail: smokeEmployeeEmail },
      update: {
        email: smokeEmployeeEmail,
        passwordHash: seedEmployee.passwordHash,
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        fullName: 'Slice 07 Smoke Employee',
        employeeCode: 'SL7-SMOKE',
        hiredAt: new Date('2026-08-22T00:00:00.000Z'),
        disabledAt: null,
        suspendedAt: null,
      },
      create: {
        email: smokeEmployeeEmail,
        normalizedEmail: smokeEmployeeEmail,
        passwordHash: seedEmployee.passwordHash,
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        fullName: 'Slice 07 Smoke Employee',
        employeeCode: 'SL7-SMOKE',
        hiredAt: new Date('2026-08-22T00:00:00.000Z'),
        emailVerifiedAt: smokeStartedAt,
      },
      select: { id: true },
    }),
  ]);
  return { customerId: customer.id, employeeId: employee.id };
}

async function clearDedicatedCustomerCart(token: string): Promise<void> {
  const cart = data((await call('/cart', 200, authenticated(token))).body);
  for (const item of arrayProperty(cart, 'items').map(record)) {
    await call(`/cart/items/${stringProperty(item, 'id')}`, 204, authenticated(token, 'DELETE'));
  }
}

async function createCustomerShippingOrder(
  variantId: string,
  token: string,
): Promise<SmokeOrderAccess> {
  await call(
    '/cart/items',
    [200, 201],
    authenticated(token, 'POST', { itemType: 'ACCESSORY', variantId, quantity: 1 }),
  );
  const preview = data(
    (
      await call(
        '/checkouts/preview',
        200,
        authenticated(token, 'POST', { fulfillmentType: 'SHIPPING' }),
      )
    ).body,
  );
  const created = data(
    (
      await call(
        '/checkouts',
        201,
        authenticated(token, 'POST', checkoutBody(preview, smokeCustomerEmail)),
      )
    ).body,
  );
  return checkoutResult(created, { customerToken: token });
}

async function createGuestShippingOrder(variantId: string): Promise<SmokeOrderAccess> {
  const cartResponse = await call(
    '/cart/items',
    201,
    guestMutation(undefined, { itemType: 'ACCESSORY', variantId, quantity: 1 }),
  );
  const cookie = cartResponse.response.headers.get('set-cookie')?.split(';')[0];
  if (cookie === undefined || !cookie.startsWith('rephone_guest_cart=')) {
    throw new Error('Guest cart cookie missing');
  }
  const preview = data(
    (await call('/checkouts/preview', 200, guestMutation(cookie, { fulfillmentType: 'SHIPPING' })))
      .body,
  );
  const created = data(
    (
      await call(
        '/checkouts',
        201,
        guestMutation(cookie, checkoutBody(preview, 'slice07-smoke-guest@example.com')),
      )
    ).body,
  );
  return checkoutResult(created, {
    guestAccessToken: stringProperty(created, 'guestAccessToken'),
  });
}

function checkoutResult(
  result: Record<string, unknown>,
  access: Pick<SmokeOrderAccess, 'customerToken'> | Pick<SmokeOrderAccess, 'guestAccessToken'>,
): SmokeOrderAccess {
  const order = recordPropertyAsRecord(result, 'order');
  const payment = arrayProperty(order, 'paymentAttempts')
    .map(record)
    .find((candidate) => candidate['status'] === 'AWAITING_PROOF');
  if (payment === undefined) throw new Error('Shipping smoke order has no deposit payment');
  return {
    orderId: stringProperty(order, 'id'),
    orderNumber: stringProperty(order, 'orderNumber'),
    paymentId: stringProperty(payment, 'id'),
    expectedAmount: stringProperty(payment, 'expectedAmount'),
    ...access,
  };
}

function checkoutBody(preview: Record<string, unknown>, email: string) {
  const pricing = recordPropertyAsRecord(preview, 'pricing');
  return {
    fulfillmentType: 'SHIPPING',
    contact: { fullName: 'Slice 07 Smoke', email, phone: '0900000000' },
    shippingAddress: {
      receiverName: 'Slice 07 Smoke',
      phone: '0900000000',
      addressLine: '1 Nguyễn Huệ',
      ward: 'Bến Nghé',
      district: 'Quận 1',
      province: 'TP.HCM',
    },
    expectedCartUpdatedAt: stringProperty(preview, 'cartUpdatedAt'),
    expectedGrandTotal: stringProperty(pricing, 'grandTotal'),
    expectedDepositRequired: stringProperty(pricing, 'depositRequired'),
  };
}

async function assertSubmittedState(
  order: SmokeOrderAccess,
  publicPayment: Record<string, unknown>,
): Promise<{ bucket: string; objectPath: string }> {
  if (stringProperty(publicPayment, 'status') !== 'UNDER_REVIEW') {
    throw new Error(`${order.orderNumber}: proof submission did not enter UNDER_REVIEW`);
  }
  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: order.paymentId },
    include: { order: { include: { reservations: true } } },
  });
  if (
    payment.evidenceBucket !== privateBucket ||
    payment.evidenceObjectPath === null ||
    !payment.evidenceObjectPath.startsWith(`payments/${payment.id}/`) ||
    payment.customerDeclaredAt === null ||
    payment.submittedAt === null
  ) {
    throw new Error(`${order.orderNumber}: private evidence metadata is invalid`);
  }
  if (
    payment.order.reservations.length === 0 ||
    payment.order.reservations.some(
      (reservation) =>
        reservation.status !== 'ACTIVE' ||
        reservation.holdReason !== 'REVIEW' ||
        reservation.expiresAt !== null,
    )
  ) {
    throw new Error(`${order.orderNumber}: reservation did not enter REVIEW`);
  }
  const evidence = { bucket: payment.evidenceBucket, objectPath: payment.evidenceObjectPath };
  assertNoEvidenceLeak(publicPayment, evidence);
  return evidence;
}

async function assertBackofficeEvidenceFlow(
  order: SmokeOrderAccess,
  token: string,
  evidence: { bucket: string; objectPath: string },
): Promise<void> {
  const queue = await call(
    `/backoffice/payments?status=UNDER_REVIEW&orderNumber=${encodeURIComponent(order.orderNumber)}`,
    200,
    authenticated(token),
  );
  if (
    !arrayProperty(record(queue.body), 'data')
      .map(record)
      .some((payment) => payment['id'] === order.paymentId)
  ) {
    throw new Error(`${order.orderNumber}: payment is missing from the review queue`);
  }
  const detail = data(
    (await call(`/backoffice/payments/${order.paymentId}`, 200, authenticated(token))).body,
  );
  if (detail['evidenceAvailable'] !== true) {
    throw new Error(`${order.orderNumber}: backoffice detail does not report evidence`);
  }
  assertNoEvidenceLeak(detail, evidence);

  const signed = data(
    (await call(`/backoffice/payments/${order.paymentId}/evidence-url`, 200, authenticated(token)))
      .body,
  );
  const signedUrl = stringProperty(signed, 'url');
  const expiresAt = Date.parse(stringProperty(signed, 'expiresAt'));
  const ttl = expiresAt - Date.now();
  if (!Number.isFinite(expiresAt) || ttl <= 0 || ttl > 305_000) {
    throw new Error(`${order.orderNumber}: signed evidence URL TTL exceeds five minutes`);
  }
  const evidenceResponse = await fetch(signedUrl);
  if (!evidenceResponse.ok) {
    throw new Error(`${order.orderNumber}: signed evidence URL is unreadable`);
  }
  const downloaded = new Uint8Array(await evidenceResponse.arrayBuffer());
  if (downloaded.byteLength !== proofBytes.byteLength) {
    throw new Error(`${order.orderNumber}: signed evidence bytes do not match the upload`);
  }
}

async function assertReseedPreservesOperationalState(order: SmokeOrderAccess): Promise<void> {
  const before = await operationalFingerprint(order);
  await seedDatabase(prisma);
  await seedDatabase(prisma);
  const after = await operationalFingerprint(order);
  if (after !== before) {
    throw new Error(`${order.orderNumber}: reseed changed active payment/order/reservation state`);
  }
}

async function operationalFingerprint(order: SmokeOrderAccess): Promise<string> {
  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: order.paymentId },
    include: {
      order: {
        include: {
          reservations: {
            orderBy: { id: 'asc' },
            include: { stockLevel: true },
          },
          voucherUsage: true,
        },
      },
    },
  });
  return JSON.stringify({
    payment: {
      status: payment.status,
      evidenceBucket: payment.evidenceBucket,
      evidenceObjectPath: payment.evidenceObjectPath,
      customerDeclaredAt: payment.customerDeclaredAt?.toISOString(),
      submittedAt: payment.submittedAt?.toISOString(),
      reviewedAt: payment.reviewedAt?.toISOString(),
      reviewedById: payment.reviewedById,
      receivedAmount: payment.receivedAmount?.toString(),
    },
    order: {
      status: payment.order.status,
      fulfillmentStatus: payment.order.fulfillmentStatus,
      paidAmount: payment.order.paidAmount.toString(),
      balanceDue: payment.order.balanceDue.toString(),
      voucherUsageStatus: payment.order.voucherUsage?.status,
    },
    reservations: payment.order.reservations.map((reservation) => ({
      id: reservation.id,
      status: reservation.status,
      holdReason: reservation.holdReason,
      expiresAt: reservation.expiresAt?.toISOString(),
      stockLevelId: reservation.stockLevelId,
      stockOnHand: reservation.stockLevel?.quantityOnHand,
      stockReserved: reservation.stockLevel?.quantityReserved,
    })),
  });
}

function assertReviewResult(
  result: Record<string, unknown>,
  expectedPaymentStatus: 'VERIFIED' | 'REJECTED',
  expectedOrderStatus: 'CONFIRMED' | 'CANCELLED',
): void {
  const payment = recordPropertyAsRecord(result, 'payment');
  const order = recordPropertyAsRecord(result, 'order');
  if (
    payment['status'] !== expectedPaymentStatus ||
    order['status'] !== expectedOrderStatus ||
    !['SENT', 'FAILED'].includes(stringProperty(result, 'notificationDelivery'))
  ) {
    throw new Error(`Payment review did not produce ${expectedPaymentStatus}`);
  }
}

async function assertVerifiedState(order: SmokeOrderAccess): Promise<void> {
  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: order.paymentId },
    include: { order: { include: { reservations: true } } },
  });
  if (
    payment.status !== 'VERIFIED' ||
    payment.receivedAmount?.toString() !== order.expectedAmount ||
    payment.reviewedById === null ||
    payment.reviewedAt === null ||
    payment.order.status !== 'CONFIRMED' ||
    payment.order.reservations.length === 0 ||
    payment.order.reservations.some(
      (reservation) =>
        reservation.status !== 'ACTIVE' ||
        reservation.holdReason !== 'FULFILLMENT' ||
        reservation.expiresAt !== null,
    )
  ) {
    throw new Error(`${order.orderNumber}: verified state is inconsistent`);
  }
}

async function assertVerifiedCancellation(order: SmokeOrderAccess): Promise<void> {
  const persisted = await prisma.order.findUniqueOrThrow({
    where: { id: order.orderId },
    include: { payments: true, reservations: true, voucherUsage: true, refunds: true },
  });
  const refunds = persisted.refunds.filter(
    (refund) => refund.paymentId === order.paymentId && refund.status === 'REQUESTED',
  );
  if (
    persisted.status !== 'CANCELLED' ||
    persisted.fulfillmentStatus !== 'CANCELLED' ||
    persisted.payments.find(({ id }) => id === order.paymentId)?.status !== 'VERIFIED' ||
    persisted.reservations.some(({ status }) => status === 'ACTIVE') ||
    persisted.voucherUsage?.status === 'RESERVED' ||
    refunds.length !== 1 ||
    refunds[0]?.amount.toString() !== order.expectedAmount
  ) {
    throw new Error(`${order.orderNumber}: verified cancellation/refund invariant failed`);
  }
}

async function assertRejectedState(
  order: SmokeOrderAccess,
  evidence: { bucket: string; objectPath: string },
): Promise<void> {
  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: order.paymentId },
    include: { order: { include: { reservations: true, voucherUsage: true, refunds: true } } },
  });
  if (
    payment.status !== 'REJECTED' ||
    payment.evidenceBucket !== evidence.bucket ||
    payment.evidenceObjectPath !== evidence.objectPath ||
    payment.reviewedById === null ||
    payment.reviewedAt === null ||
    payment.order.status !== 'CANCELLED' ||
    payment.order.fulfillmentStatus !== 'CANCELLED' ||
    payment.order.reservations.length === 0 ||
    payment.order.reservations.some(({ status }) => status === 'ACTIVE') ||
    payment.order.voucherUsage?.status === 'RESERVED' ||
    payment.order.refunds.length !== 0
  ) {
    throw new Error(`${order.orderNumber}: rejected state/release invariant failed`);
  }
}

async function assertAuditAndRedaction(
  customerOrder: SmokeOrderAccess,
  guestOrder: SmokeOrderAccess,
  customerEvidence: { bucket: string; objectPath: string },
  guestEvidence: { bucket: string; objectPath: string },
): Promise<void> {
  const entries = await prisma.auditLog.findMany({
    where: {
      resourceId: {
        in: [
          customerOrder.orderId,
          customerOrder.paymentId,
          guestOrder.orderId,
          guestOrder.paymentId,
        ],
      },
    },
    select: { action: true, actorType: true, changes: true, metadata: true },
  });
  const required = [
    ['payment.proof_submitted', 'USER'],
    ['payment.proof_submitted', 'GUEST'],
    ['payment.evidence_viewed', 'USER'],
    ['payment.verified', 'USER'],
    ['payment.rejected', 'USER'],
  ] as const;
  for (const [action, actorType] of required) {
    if (!entries.some((entry) => entry.action === action && entry.actorType === actorType)) {
      throw new Error(`Missing ${actorType} audit ${action}`);
    }
  }
  const safeAudit = JSON.stringify(entries);
  for (const evidence of [customerEvidence, guestEvidence]) {
    if (safeAudit.includes(evidence.objectPath) || safeAudit.includes(evidence.bucket)) {
      throw new Error('Audit payload contains private evidence storage metadata');
    }
  }
}

async function assertStockCounters(orders: SmokeOrderAccess[]): Promise<void> {
  const reservations = await prisma.inventoryReservation.findMany({
    where: { orderId: { in: orders.map(({ orderId }) => orderId) } },
    select: { stockLevelId: true, status: true },
  });
  if (reservations.length === 0 || reservations.some(({ status }) => status === 'ACTIVE')) {
    throw new Error('Slice 07 smoke reservations were not terminalized');
  }
  const stockIds = [
    ...new Set(
      reservations
        .map(({ stockLevelId }) => stockLevelId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const stock = await prisma.stockLevel.findMany({
    where: { id: { in: stockIds } },
    select: { quantityOnHand: true, quantityReserved: true },
  });
  if (
    stock.some(
      ({ quantityOnHand, quantityReserved }) =>
        quantityReserved < 0 || quantityReserved > quantityOnHand,
    )
  ) {
    throw new Error('Slice 07 smoke left an invalid stock counter');
  }
}

async function terminalizeTrackedOrders(): Promise<string[]> {
  const failures: string[] = [];
  for (const order of [...trackedOrders].reverse()) {
    try {
      let persisted = await prisma.order.findUnique({
        where: { id: order.orderId },
        include: { payments: true },
      });
      if (persisted === null || persisted.status === 'CANCELLED') continue;
      const payment = persisted.payments.find(({ id }) => id === order.paymentId);
      if (payment?.status === 'UNDER_REVIEW' && employeeToken !== undefined) {
        await call(
          `/backoffice/payments/${order.paymentId}/reject`,
          200,
          authenticated(employeeToken, 'POST', {
            reason: 'Kết thúc đơn tự động sau khi Slice 07 smoke thất bại',
          }),
        );
      }
      persisted = await prisma.order.findUnique({
        where: { id: order.orderId },
        include: { payments: true },
      });
      if (persisted === null || persisted.status === 'CANCELLED') continue;
      const access = order.customerToken ?? order.guestAccessToken;
      if (access === undefined) throw new Error('Missing cleanup credential');
      const init =
        order.customerToken === undefined
          ? orderTokenMutation(access, { reason: 'Kết thúc đơn sau khi Slice 07 smoke thất bại' })
          : authenticated(access, 'POST', {
              reason: 'Kết thúc đơn sau khi Slice 07 smoke thất bại',
            });
      await call(`/orders/${order.orderNumber}/cancel`, 200, init);
      const terminal = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
      if (terminal.status !== 'CANCELLED') failures.push(order.orderNumber);
    } catch {
      failures.push(order.orderNumber);
    }
  }
  return failures;
}

async function deleteSmokeSessions(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  await prisma.authSession.deleteMany({
    where: { userId: { in: userIds } },
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
  throw new Error('No public in-stock accessory exists for Slice 07 smoke');
}

function proofSubmission(headers: Record<string, string>): RequestInit {
  const form = new FormData();
  form.append('file', new Blob([Uint8Array.from(proofBytes)], { type: 'image/png' }), 'proof.png');
  return { method: 'POST', headers, body: form };
}

async function call(path: string, expectedStatus: number | readonly number[], init?: RequestInit) {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const text = response.status === 204 ? '' : await response.text();
  const body: unknown = text.length === 0 ? null : JSON.parse(text);
  const accepted = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!accepted.includes(response.status)) {
    throw new Error(
      `${path}: expected ${accepted.join('/')}, received ${response.status.toString()} (${errorCode(body)})`,
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

function requiredGuestToken(order: SmokeOrderAccess): string {
  if (order.guestAccessToken === undefined) throw new Error('Guest order token is missing');
  return order.guestAccessToken;
}

function assertNoEvidenceLeak(
  value: Record<string, unknown>,
  evidence: { bucket: string; objectPath: string },
): void {
  const serialized = JSON.stringify(value);
  if (serialized.includes(evidence.bucket) || serialized.includes(evidence.objectPath)) {
    throw new Error('Public response contains private evidence storage metadata');
  }
}

function errorCode(body: unknown): string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return 'UNKNOWN_ERROR';
  const error = (body as Record<string, unknown>)['error'];
  if (typeof error !== 'object' || error === null || Array.isArray(error)) return 'UNKNOWN_ERROR';
  const code = (error as Record<string, unknown>)['code'];
  return typeof code === 'string' ? code : 'UNKNOWN_ERROR';
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
