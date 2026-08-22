import { PrismaPg } from '@prisma/adapter-pg';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedDatabase } from '../seed-data.js';
import { findSlice08PreflightViolations } from './preflight-slice08.js';

loadWorkspaceEnvironment();

const mode = smokeMode(process.env['SLICE08_SMOKE_MODE']);
if (mode === 'smoke') assertDestructiveSmokeConfirmation();
const connectionString = requiredEnvironment('DATABASE_URL');
const apiPublicUrl = requiredEnvironment('API_PUBLIC_URL');
const apiBaseUrl = new URL('/api/v1', apiPublicUrl).href.replace(/\/$/, '');
const apiOrigin = new URL(apiPublicUrl).origin;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const smokeStartedAt = new Date();
const smokeCustomerEmail = 'slice08-smoke-customer@rephone.local';
const smokeEmployeeEmail = 'slice08-smoke-employee@rephone.local';
const smokeVariantSku = process.env['SLICE08_SMOKE_VARIANT_SKU']?.trim() || 'ACC-CABLE-USBC-LTG-1M';
const noteMarker = `Slice 08 smoke ${smokeStartedAt.getTime().toString()}`;

interface SmokeIdentity {
  customerId: string;
  employeeId: string;
  customerToken: string;
  employeeToken: string;
}

interface SmokeOrder {
  id: string;
  orderNumber: string;
  customerToken: string;
}

interface StockBaseline {
  orderItemId: string;
  reservationId: string;
  stockLevelId: string;
  quantity: number;
  quantityOnHand: number;
  quantityReserved: number;
  warrantyDays: number;
}

let trackedOrder: SmokeOrder | undefined;
let smokeIdentityProvisioningStarted = false;

try {
  await assertApiReady();
  const preflightChecks = await assertPreflight('before');
  if (mode === 'preflight') {
    writeResult({
      status: 'passed',
      mode,
      checks: ['api-readiness', ...preflightChecks],
    });
  } else {
    smokeIdentityProvisioningStarted = true;
    const identity = await prepareIdentity();
    const accessory = await publicPickupAccessory();
    await cancelExistingSmokeOrders(identity.customerToken);
    await clearDedicatedCustomerCart(identity.customerToken);

    trackedOrder = await createPickupOrder(accessory.variantId, identity.customerToken);
    const baseline = await assertCreatedState(trackedOrder, identity.customerId);
    await assertBackofficeSecurityAndQueries(trackedOrder, identity);

    const noted = data(
      (
        await call(
          `/backoffice/orders/${trackedOrder.id}/internal-note`,
          200,
          authenticated(identity.employeeToken, 'PATCH', { internalNote: noteMarker }),
        )
      ).body,
    );
    assertProperty(noted, 'internalNote', noteMarker);

    const confirmed = data(
      (
        await call(
          `/backoffice/orders/${trackedOrder.id}/confirm`,
          200,
          authenticated(identity.employeeToken, 'POST'),
        )
      ).body,
    );
    assertProjectionState(confirmed, 'CONFIRMED', 'PENDING', 'UNPAID');
    await assertPersistedStage(trackedOrder.id, 'CONFIRMED', 'PENDING');

    const preparing = data(
      (
        await call(
          `/backoffice/orders/${trackedOrder.id}/start-preparing`,
          200,
          authenticated(identity.employeeToken, 'POST'),
        )
      ).body,
    );
    assertProjectionState(preparing, 'PROCESSING', 'PREPARING', 'UNPAID');
    await assertPersistedStage(trackedOrder.id, 'PROCESSING', 'PREPARING');

    const ready = data(
      (
        await call(
          `/backoffice/orders/${trackedOrder.id}/mark-pickup-ready`,
          200,
          authenticated(identity.employeeToken, 'POST'),
        )
      ).body,
    );
    assertProjectionState(ready, 'PROCESSING', 'READY', 'UNPAID');
    await assertPersistedStage(trackedOrder.id, 'PROCESSING', 'READY');
    await assertReseedPreservesOperationalState(trackedOrder.id);

    const currentDeadline = requiredDateProperty(ready, 'pickupHoldUntil');
    const extendedDeadline = extensionDeadline(currentDeadline);
    const extended = data(
      (
        await call(
          `/backoffice/orders/${trackedOrder.id}/extend-pickup-hold`,
          200,
          authenticated(identity.employeeToken, 'POST', {
            holdUntil: extendedDeadline.toISOString(),
            reason: 'Gia hạn có kiểm soát cho Slice 08 rollout smoke',
          }),
        )
      ).body,
    );
    assertProperty(extended, 'pickupHoldUntil', extendedDeadline.toISOString());
    await assertExtendedDeadline(trackedOrder.id, extendedDeadline);

    const beforeRejectedCash = await operationalFingerprint(trackedOrder.id);
    const rejectedCash = await call(
      `/backoffice/orders/${trackedOrder.id}/complete-pickup`,
      422,
      authenticated(identity.employeeToken, 'POST', { confirmCashCollected: false }),
    );
    assertErrorCode(rejectedCash.body, 'ORDER_NOT_FULLY_PAID');
    const afterRejectedCash = await operationalFingerprint(trackedOrder.id);
    if (afterRejectedCash !== beforeRejectedCash) {
      throw new Error(`${trackedOrder.orderNumber}: rejected CASH completion changed state`);
    }

    const completed = data(
      (
        await call(
          `/backoffice/orders/${trackedOrder.id}/complete-pickup`,
          200,
          authenticated(identity.employeeToken, 'POST', { confirmCashCollected: true }),
        )
      ).body,
    );
    assertProjectionState(completed, 'COMPLETED', 'COMPLETED', 'PAID');
    await assertCompletedState(trackedOrder, identity, baseline);
    await assertCustomerProjection(trackedOrder, noteMarker);

    const terminalBeforeReplay = await terminalFingerprint(trackedOrder.id);
    const replay = data(
      (
        await call(
          `/backoffice/orders/${trackedOrder.id}/complete-pickup`,
          200,
          authenticated(identity.employeeToken, 'POST', { confirmCashCollected: true }),
        )
      ).body,
    );
    assertProjectionState(replay, 'COMPLETED', 'COMPLETED', 'PAID');
    const terminalAfterReplay = await terminalFingerprint(trackedOrder.id);
    if (terminalAfterReplay !== terminalBeforeReplay) {
      throw new Error(`${trackedOrder.orderNumber}: complete replay duplicated a terminal effect`);
    }

    await assertAudit(trackedOrder, identity, noteMarker);
    const completedSmokeOrder = trackedOrder;

    trackedOrder = await createPickupOrder(accessory.variantId, identity.customerToken);
    const expiryBaseline = await assertCreatedState(trackedOrder, identity.customerId);
    const expiryOrder = await prisma.order.findUniqueOrThrow({
      where: { id: trackedOrder.id },
      select: { pickupHoldUntil: true },
    });
    if (expiryOrder.pickupHoldUntil === null) {
      throw new Error(`${trackedOrder.orderNumber}: missing pickup expiry deadline`);
    }
    const expiredAt = new Date(expiryOrder.pickupHoldUntil.getTime() + 1);
    await expireExactPickupOrder(trackedOrder.id, expiredAt);
    await assertExpiredState(trackedOrder, expiryBaseline, expiredAt);

    const afterChecks = await assertPreflight('after');
    writeResult({
      status: 'passed',
      mode,
      completedOrderNumber: completedSmokeOrder.orderNumber,
      expiredOrderNumber: trackedOrder.orderNumber,
      checks: [
        'api-readiness',
        ...preflightChecks,
        'customer-pickup-checkout',
        'backoffice-rbac-list-detail-no-store',
        'internal-note-redaction',
        'confirm-prepare-ready',
        'double-seed-operational-state-safety',
        'pickup-hold-extension',
        'cash-required-rollback',
        'cash-inventory-warranty-atomic-completion',
        'customer-safe-completion-projection',
        'completion-replay-idempotency',
        'audit-actions-and-redaction',
        'exact-injected-clock-pickup-expiry',
        ...afterChecks,
      ],
    });
  }
} catch (error) {
  const cleanupFailure = await terminalizeTrackedOrder();
  if (cleanupFailure !== null) {
    const original = error instanceof Error ? error.message : 'Unknown Slice 08 smoke failure';
    throw new Error(`${original}; application cleanup failed (${cleanupFailure})`, {
      cause: error,
    });
  }
  throw error;
} finally {
  if (smokeIdentityProvisioningStarted) await deleteSmokeSessions();
  await prisma.$disconnect();
}

async function assertApiReady(): Promise<void> {
  const response = await fetch(`${apiOrigin}/health/ready`);
  if (response.status !== 200) {
    throw new Error(`health/ready: expected 200, received ${response.status.toString()}`);
  }
}

async function assertPreflight(stage: 'before' | 'after'): Promise<string[]> {
  const checks = await findSlice08PreflightViolations(prisma);
  const failed = checks.filter(({ count }) => count !== 0);
  if (failed.length > 0) {
    throw new Error(
      `Slice 08 ${stage} preflight failed: ${failed
        .map(({ checkName, count }) => `${checkName}=${count.toString()}`)
        .join(', ')}`,
    );
  }
  return checks.map(({ checkName }) => `${stage}-preflight:${checkName}`);
}

async function prepareIdentity(): Promise<SmokeIdentity> {
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
    throw new Error('Seed smoke identities do not have password hashes');
  }

  const [customer, employee] = await Promise.all([
    prisma.user.upsert({
      where: { normalizedEmail: smokeCustomerEmail },
      update: {
        email: smokeCustomerEmail,
        passwordHash: seedCustomer.passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        fullName: 'Slice 08 Smoke Customer',
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
        fullName: 'Slice 08 Smoke Customer',
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
        fullName: 'Slice 08 Smoke Employee',
        employeeCode: 'SL8-SMOKE',
        hiredAt: new Date('2026-08-23T00:00:00.000Z'),
        disabledAt: null,
        suspendedAt: null,
      },
      create: {
        email: smokeEmployeeEmail,
        normalizedEmail: smokeEmployeeEmail,
        passwordHash: seedEmployee.passwordHash,
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        fullName: 'Slice 08 Smoke Employee',
        employeeCode: 'SL8-SMOKE',
        hiredAt: new Date('2026-08-23T00:00:00.000Z'),
        emailVerifiedAt: smokeStartedAt,
      },
      select: { id: true },
    }),
  ]);
  const [customerToken, employeeToken] = await Promise.all([
    login(smokeCustomerEmail, requiredEnvironment('SEED_CUSTOMER_PASSWORD')),
    login(smokeEmployeeEmail, requiredEnvironment('SEED_EMPLOYEE_PASSWORD')),
  ]);
  return {
    customerId: customer.id,
    employeeId: employee.id,
    customerToken,
    employeeToken,
  };
}

async function cancelExistingSmokeOrders(customerToken: string): Promise<void> {
  const listed = await call('/orders?page=1&pageSize=100', 200, authenticated(customerToken));
  for (const item of arrayProperty(record(listed.body), 'data').map(record)) {
    const orderNumber = stringProperty(item, 'orderNumber');
    const detail = data(
      (await call(`/orders/${encodeURIComponent(orderNumber)}`, 200, authenticated(customerToken)))
        .body,
    );
    if (!stringArrayProperty(detail, 'availableActions').includes('CANCEL')) continue;
    await call(
      `/orders/${encodeURIComponent(orderNumber)}/cancel`,
      200,
      authenticated(customerToken, 'POST', {
        reason: 'Dọn đơn đang mở từ lần chạy Slice 08 smoke trước',
      }),
    );
  }
}

async function clearDedicatedCustomerCart(customerToken: string): Promise<void> {
  const cart = data((await call('/cart', 200, authenticated(customerToken))).body);
  for (const item of arrayProperty(cart, 'items').map(record)) {
    await call(
      `/cart/items/${stringProperty(item, 'id')}`,
      204,
      authenticated(customerToken, 'DELETE'),
    );
  }
}

async function publicPickupAccessory(): Promise<{ variantId: string }> {
  for (let page = 1; page <= 10; page += 1) {
    const products = await call(
      `/products?productType=ACCESSORY&page=${page.toString()}&pageSize=100`,
      200,
    );
    const items = arrayProperty(record(products.body), 'data');
    if (items.length === 0) break;
    for (const item of items) {
      const slug = stringProperty(record(item), 'slug');
      const product = data((await call(`/products/${encodeURIComponent(slug)}`, 200)).body);
      for (const candidate of arrayProperty(product, 'variants').map(record)) {
        const availability = recordPropertyAsRecord(candidate, 'fulfillmentAvailability');
        const warranty = recordPropertyAsRecord(candidate, 'warrantySummary');
        if (
          stringProperty(candidate, 'sku') === smokeVariantSku &&
          availability['inStock'] === true &&
          availability['pickup'] === true &&
          numberProperty(warranty, 'days') > 0
        ) {
          return { variantId: stringProperty(candidate, 'id') };
        }
      }
    }
  }
  throw new Error(
    `Configured Slice 08 smoke variant ${smokeVariantSku} is not pickup-capable, in stock and warranty-eligible`,
  );
}

async function createPickupOrder(variantId: string, customerToken: string): Promise<SmokeOrder> {
  await call(
    '/cart/items',
    [200, 201],
    authenticated(customerToken, 'POST', {
      itemType: 'ACCESSORY',
      variantId,
      quantity: 1,
    }),
  );
  const preview = data(
    (
      await call(
        '/checkouts/preview',
        200,
        authenticated(customerToken, 'POST', { fulfillmentType: 'PICKUP' }),
      )
    ).body,
  );
  const pricing = recordPropertyAsRecord(preview, 'pricing');
  if (BigInt(stringProperty(pricing, 'grandTotal')) <= BigInt(0)) {
    throw new Error('Slice 08 smoke requires a positive pickup total for the CASH path');
  }
  const createdResponse = await call(
    '/checkouts',
    201,
    authenticated(customerToken, 'POST', {
      fulfillmentType: 'PICKUP',
      contact: {
        fullName: 'Slice 08 Smoke Customer',
        email: smokeCustomerEmail,
        phone: '0900000000',
      },
      expectedCartUpdatedAt: stringProperty(preview, 'cartUpdatedAt'),
      expectedGrandTotal: stringProperty(pricing, 'grandTotal'),
      expectedDepositRequired: stringProperty(pricing, 'depositRequired'),
    }),
  );
  assertNoStore(createdResponse.response, '/checkouts');
  const order = recordPropertyAsRecord(data(createdResponse.body), 'order');
  return {
    id: stringProperty(order, 'id'),
    orderNumber: stringProperty(order, 'orderNumber'),
    customerToken,
  };
}

async function assertCreatedState(
  smokeOrder: SmokeOrder,
  customerId: string,
): Promise<StockBaseline> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: smokeOrder.id },
    include: {
      fulfillmentLocation: true,
      items: { include: { warranty: true } },
      payments: true,
      reservations: { include: { stockLevel: true } },
      voucherUsage: true,
    },
  });
  const item = only(order.items, `${smokeOrder.orderNumber}: expected one order item`);
  const reservation = only(
    order.reservations,
    `${smokeOrder.orderNumber}: expected one reservation`,
  );
  if (
    order.customerId !== customerId ||
    order.fulfillmentType !== 'PICKUP' ||
    order.fulfillmentLocation.type !== 'STORE' ||
    order.fulfillmentLocationId !== order.pickupLocationId ||
    order.status !== 'PLACED' ||
    order.fulfillmentStatus !== 'PENDING' ||
    order.paymentStatus !== 'UNPAID' ||
    order.pickupHoldUntil === null ||
    order.pickupHoldUntil <= order.placedAt ||
    order.payments.length !== 0 ||
    order.voucherUsage !== null ||
    order.paidAmount.toString() !== '0' ||
    order.balanceDue.toString() !== order.grandTotal.toString()
  ) {
    throw new Error(`${smokeOrder.orderNumber}: initial pickup projection is inconsistent`);
  }
  if (
    item.productTypeSnapshot !== 'ACCESSORY' ||
    item.warrantyDaysSnapshot <= 0 ||
    item.warrantyTermsSnapshot?.trim() === '' ||
    item.warrantyTermsSnapshot === null ||
    item.warranty !== null
  ) {
    throw new Error(`${smokeOrder.orderNumber}: warranty snapshot is not eligible`);
  }
  if (
    reservation.status !== 'ACTIVE' ||
    reservation.holdReason !== 'PICKUP' ||
    reservation.inventoryUnitId !== null ||
    reservation.stockLevel === null ||
    reservation.expiresAt?.getTime() !== order.pickupHoldUntil.getTime() ||
    reservation.quantity !== item.quantity ||
    reservation.stockLevel.quantityReserved < reservation.quantity ||
    reservation.stockLevel.quantityOnHand < reservation.quantity ||
    reservation.stockLevel.quantityOnHand < reservation.stockLevel.quantityReserved
  ) {
    throw new Error(`${smokeOrder.orderNumber}: pickup reservation is inconsistent`);
  }
  return {
    orderItemId: item.id,
    reservationId: reservation.id,
    stockLevelId: reservation.stockLevel.id,
    quantity: reservation.quantity,
    quantityOnHand: reservation.stockLevel.quantityOnHand,
    quantityReserved: reservation.stockLevel.quantityReserved,
    warrantyDays: item.warrantyDaysSnapshot,
  };
}

async function assertBackofficeSecurityAndQueries(
  smokeOrder: SmokeOrder,
  identity: SmokeIdentity,
): Promise<void> {
  await call('/backoffice/orders?fulfillmentType=PICKUP', 401);
  await call(
    '/backoffice/orders?fulfillmentType=PICKUP',
    403,
    authenticated(identity.customerToken),
  );
  const listResponse = await call(
    `/backoffice/orders?q=${encodeURIComponent(smokeOrder.orderNumber)}&fulfillmentType=PICKUP&page=1&pageSize=20`,
    200,
    authenticated(identity.employeeToken),
  );
  assertNoStore(listResponse.response, '/backoffice/orders');
  const rows = arrayProperty(record(listResponse.body), 'data').map(record);
  if (!rows.some(({ id }) => id === smokeOrder.id)) {
    throw new Error(`${smokeOrder.orderNumber}: missing from exact backoffice query`);
  }
  const detailResponse = await call(
    `/backoffice/orders/${smokeOrder.id}`,
    200,
    authenticated(identity.employeeToken),
  );
  assertNoStore(detailResponse.response, `/backoffice/orders/${smokeOrder.id}`);
  const detail = data(detailResponse.body);
  assertProperty(detail, 'id', smokeOrder.id);
  assertNoForbiddenProjectionKeys(detail, []);
}

async function assertPersistedStage(
  orderId: string,
  status: 'CONFIRMED' | 'PROCESSING',
  fulfillmentStatus: 'PENDING' | 'PREPARING' | 'READY',
): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { reservations: true },
  });
  if (
    order.status !== status ||
    order.fulfillmentStatus !== fulfillmentStatus ||
    order.confirmedAt === null ||
    (fulfillmentStatus === 'READY') !== (order.pickupReadyAt !== null) ||
    order.pickupHoldUntil === null ||
    order.reservations.length === 0 ||
    order.reservations.some(
      (reservation) =>
        reservation.status !== 'ACTIVE' ||
        reservation.holdReason !== 'PICKUP' ||
        reservation.expiresAt?.getTime() !== order.pickupHoldUntil?.getTime(),
    )
  ) {
    throw new Error(`${order.orderNumber}: ${status}/${fulfillmentStatus} state is inconsistent`);
  }
}

async function assertReseedPreservesOperationalState(orderId: string): Promise<void> {
  const before = await operationalFingerprint(orderId);
  await seedDatabase(prisma);
  await seedDatabase(prisma);
  const after = await operationalFingerprint(orderId);
  if (after !== before) throw new Error('Double seed changed a READY pickup order');
}

async function assertExtendedDeadline(orderId: string, expected: Date): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { reservations: true },
  });
  if (
    order.pickupHoldUntil?.getTime() !== expected.getTime() ||
    order.reservations.length === 0 ||
    order.reservations.some(
      ({ status, expiresAt }) => status !== 'ACTIVE' || expiresAt?.getTime() !== expected.getTime(),
    )
  ) {
    throw new Error(`${order.orderNumber}: pickup deadline was not synchronized`);
  }
}

async function assertCompletedState(
  smokeOrder: SmokeOrder,
  identity: SmokeIdentity,
  baseline: StockBaseline,
): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: smokeOrder.id },
    include: {
      items: { include: { warranty: true } },
      payments: true,
      reservations: { include: { stockLevel: true } },
      voucherUsage: true,
    },
  });
  const payment = only(order.payments, `${smokeOrder.orderNumber}: expected one CASH payment`);
  const reservation = only(
    order.reservations,
    `${smokeOrder.orderNumber}: expected one consumed reservation`,
  );
  const item = only(order.items, `${smokeOrder.orderNumber}: expected one completed item`);
  if (
    order.status !== 'COMPLETED' ||
    order.fulfillmentStatus !== 'COMPLETED' ||
    order.paymentStatus !== 'PAID' ||
    order.completedAt === null ||
    order.pickedUpAt?.getTime() !== order.completedAt.getTime() ||
    order.paidAmount.toString() !== order.grandTotal.toString() ||
    order.refundedAmount.toString() !== '0' ||
    order.balanceDue.toString() !== '0' ||
    order.voucherUsage !== null
  ) {
    throw new Error(`${smokeOrder.orderNumber}: terminal Order state is inconsistent`);
  }
  if (
    payment.purpose !== 'FULL_PAYMENT' ||
    payment.method !== 'CASH' ||
    payment.status !== 'VERIFIED' ||
    payment.expectedAmount.toString() !== order.grandTotal.toString() ||
    payment.receivedAmount?.toString() !== order.grandTotal.toString() ||
    payment.reviewedById !== identity.employeeId ||
    payment.reviewedAt?.getTime() !== order.completedAt.getTime() ||
    payment.transferContent !== null ||
    payment.bankNameSnapshot !== null ||
    payment.bankAccountNumberSnapshot !== null ||
    payment.bankAccountHolderSnapshot !== null ||
    payment.bankQrBucketSnapshot !== null ||
    payment.bankQrObjectPathSnapshot !== null ||
    payment.evidenceBucket !== null ||
    payment.evidenceObjectPath !== null
  ) {
    throw new Error(`${smokeOrder.orderNumber}: verified CASH payment is inconsistent`);
  }
  if (
    reservation.id !== baseline.reservationId ||
    reservation.status !== 'CONSUMED' ||
    reservation.consumedAt?.getTime() !== order.completedAt.getTime() ||
    reservation.stockLevel === null ||
    reservation.stockLevel.id !== baseline.stockLevelId ||
    reservation.stockLevel.quantityOnHand !== baseline.quantityOnHand - baseline.quantity ||
    reservation.stockLevel.quantityReserved !== baseline.quantityReserved - baseline.quantity
  ) {
    throw new Error(`${smokeOrder.orderNumber}: stock consumption is inconsistent`);
  }
  const saleMovements = await prisma.stockMovement.findMany({
    where: {
      type: 'SALE',
      referenceType: 'INVENTORY_RESERVATION',
      referenceId: baseline.reservationId,
    },
  });
  const movement = only(saleMovements, `${smokeOrder.orderNumber}: expected one SALE movement`);
  if (
    movement.quantity !== baseline.quantity ||
    movement.fromLocationId !== order.fulfillmentLocationId ||
    movement.toLocationId !== null ||
    movement.createdById !== identity.employeeId
  ) {
    throw new Error(`${smokeOrder.orderNumber}: SALE movement is inconsistent`);
  }
  const warranty = item.warranty;
  if (
    item.id !== baseline.orderItemId ||
    warranty === null ||
    warranty.customerId !== identity.customerId ||
    warranty.status !== 'ACTIVE' ||
    warranty.daysSnapshot !== baseline.warrantyDays ||
    warranty.startAt.getTime() !== order.completedAt.getTime() ||
    warranty.endAt.getTime() - warranty.startAt.getTime() !== baseline.warrantyDays * 86_400_000
  ) {
    throw new Error(`${smokeOrder.orderNumber}: issued warranty is inconsistent`);
  }
}

async function expireExactPickupOrder(orderId: string, now: Date): Promise<void> {
  const previousSchedulerSetting = process.env['SCHEDULER_ENABLED'];
  process.env['SCHEDULER_ENABLED'] = 'false';
  try {
    const [{ createApplication }, { PickupExpiryService }] = await Promise.all([
      import('../../src/application.js'),
      import('../../src/modules/fulfillment/pickup-expiry.service.js'),
    ]);
    const application = await createApplication({ enableSwagger: false });
    await application.init();
    try {
      const expired = await application
        .get(PickupExpiryService)
        .expireOrder(
          orderId,
          now,
          `job:expirePickupHolds:smoke:${smokeStartedAt.getTime().toString()}`,
        );
      if (!expired) throw new Error(`${orderId}: exact pickup expiry returned a no-op`);
    } finally {
      await application.close();
    }
  } finally {
    if (previousSchedulerSetting === undefined) delete process.env['SCHEDULER_ENABLED'];
    else process.env['SCHEDULER_ENABLED'] = previousSchedulerSetting;
  }
}

async function assertExpiredState(
  smokeOrder: SmokeOrder,
  baseline: StockBaseline,
  expiredAt: Date,
): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: smokeOrder.id },
    include: {
      items: { include: { warranty: true } },
      payments: true,
      reservations: { include: { stockLevel: true } },
      voucherUsage: true,
    },
  });
  const reservation = only(
    order.reservations,
    `${smokeOrder.orderNumber}: expected one expired reservation`,
  );
  if (
    order.status !== 'CANCELLED' ||
    order.fulfillmentStatus !== 'CANCELLED' ||
    order.cancelReason !== 'Quá hạn nhận hàng tại cửa hàng.' ||
    order.cancelledAt?.getTime() !== expiredAt.getTime() ||
    order.completedAt !== null ||
    order.pickedUpAt !== null ||
    order.payments.length !== 0 ||
    order.voucherUsage !== null ||
    order.items.some(({ warranty }) => warranty !== null)
  ) {
    throw new Error(`${smokeOrder.orderNumber}: expired Order state is inconsistent`);
  }
  if (
    reservation.id !== baseline.reservationId ||
    reservation.status !== 'EXPIRED' ||
    reservation.releasedAt?.getTime() !== expiredAt.getTime() ||
    reservation.consumedAt !== null ||
    reservation.stockLevel === null ||
    reservation.stockLevel.quantityOnHand !== baseline.quantityOnHand ||
    reservation.stockLevel.quantityReserved !== baseline.quantityReserved - baseline.quantity
  ) {
    throw new Error(`${smokeOrder.orderNumber}: expired reservation release is inconsistent`);
  }
  const [saleCount, audit] = await Promise.all([
    prisma.stockMovement.count({
      where: {
        type: 'SALE',
        referenceType: 'INVENTORY_RESERVATION',
        referenceId: baseline.reservationId,
      },
    }),
    prisma.auditLog.findMany({
      where: {
        resourceId: smokeOrder.id,
        action: 'fulfillment.pickup_expired',
      },
      select: { actorType: true, actorUserId: true, requestId: true },
    }),
  ]);
  if (saleCount !== 0) throw new Error(`${smokeOrder.orderNumber}: expiry created a SALE movement`);
  const expiryAudit = only(audit, `${smokeOrder.orderNumber}: expected one expiry audit`);
  if (
    expiryAudit.actorType !== 'SYSTEM' ||
    expiryAudit.actorUserId !== null ||
    !expiryAudit.requestId?.startsWith('job:expirePickupHolds:smoke:')
  ) {
    throw new Error(`${smokeOrder.orderNumber}: expiry audit actor/request is inconsistent`);
  }
}

async function assertCustomerProjection(
  smokeOrder: SmokeOrder,
  internalNote: string,
): Promise<void> {
  const response = await call(
    `/orders/${encodeURIComponent(smokeOrder.orderNumber)}`,
    200,
    authenticated(smokeOrder.customerToken),
  );
  assertNoStore(response.response, `/orders/${smokeOrder.orderNumber}`);
  const order = data(response.body);
  assertProjectionState(order, 'COMPLETED', 'COMPLETED', 'PAID');
  const pricing = recordPropertyAsRecord(order, 'pricing');
  if (
    stringProperty(pricing, 'paidAmount') !== stringProperty(pricing, 'grandTotal') ||
    stringProperty(pricing, 'balanceDue') !== '0'
  ) {
    throw new Error(`${smokeOrder.orderNumber}: public payment projection is inconsistent`);
  }
  const item = only(
    arrayProperty(order, 'items').map(record),
    `${smokeOrder.orderNumber}: public item missing`,
  );
  const warranty = recordPropertyAsRecord(item, 'warranty');
  stringProperty(warranty, 'warrantyCode');
  const payment = only(
    arrayProperty(order, 'paymentAttempts').map(record),
    `${smokeOrder.orderNumber}: public CASH payment missing`,
  );
  assertProperty(payment, 'method', 'CASH');
  assertProperty(payment, 'status', 'VERIFIED');
  assertNoForbiddenProjectionKeys(order, ['internalNote', 'reviewerName']);
  if (JSON.stringify(order).includes(internalNote)) {
    throw new Error(`${smokeOrder.orderNumber}: internal note leaked to customer projection`);
  }
}

async function assertAudit(
  smokeOrder: SmokeOrder,
  identity: SmokeIdentity,
  internalNote: string,
): Promise<void> {
  const audits = await prisma.auditLog.findMany({
    where: { resourceId: smokeOrder.id, createdAt: { gte: smokeStartedAt } },
    select: {
      action: true,
      actorType: true,
      actorUserId: true,
      changes: true,
      metadata: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const expected = [
    'order.created',
    'order.internal_note_updated',
    'fulfillment.pickup_confirmed',
    'fulfillment.preparation_started',
    'fulfillment.pickup_ready',
    'fulfillment.pickup_hold_extended',
    'fulfillment.pickup_completed',
  ];
  for (const action of expected) {
    const matches = audits.filter((audit) => audit.action === action);
    if (matches.length !== 1) {
      throw new Error(`${smokeOrder.orderNumber}: expected one ${action} audit`);
    }
  }
  const customerAudit = audits.find(({ action }) => action === 'order.created');
  if (customerAudit?.actorType !== 'USER' || customerAudit.actorUserId !== identity.customerId) {
    throw new Error(`${smokeOrder.orderNumber}: order.created actor is inconsistent`);
  }
  const staffAudits = audits.filter(({ action }) => action !== 'order.created');
  if (
    staffAudits.some(
      ({ actorType, actorUserId }) => actorType !== 'USER' || actorUserId !== identity.employeeId,
    )
  ) {
    throw new Error(`${smokeOrder.orderNumber}: staff audit actor is inconsistent`);
  }
  const serialized = JSON.stringify(audits.map(({ changes, metadata }) => ({ changes, metadata })));
  if (serialized.includes(internalNote) || serialized.includes(smokeCustomerEmail)) {
    throw new Error(`${smokeOrder.orderNumber}: audit contains unsafe note/contact data`);
  }
}

async function operationalFingerprint(orderId: string): Promise<string> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      items: { include: { warranty: true }, orderBy: { id: 'asc' } },
      payments: { orderBy: { id: 'asc' } },
      reservations: { include: { stockLevel: true }, orderBy: { id: 'asc' } },
      voucherUsage: true,
    },
  });
  return JSON.stringify({
    order: {
      status: order.status,
      fulfillmentStatus: order.fulfillmentStatus,
      paymentStatus: order.paymentStatus,
      pickupHoldUntil: order.pickupHoldUntil?.toISOString(),
      pickupReadyAt: order.pickupReadyAt?.toISOString(),
      pickedUpAt: order.pickedUpAt?.toISOString(),
      completedAt: order.completedAt?.toISOString(),
      paidAmount: order.paidAmount.toString(),
      refundedAmount: order.refundedAmount.toString(),
      balanceDue: order.balanceDue.toString(),
    },
    items: order.items.map((item) => ({
      id: item.id,
      warrantyDaysSnapshot: item.warrantyDaysSnapshot,
      warrantyTermsSnapshot: item.warrantyTermsSnapshot,
      warrantyCode: item.warranty?.warrantyCode,
    })),
    payments: order.payments.map((payment) => ({
      id: payment.id,
      purpose: payment.purpose,
      method: payment.method,
      status: payment.status,
      expectedAmount: payment.expectedAmount.toString(),
      receivedAmount: payment.receivedAmount?.toString(),
    })),
    reservations: order.reservations.map((reservation) => ({
      id: reservation.id,
      status: reservation.status,
      holdReason: reservation.holdReason,
      expiresAt: reservation.expiresAt?.toISOString(),
      releasedAt: reservation.releasedAt?.toISOString(),
      consumedAt: reservation.consumedAt?.toISOString(),
      stockLevelId: reservation.stockLevelId,
      stockOnHand: reservation.stockLevel?.quantityOnHand,
      stockReserved: reservation.stockLevel?.quantityReserved,
    })),
    voucherUsage:
      order.voucherUsage === null
        ? null
        : {
            status: order.voucherUsage.status,
            consumedAt: order.voucherUsage.consumedAt?.toISOString(),
            releasedAt: order.voucherUsage.releasedAt?.toISOString(),
          },
  });
}

async function terminalFingerprint(orderId: string): Promise<string> {
  const [business, effects, audits] = await Promise.all([
    operationalFingerprint(orderId),
    prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        reservations: {
          select: { id: true },
          orderBy: { id: 'asc' },
        },
        items: {
          select: { id: true, warranty: { select: { id: true, warrantyCode: true } } },
          orderBy: { id: 'asc' },
        },
      },
    }),
    prisma.auditLog.count({
      where: { resourceId: orderId, action: 'fulfillment.pickup_completed' },
    }),
  ]);
  const movementCounts = await Promise.all(
    effects.reservations.map(({ id }) =>
      prisma.stockMovement.count({
        where: { type: 'SALE', referenceType: 'INVENTORY_RESERVATION', referenceId: id },
      }),
    ),
  );
  return JSON.stringify({ business, effects, movementCounts, completionAuditCount: audits });
}

async function terminalizeTrackedOrder(): Promise<string | null> {
  if (trackedOrder === undefined) return null;
  try {
    const detail = data(
      (
        await call(
          `/orders/${encodeURIComponent(trackedOrder.orderNumber)}`,
          200,
          authenticated(trackedOrder.customerToken),
        )
      ).body,
    );
    if (!stringArrayProperty(detail, 'availableActions').includes('CANCEL')) return null;
    await call(
      `/orders/${encodeURIComponent(trackedOrder.orderNumber)}/cancel`,
      200,
      authenticated(trackedOrder.customerToken, 'POST', {
        reason: 'Kết thúc an toàn đơn Slice 08 smoke sau lỗi',
      }),
    );
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'unknown cleanup failure';
  }
}

async function deleteSmokeSessions(): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      normalizedEmail: {
        in: [smokeCustomerEmail, smokeEmployeeEmail],
      },
    },
    select: { id: true },
  });
  if (users.length === 0) return;
  await prisma.authSession.deleteMany({
    where: {
      userId: { in: users.map(({ id }) => id) },
      createdAt: { gte: smokeStartedAt },
    },
  });
}

async function call(
  path: string,
  expectedStatus: number | readonly number[],
  init?: RequestInit,
): Promise<{ response: Response; body: unknown }> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const text = response.status === 204 ? '' : await response.text();
  const body: unknown = text.length === 0 ? null : parseJson(text, path);
  const accepted = Array.isArray(expectedStatus)
    ? expectedStatus.includes(response.status)
    : response.status === expectedStatus;
  if (!accepted) {
    throw new Error(
      `${path}: expected ${formatExpectedStatus(expectedStatus)}, received ${response.status.toString()} (${errorCode(body)})`,
    );
  }
  return { response, body };
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
    headers: {
      'Content-Type': 'application/json',
      Origin: requiredEnvironment('WEB_ORIGIN'),
    },
    body: JSON.stringify({ email, password }),
  });
  return stringProperty(data(response.body), 'accessToken');
}

function assertProjectionState(
  value: Record<string, unknown>,
  status: string,
  fulfillmentStatus: string,
  paymentStatus: string,
): void {
  assertProperty(value, 'status', status);
  assertProperty(value, 'fulfillmentStatus', fulfillmentStatus);
  assertProperty(value, 'paymentStatus', paymentStatus);
}

function assertNoStore(response: Response, path: string): void {
  const cacheControl = response.headers.get('cache-control') ?? '';
  if (!cacheControl.toLowerCase().includes('no-store')) {
    throw new Error(`${path}: response is missing Cache-Control no-store`);
  }
}

function assertNoForbiddenProjectionKeys(
  value: unknown,
  additionalForbidden: readonly string[],
): void {
  const forbidden = new Set([
    'guestAccessToken',
    'guestAccessTokenHash',
    'evidenceBucket',
    'evidenceObjectPath',
    'identifierCiphertext',
    'imei1Hmac',
    'imei2Hmac',
    'costPrice',
    ...additionalForbidden,
  ]);
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!isRecord(candidate)) return;
    for (const [key, nested] of Object.entries(candidate)) {
      if (forbidden.has(key)) throw new Error(`Response exposed forbidden field ${key}`);
      visit(nested);
    }
  };
  visit(value);
}

function assertErrorCode(body: unknown, expected: string): void {
  const actual = errorCode(body);
  if (actual !== expected) throw new Error(`Expected ${expected}, received ${actual}`);
}

function errorCode(body: unknown): string {
  if (!isRecord(body) || !isRecord(body['error']) || typeof body['error']['code'] !== 'string') {
    return 'UNKNOWN_ERROR';
  }
  return body['error']['code'];
}

function extensionDeadline(current: Date): Date {
  const maximum = Date.now() + 7 * 86_400_000 - 60_000;
  const requested = Math.min(current.getTime() + 30 * 60_000, maximum);
  if (requested <= current.getTime()) {
    throw new Error('Configured pickup deadline leaves no safe extension window under seven days');
  }
  return new Date(requested);
}

function requiredDateProperty(value: Record<string, unknown>, key: string): Date {
  const raw = stringProperty(value, key);
  const timestamp = Date.parse(raw);
  if (Number.isNaN(timestamp)) throw new Error(`Expected ${key} to be an ISO date-time`);
  return new Date(timestamp);
}

function assertProperty(value: Record<string, unknown>, key: string, expected: unknown): void {
  if (value[key] !== expected) {
    throw new Error(`Expected ${key}=${String(expected)}, received ${String(value[key])}`);
  }
}

function parseJson(value: string, path: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${path}: response was not valid JSON`);
  }
}

function formatExpectedStatus(value: number | readonly number[]): string {
  return (Array.isArray(value) ? value : [value]).map(String).join('|');
}

function smokeMode(value: string | undefined): 'preflight' | 'smoke' {
  const normalized = value?.trim().toLowerCase() ?? 'smoke';
  if (normalized === 'preflight' || normalized === 'smoke') return normalized;
  throw new Error('SLICE08_SMOKE_MODE must be preflight or smoke');
}

function assertDestructiveSmokeConfirmation(): void {
  if (process.env['SLICE08_SMOKE_CONFIRM'] !== 'consume-one-accessory') {
    throw new Error(
      'Full Slice 08 smoke consumes one configured accessory; set SLICE08_SMOKE_CONFIRM=consume-one-accessory to continue',
    );
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for the Slice 08 smoke`);
  }
  return value;
}

function data(body: unknown): Record<string, unknown> {
  return recordPropertyAsRecord(record(body), 'data');
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Expected an object');
  return value;
}

function recordPropertyAsRecord(value: Record<string, unknown>, key: string) {
  return record(value[key]);
}

function arrayProperty(value: Record<string, unknown>, key: string): unknown[] {
  const property = value[key];
  if (!Array.isArray(property)) throw new Error(`Expected ${key} to be an array`);
  return property;
}

function stringArrayProperty(value: Record<string, unknown>, key: string): string[] {
  const property = arrayProperty(value, key);
  if (!property.every((item): item is string => typeof item === 'string')) {
    throw new Error(`Expected ${key} to be a string array`);
  }
  return property;
}

function stringProperty(value: Record<string, unknown>, key: string): string {
  const property = value[key];
  if (typeof property !== 'string') throw new Error(`Expected ${key} to be a string`);
  return property;
}

function numberProperty(value: Record<string, unknown>, key: string): number {
  const property = value[key];
  if (typeof property !== 'number' || !Number.isFinite(property)) {
    throw new Error(`Expected ${key} to be a number`);
  }
  return property;
}

function only<T>(values: readonly T[], message: string): T {
  if (values.length !== 1 || values[0] === undefined) throw new Error(message);
  return values[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function writeResult(result: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
