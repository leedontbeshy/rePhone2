import { readFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedDatabase } from '../seed-data.js';
import { findSlice09PreflightViolations } from './preflight-slice09.js';

loadWorkspaceEnvironment();

const mode = smokeMode(process.env['SLICE09_SMOKE_MODE']);
if (mode === 'smoke') assertDestructiveSmokeConfirmation();
const connectionString = requiredEnvironment('DATABASE_URL');
const apiPublicUrl = requiredEnvironment('API_PUBLIC_URL');
const apiBaseUrl = new URL('/api/v1', apiPublicUrl).href.replace(/\/$/, '');
const apiOrigin = new URL(apiPublicUrl).origin;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const smokeStartedAt = new Date();
const runMarker = smokeStartedAt.getTime().toString();
const smokeCustomerEmail = 'slice09-smoke-customer@rephone.local';
const smokeEmployeeEmail = 'slice09-smoke-employee@rephone.local';
const smokeVariantSku = process.env['SLICE09_SMOKE_VARIANT_SKU']?.trim() || 'ACC-CABLE-USBC-LTG-1M';
const proofBytes =
  mode === 'smoke'
    ? await readFile(new URL('../demo-assets/catalog/cap-usb-c-to-lightning.png', import.meta.url))
    : undefined;

interface SmokeIdentity {
  customerId: string;
  employeeId: string;
  customerToken: string;
  employeeToken: string;
}

interface SmokeOrder {
  id: string;
  orderNumber: string;
  paymentId: string;
  expectedDeposit: string;
  customerToken: string;
}

interface StockBaseline {
  orderItemId: string;
  reservationId: string;
  stockLevelId: string;
  variantId: string;
  locationId: string;
  quantity: number;
  quantityOnHand: number;
  quantityReserved: number;
  warrantyDays: number;
}

interface SmokeShipment {
  id: string;
  trackingCode: string;
  trackingUrl: string;
}

const trackedOrders: SmokeOrder[] = [];
let identity: SmokeIdentity | undefined;
let provisioningStarted = false;

try {
  await assertApiReady();
  const beforeChecks = await assertPreflight('before');
  if (mode === 'preflight') {
    writeResult({ status: 'passed', mode, checks: ['api-readiness', ...beforeChecks] });
  } else {
    provisioningStarted = true;
    identity = await prepareIdentity();
    await terminalizeExistingSmokeOrders(identity);
    await clearDedicatedCustomerCart(identity.customerToken);
    const accessory = await publicShippingAccessory();

    const happyOrder = await createShippingOrder(accessory.variantId, identity.customerToken);
    trackedOrders.push(happyOrder);
    const happyBaseline = await assertInitialShippingState(happyOrder, identity.customerId);
    await assertBackofficeSecurityAndQueries(happyOrder, identity);
    await overrideShippingFee(happyOrder, identity);
    await submitAndVerifyDeposit(happyOrder, identity);
    await startPreparing(happyOrder, identity.employeeToken);
    const happyShipment = await createShipment(happyOrder, identity.employeeToken, 'HAPPY');
    await handOver(happyOrder, happyShipment, happyBaseline, identity);
    await assertReseedPreservesInTransitState(happyOrder.id);
    await assertCodRejectionRollsBack(happyOrder, happyShipment, identity.employeeToken);
    await deliverAndAssertReplay(happyOrder, happyShipment, happyBaseline, identity);
    await assertCustomerTracking(happyOrder, happyShipment, 'DELIVERED');
    await assertShippingAudits(happyOrder, happyShipment, identity, true);

    const failureOrder = await createShippingOrder(accessory.variantId, identity.customerToken);
    trackedOrders.push(failureOrder);
    const failureBaseline = await assertInitialShippingState(failureOrder, identity.customerId);
    await submitAndVerifyDeposit(failureOrder, identity);
    await startPreparing(failureOrder, identity.employeeToken);
    const failureShipment = await createShipment(failureOrder, identity.employeeToken, 'RETURN');
    await handOver(failureOrder, failureShipment, failureBaseline, identity);
    await failAndReturn(failureOrder, failureShipment, failureBaseline, identity);
    await assertCustomerTracking(failureOrder, failureShipment, 'RETURNED');
    await assertShippingAudits(failureOrder, failureShipment, identity, false);

    const afterChecks = await assertPreflight('after');
    writeResult({
      status: 'passed',
      mode,
      completedOrderNumber: happyOrder.orderNumber,
      returnedOrderNumber: failureOrder.orderNumber,
      checks: [
        'api-readiness',
        ...beforeChecks,
        'dedicated-customer-shipping-checkout-twice',
        'backoffice-rbac-list-detail-no-store',
        'shipping-fee-override',
        'customer-proof-submit-and-staff-verify',
        'start-preparing-and-create-shipment',
        'handover-consumes-reservation-and-accessory',
        'double-seed-in-transit-fingerprint-safety',
        'cod-required-rollback',
        'delivery-cod-warranty-atomic-completion',
        'delivery-replay-idempotency',
        'customer-safe-shipment-tracking',
        'failed-shipment-no-auto-restock',
        'manual-accessory-return-reference',
        'shipment-and-stock-return-replay-idempotency',
        'shipping-audit-actions',
        ...afterChecks,
      ],
    });
  }
} catch (error) {
  const cleanupFailures =
    identity === undefined ? [] : await terminalizeOrdersAfterFailure(identity, trackedOrders);
  if (cleanupFailures.length > 0) {
    const original = error instanceof Error ? error.message : 'Unknown Slice 09 smoke failure';
    throw new Error(`${original}; application cleanup failed for ${cleanupFailures.join(', ')}`, {
      cause: error,
    });
  }
  throw error;
} finally {
  if (provisioningStarted) await deleteSmokeSessions();
  await prisma.$disconnect();
}

async function assertApiReady(): Promise<void> {
  const response = await fetch(`${apiOrigin}/health/ready`);
  if (response.status !== 200) {
    throw new Error(`health/ready: expected 200, received ${response.status.toString()}`);
  }
}

async function assertPreflight(stage: 'before' | 'after'): Promise<string[]> {
  const checks = await findSlice09PreflightViolations(prisma);
  const failed = checks.filter(({ count }) => count !== 0);
  if (failed.length > 0) {
    throw new Error(
      `Slice 09 ${stage} preflight failed: ${failed
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
        fullName: 'Slice 09 Smoke Customer',
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
        fullName: 'Slice 09 Smoke Customer',
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
        fullName: 'Slice 09 Smoke Employee',
        employeeCode: 'SL9-SMOKE',
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
        fullName: 'Slice 09 Smoke Employee',
        employeeCode: 'SL9-SMOKE',
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
  await Promise.all([
    assertApiDatabaseIdentity(customerToken, customer.id, 'CUSTOMER'),
    assertApiDatabaseIdentity(employeeToken, employee.id, 'EMPLOYEE'),
  ]);
  return {
    customerId: customer.id,
    employeeId: employee.id,
    customerToken,
    employeeToken,
  };
}

async function assertApiDatabaseIdentity(
  token: string,
  expectedId: string,
  expectedRole: 'CUSTOMER' | 'EMPLOYEE',
): Promise<void> {
  const response = await call('/account', 200, authenticated(token));
  const account = data(response.body);
  if (account['id'] !== expectedId || account['role'] !== expectedRole) {
    throw new Error(
      'API_PUBLIC_URL and DATABASE_URL do not resolve the same Slice 09 smoke identity target',
    );
  }
}

async function publicShippingAccessory(): Promise<{ variantId: string }> {
  for (let page = 1; page <= 10; page += 1) {
    const products = await call(
      `/products?productType=ACCESSORY&page=${page.toString()}&pageSize=100`,
      200,
    );
    const rows = arrayProperty(record(products.body), 'data');
    if (rows.length === 0) break;
    for (const row of rows) {
      const slug = stringProperty(record(row), 'slug');
      const product = data((await call(`/products/${encodeURIComponent(slug)}`, 200)).body);
      for (const candidate of arrayProperty(product, 'variants').map(record)) {
        if (stringProperty(candidate, 'sku') !== smokeVariantSku) continue;
        const availability = recordPropertyAsRecord(candidate, 'fulfillmentAvailability');
        const warranty = recordPropertyAsRecord(candidate, 'warrantySummary');
        if (availability['inStock'] !== true || availability['shipping'] !== true) continue;
        if (numberProperty(warranty, 'days') <= 0) continue;
        const variantId = stringProperty(candidate, 'id');
        await assertTwoAccessoryUnitsAvailable(variantId);
        return { variantId };
      }
    }
  }
  throw new Error(
    `Configured Slice 09 smoke variant ${smokeVariantSku} is not public, shipping-capable, warranty-eligible and available twice`,
  );
}

async function assertTwoAccessoryUnitsAvailable(variantId: string): Promise<void> {
  const stock = await prisma.stockLevel.findMany({
    where: { variantId, location: { status: 'ACTIVE' } },
    select: { quantityOnHand: true, quantityReserved: true },
  });
  const available = stock.reduce(
    (sum, level) => sum + Math.max(level.quantityOnHand - level.quantityReserved, 0),
    0,
  );
  if (available < 2) {
    throw new Error(
      `${smokeVariantSku}: full Slice 09 smoke requires at least two available accessory units`,
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

async function createShippingOrder(variantId: string, customerToken: string): Promise<SmokeOrder> {
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
        authenticated(customerToken, 'POST', { fulfillmentType: 'SHIPPING' }),
      )
    ).body,
  );
  const pricing = recordPropertyAsRecord(preview, 'pricing');
  const grandTotal = BigInt(stringProperty(pricing, 'grandTotal'));
  const depositRequired = BigInt(stringProperty(pricing, 'depositRequired'));
  if (depositRequired <= 0n || grandTotal < depositRequired) {
    throw new Error('Slice 09 smoke requires a valid positive shipping deposit');
  }
  const createdResponse = await call(
    '/checkouts',
    201,
    authenticated(customerToken, 'POST', checkoutBody(preview)),
  );
  assertNoStore(createdResponse.response, '/checkouts');
  const order = recordPropertyAsRecord(data(createdResponse.body), 'order');
  const deposit = only(
    arrayProperty(order, 'paymentAttempts')
      .map(record)
      .filter(({ purpose, method }) => purpose === 'DEPOSIT' && method === 'BANK_TRANSFER'),
    'Shipping smoke checkout did not create exactly one deposit payment',
  );
  return {
    id: stringProperty(order, 'id'),
    orderNumber: stringProperty(order, 'orderNumber'),
    paymentId: stringProperty(deposit, 'id'),
    expectedDeposit: stringProperty(deposit, 'expectedAmount'),
    customerToken,
  };
}

function checkoutBody(preview: Record<string, unknown>) {
  const pricing = recordPropertyAsRecord(preview, 'pricing');
  return {
    fulfillmentType: 'SHIPPING',
    contact: {
      fullName: 'Slice 09 Smoke Customer',
      email: smokeCustomerEmail,
      phone: '0900000000',
    },
    shippingAddress: {
      receiverName: 'Slice 09 Smoke Customer',
      phone: '0900000000',
      addressLine: '1 Nguyễn Huệ',
      ward: 'Bến Nghé',
      district: 'Quận 1',
      province: 'TP.HCM',
    },
    customerNote: `Slice 09 guarded smoke ${runMarker}`,
    expectedCartUpdatedAt: stringProperty(preview, 'cartUpdatedAt'),
    expectedGrandTotal: stringProperty(pricing, 'grandTotal'),
    expectedDepositRequired: stringProperty(pricing, 'depositRequired'),
  };
}

async function assertInitialShippingState(
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
      shipments: true,
    },
  });
  const item = only(order.items, `${smokeOrder.orderNumber}: expected one order item`);
  const payment = only(order.payments, `${smokeOrder.orderNumber}: expected one payment`);
  const reservation = only(
    order.reservations,
    `${smokeOrder.orderNumber}: expected one reservation`,
  );
  if (
    order.customerId !== customerId ||
    order.fulfillmentType !== 'SHIPPING' ||
    order.pickupLocationId !== null ||
    order.shippingAddressSnapshot === null ||
    order.fulfillmentLocation.status !== 'ACTIVE' ||
    order.status !== 'PLACED' ||
    order.fulfillmentStatus !== 'PENDING' ||
    order.paymentStatus !== 'UNPAID' ||
    order.shippingFee.toString() !== order.shippingFeeOriginal.toString() ||
    order.shippingFeeOverrideReason !== null ||
    order.shipments.length !== 0 ||
    order.voucherUsage !== null ||
    order.paidAmount.toString() !== '0' ||
    order.refundedAmount.toString() !== '0' ||
    order.balanceDue.toString() !== order.grandTotal.toString()
  ) {
    throw new Error(`${smokeOrder.orderNumber}: initial shipping Order is inconsistent`);
  }
  if (
    payment.id !== smokeOrder.paymentId ||
    payment.purpose !== 'DEPOSIT' ||
    payment.method !== 'BANK_TRANSFER' ||
    payment.status !== 'AWAITING_PROOF' ||
    payment.expectedAmount.toString() !== smokeOrder.expectedDeposit ||
    payment.expiresAt === null ||
    payment.expiresAt <= order.placedAt ||
    payment.submittedAt !== null ||
    payment.evidenceBucket !== null ||
    payment.evidenceObjectPath !== null
  ) {
    throw new Error(`${smokeOrder.orderNumber}: initial deposit Payment is inconsistent`);
  }
  if (
    item.productTypeSnapshot !== 'ACCESSORY' ||
    item.inventoryUnitId !== null ||
    item.quantity !== 1 ||
    item.warrantyDaysSnapshot <= 0 ||
    item.warrantyTermsSnapshot === null ||
    item.warrantyTermsSnapshot.trim() === '' ||
    item.warranty !== null ||
    reservation.orderItemId !== item.id ||
    reservation.status !== 'ACTIVE' ||
    reservation.holdReason !== 'DEPOSIT' ||
    reservation.inventoryUnitId !== null ||
    reservation.stockLevel === null ||
    reservation.stockLevel.locationId !== order.fulfillmentLocationId ||
    reservation.stockLevel.variantId !== item.variantId ||
    reservation.expiresAt?.getTime() !== payment.expiresAt.getTime() ||
    reservation.quantity !== item.quantity ||
    reservation.stockLevel.quantityReserved < reservation.quantity ||
    reservation.stockLevel.quantityOnHand < reservation.stockLevel.quantityReserved
  ) {
    throw new Error(`${smokeOrder.orderNumber}: initial accessory reservation is inconsistent`);
  }
  return {
    orderItemId: item.id,
    reservationId: reservation.id,
    stockLevelId: reservation.stockLevel.id,
    variantId: item.variantId,
    locationId: order.fulfillmentLocationId,
    quantity: reservation.quantity,
    quantityOnHand: reservation.stockLevel.quantityOnHand,
    quantityReserved: reservation.stockLevel.quantityReserved,
    warrantyDays: item.warrantyDaysSnapshot,
  };
}

async function assertBackofficeSecurityAndQueries(
  smokeOrder: SmokeOrder,
  smokeIdentity: SmokeIdentity,
): Promise<void> {
  await call('/backoffice/orders?fulfillmentType=SHIPPING', 401);
  await call(
    `/backoffice/orders/${smokeOrder.id}/override-shipping-fee`,
    403,
    authenticated(smokeIdentity.customerToken, 'POST', {
      shippingFee: '1000',
      reason: 'Customer must not override shipping fees',
    }),
  );
  const listResponse = await call(
    `/backoffice/orders?q=${encodeURIComponent(smokeOrder.orderNumber)}&fulfillmentType=SHIPPING&page=1&pageSize=20`,
    200,
    authenticated(smokeIdentity.employeeToken),
  );
  assertNoStore(listResponse.response, '/backoffice/orders');
  const rows = arrayProperty(record(listResponse.body), 'data').map(record);
  if (!rows.some(({ id }) => id === smokeOrder.id)) {
    throw new Error(`${smokeOrder.orderNumber}: missing from backoffice shipping query`);
  }
  const detailResponse = await call(
    `/backoffice/orders/${smokeOrder.id}`,
    200,
    authenticated(smokeIdentity.employeeToken),
  );
  assertNoStore(detailResponse.response, `/backoffice/orders/${smokeOrder.id}`);
  const detail = data(detailResponse.body);
  assertProperty(detail, 'id', smokeOrder.id);
  assertProperty(detail, 'fulfillmentType', 'SHIPPING');
  assertNoForbiddenProjectionKeys(detail, []);
}

async function overrideShippingFee(
  smokeOrder: SmokeOrder,
  smokeIdentity: SmokeIdentity,
): Promise<void> {
  const before = await prisma.order.findUniqueOrThrow({
    where: { id: smokeOrder.id },
    select: { shippingFee: true, grandTotal: true },
  });
  const requestedFee = BigInt(before.shippingFee.toString()) + 1_000n;
  const reason = 'Điều chỉnh phí giao cho Slice 09 guarded smoke';
  const response = await call(
    `/backoffice/orders/${smokeOrder.id}/override-shipping-fee`,
    200,
    authenticated(smokeIdentity.employeeToken, 'POST', {
      shippingFee: requestedFee.toString(),
      reason,
    }),
  );
  assertNoStore(response.response, `/backoffice/orders/${smokeOrder.id}/override-shipping-fee`);
  const detail = data(response.body);
  const pricing = recordPropertyAsRecord(detail, 'pricing');
  assertProperty(pricing, 'shippingFee', requestedFee.toString());
  assertProperty(pricing, 'grandTotal', (BigInt(before.grandTotal.toString()) + 1_000n).toString());
  const override = recordPropertyAsRecord(pricing, 'shippingFeeOverride');
  assertProperty(override, 'reason', reason);
  const payment = only(
    arrayProperty(detail, 'paymentAttempts').map(record),
    `${smokeOrder.orderNumber}: fee override lost its deposit payment`,
  );
  smokeOrder.expectedDeposit = stringProperty(payment, 'expectedAmount');

  const persisted = await prisma.order.findUniqueOrThrow({
    where: { id: smokeOrder.id },
    include: { payments: true },
  });
  if (
    persisted.shippingFee.toString() !== requestedFee.toString() ||
    persisted.shippingFeeOriginal.toString() !== before.shippingFee.toString() ||
    persisted.shippingFeeOverrideReason !== reason ||
    persisted.shippingFeeOverriddenById !== smokeIdentity.employeeId ||
    persisted.shippingFeeOverriddenAt === null ||
    BigInt(persisted.grandTotal.toString()) <= BigInt(smokeOrder.expectedDeposit) ||
    persisted.payments[0]?.status !== 'AWAITING_PROOF' ||
    persisted.payments[0].expectedAmount.toString() !== smokeOrder.expectedDeposit
  ) {
    throw new Error(`${smokeOrder.orderNumber}: shipping fee override did not persist atomically`);
  }
}

async function submitAndVerifyDeposit(
  smokeOrder: SmokeOrder,
  smokeIdentity: SmokeIdentity,
): Promise<void> {
  const submittedResponse = await call(
    `/payments/${smokeOrder.paymentId}/submit-proof`,
    200,
    proofSubmission({ Authorization: `Bearer ${smokeOrder.customerToken}` }),
  );
  assertNoStore(submittedResponse.response, `/payments/${smokeOrder.paymentId}/submit-proof`);
  const publicPayment = data(submittedResponse.body);
  assertProperty(publicPayment, 'status', 'UNDER_REVIEW');
  const submitted = await prisma.payment.findUniqueOrThrow({
    where: { id: smokeOrder.paymentId },
    include: { order: { include: { reservations: true } } },
  });
  if (
    submitted.status !== 'UNDER_REVIEW' ||
    submitted.evidenceBucket === null ||
    submitted.evidenceObjectPath === null ||
    !submitted.evidenceObjectPath.startsWith(`payments/${submitted.id}/`) ||
    submitted.customerDeclaredAt === null ||
    submitted.submittedAt === null ||
    submitted.order.reservations.length === 0 ||
    submitted.order.reservations.some(
      ({ status, holdReason, expiresAt }) =>
        status !== 'ACTIVE' || holdReason !== 'REVIEW' || expiresAt !== null,
    )
  ) {
    throw new Error(`${smokeOrder.orderNumber}: proof submission state is inconsistent`);
  }
  assertNoPrivateEvidenceLeak(
    publicPayment,
    submitted.evidenceBucket,
    submitted.evidenceObjectPath,
  );

  const verified = data(
    (
      await call(
        `/backoffice/payments/${smokeOrder.paymentId}/verify`,
        200,
        authenticated(smokeIdentity.employeeToken, 'POST', {
          receivedAmount: smokeOrder.expectedDeposit,
        }),
      )
    ).body,
  );
  const paymentProjection = recordPropertyAsRecord(verified, 'payment');
  const orderProjection = recordPropertyAsRecord(verified, 'order');
  assertProperty(paymentProjection, 'status', 'VERIFIED');
  assertProperty(orderProjection, 'status', 'CONFIRMED');

  const persisted = await prisma.payment.findUniqueOrThrow({
    where: { id: smokeOrder.paymentId },
    include: { order: { include: { reservations: true } } },
  });
  if (
    persisted.status !== 'VERIFIED' ||
    persisted.receivedAmount?.toString() !== smokeOrder.expectedDeposit ||
    persisted.reviewedById !== smokeIdentity.employeeId ||
    persisted.reviewedAt === null ||
    persisted.order.status !== 'CONFIRMED' ||
    persisted.order.fulfillmentStatus !== 'PENDING' ||
    persisted.order.reservations.length === 0 ||
    persisted.order.reservations.some(
      ({ status, holdReason, expiresAt }) =>
        status !== 'ACTIVE' || holdReason !== 'FULFILLMENT' || expiresAt !== null,
    )
  ) {
    throw new Error(`${smokeOrder.orderNumber}: verified deposit state is inconsistent`);
  }
}

async function startPreparing(smokeOrder: SmokeOrder, employeeToken: string): Promise<void> {
  const response = await call(
    `/backoffice/orders/${smokeOrder.id}/start-preparing`,
    200,
    authenticated(employeeToken, 'POST'),
  );
  assertNoStore(response.response, `/backoffice/orders/${smokeOrder.id}/start-preparing`);
  assertProjectionState(data(response.body), 'PROCESSING', 'PREPARING');
  const persisted = await prisma.order.findUniqueOrThrow({ where: { id: smokeOrder.id } });
  if (persisted.status !== 'PROCESSING' || persisted.fulfillmentStatus !== 'PREPARING') {
    throw new Error(`${smokeOrder.orderNumber}: start-preparing state is inconsistent`);
  }
}

async function createShipment(
  smokeOrder: SmokeOrder,
  employeeToken: string,
  suffix: 'HAPPY' | 'RETURN',
): Promise<SmokeShipment> {
  const trackingCode = `SL9-${runMarker}-${suffix}`;
  const trackingUrl = `https://tracking.example/${encodeURIComponent(trackingCode)}`;
  const response = await call(
    `/backoffice/orders/${smokeOrder.id}/shipment`,
    201,
    authenticated(employeeToken, 'POST', {
      carrierName: 'Slice 09 Guarded Carrier',
      trackingCode,
      trackingUrl,
    }),
  );
  assertNoStore(response.response, `/backoffice/orders/${smokeOrder.id}/shipment`);
  const responseData = data(response.body);
  const shipment = isRecord(responseData['shipment'])
    ? record(responseData['shipment'])
    : responseData;
  assertProperty(shipment, 'status', 'CREATED');
  assertProperty(shipment, 'trackingCode', trackingCode);
  assertProperty(shipment, 'trackingUrl', trackingUrl);
  const id = stringProperty(shipment, 'id');
  const persisted = await prisma.shipment.findUniqueOrThrow({ where: { id } });
  if (
    persisted.orderId !== smokeOrder.id ||
    persisted.attemptNumber !== 1 ||
    persisted.status !== 'CREATED' ||
    persisted.trackingCode !== trackingCode ||
    persisted.trackingUrl !== trackingUrl
  ) {
    throw new Error(`${smokeOrder.orderNumber}: created Shipment is inconsistent`);
  }
  return { id, trackingCode, trackingUrl };
}

async function handOver(
  smokeOrder: SmokeOrder,
  shipment: SmokeShipment,
  baseline: StockBaseline,
  smokeIdentity: SmokeIdentity,
): Promise<void> {
  const response = await call(
    `/backoffice/shipments/${shipment.id}/hand-over`,
    200,
    authenticated(smokeIdentity.employeeToken, 'POST'),
  );
  assertNoStore(response.response, `/backoffice/shipments/${shipment.id}/hand-over`);
  assertProjectionState(data(response.body), 'PROCESSING', 'IN_TRANSIT');
  const persisted = await prisma.order.findUniqueOrThrow({
    where: { id: smokeOrder.id },
    include: {
      shipments: true,
      reservations: { include: { stockLevel: true } },
    },
  });
  const persistedShipment = only(
    persisted.shipments,
    `${smokeOrder.orderNumber}: expected one handed-over shipment`,
  );
  const reservation = only(
    persisted.reservations,
    `${smokeOrder.orderNumber}: expected one consumed reservation`,
  );
  if (
    persisted.status !== 'PROCESSING' ||
    persisted.fulfillmentStatus !== 'IN_TRANSIT' ||
    persistedShipment.id !== shipment.id ||
    persistedShipment.status !== 'HANDED_TO_CARRIER' ||
    persistedShipment.shippedAt === null ||
    reservation.id !== baseline.reservationId ||
    reservation.status !== 'CONSUMED' ||
    reservation.holdReason !== 'FULFILLMENT' ||
    reservation.expiresAt !== null ||
    reservation.consumedAt?.getTime() !== persistedShipment.shippedAt.getTime() ||
    reservation.stockLevel === null ||
    reservation.stockLevel.quantityOnHand !== baseline.quantityOnHand - baseline.quantity ||
    reservation.stockLevel.quantityReserved !== baseline.quantityReserved - baseline.quantity
  ) {
    throw new Error(`${smokeOrder.orderNumber}: handover inventory state is inconsistent`);
  }
  const sale = await prisma.stockMovement.findMany({
    where: {
      type: 'SALE',
      referenceType: 'INVENTORY_RESERVATION',
      referenceId: baseline.reservationId,
    },
  });
  const movement = only(sale, `${smokeOrder.orderNumber}: expected one SALE movement`);
  if (
    movement.variantId !== baseline.variantId ||
    movement.fromLocationId !== baseline.locationId ||
    movement.toLocationId !== null ||
    movement.quantity !== baseline.quantity ||
    movement.createdById !== smokeIdentity.employeeId
  ) {
    throw new Error(`${smokeOrder.orderNumber}: handover SALE movement is inconsistent`);
  }
}

async function assertReseedPreservesInTransitState(orderId: string): Promise<void> {
  const before = await operationalFingerprint(orderId);
  await seedDatabase(prisma);
  await seedDatabase(prisma);
  const after = await operationalFingerprint(orderId);
  if (after !== before) throw new Error('Double seed changed an IN_TRANSIT shipping order');
}

async function assertCodRejectionRollsBack(
  smokeOrder: SmokeOrder,
  shipment: SmokeShipment,
  employeeToken: string,
): Promise<void> {
  const before = await operationalFingerprint(smokeOrder.id);
  const rejected = await call(
    `/backoffice/shipments/${shipment.id}/mark-delivered`,
    422,
    authenticated(employeeToken, 'POST', { confirmCodCollected: false }),
  );
  assertErrorCode(rejected.body, 'ORDER_NOT_FULLY_PAID');
  const after = await operationalFingerprint(smokeOrder.id);
  if (after !== before) {
    throw new Error(`${smokeOrder.orderNumber}: rejected COD delivery changed operational state`);
  }
}

async function deliverAndAssertReplay(
  smokeOrder: SmokeOrder,
  shipment: SmokeShipment,
  baseline: StockBaseline,
  smokeIdentity: SmokeIdentity,
): Promise<void> {
  const before = await prisma.order.findUniqueOrThrow({
    where: { id: smokeOrder.id },
    select: { balanceDue: true },
  });
  const codAmount = BigInt(before.balanceDue.toString());
  if (codAmount <= 0n)
    throw new Error(`${smokeOrder.orderNumber}: expected a positive COD balance`);
  const deliveredResponse = await call(
    `/backoffice/shipments/${shipment.id}/mark-delivered`,
    200,
    authenticated(smokeIdentity.employeeToken, 'POST', { confirmCodCollected: true }),
  );
  assertNoStore(deliveredResponse.response, `/backoffice/shipments/${shipment.id}/mark-delivered`);
  assertProjectionState(data(deliveredResponse.body), 'COMPLETED', 'COMPLETED');
  await assertCompletedShippingState(smokeOrder, shipment, baseline, smokeIdentity, codAmount);

  const terminalBeforeReplay = await operationalFingerprint(smokeOrder.id);
  const replay = await call(
    `/backoffice/shipments/${shipment.id}/mark-delivered`,
    200,
    authenticated(smokeIdentity.employeeToken, 'POST', { confirmCodCollected: true }),
  );
  assertProjectionState(data(replay.body), 'COMPLETED', 'COMPLETED');
  const terminalAfterReplay = await operationalFingerprint(smokeOrder.id);
  if (terminalAfterReplay !== terminalBeforeReplay) {
    throw new Error(`${smokeOrder.orderNumber}: delivery replay duplicated a terminal effect`);
  }
}

async function assertCompletedShippingState(
  smokeOrder: SmokeOrder,
  shipment: SmokeShipment,
  baseline: StockBaseline,
  smokeIdentity: SmokeIdentity,
  codAmount: bigint,
): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: smokeOrder.id },
    include: {
      items: { include: { warranty: true } },
      payments: true,
      reservations: { include: { stockLevel: true } },
      shipments: true,
      voucherUsage: true,
    },
  });
  const persistedShipment = only(
    order.shipments,
    `${smokeOrder.orderNumber}: expected one delivered shipment`,
  );
  const item = only(order.items, `${smokeOrder.orderNumber}: expected one completed item`);
  const reservation = only(
    order.reservations,
    `${smokeOrder.orderNumber}: expected one completed reservation`,
  );
  const cod = only(
    order.payments.filter(({ purpose, method }) => purpose === 'BALANCE' && method === 'COD'),
    `${smokeOrder.orderNumber}: expected one COD payment`,
  );
  if (
    order.status !== 'COMPLETED' ||
    order.fulfillmentStatus !== 'COMPLETED' ||
    order.paymentStatus !== 'PAID' ||
    order.completedAt === null ||
    order.paidAmount.toString() !== order.grandTotal.toString() ||
    order.refundedAmount.toString() !== '0' ||
    order.balanceDue.toString() !== '0' ||
    order.voucherUsage !== null ||
    persistedShipment.id !== shipment.id ||
    persistedShipment.status !== 'DELIVERED' ||
    persistedShipment.deliveredAt?.getTime() !== order.completedAt.getTime()
  ) {
    throw new Error(`${smokeOrder.orderNumber}: completed shipping Order is inconsistent`);
  }
  if (
    cod.status !== 'VERIFIED' ||
    cod.expectedAmount.toString() !== codAmount.toString() ||
    cod.receivedAmount?.toString() !== codAmount.toString() ||
    cod.reviewedById !== smokeIdentity.employeeId ||
    cod.reviewedAt?.getTime() !== order.completedAt.getTime() ||
    cod.transferContent !== null ||
    cod.evidenceBucket !== null ||
    cod.evidenceObjectPath !== null
  ) {
    throw new Error(`${smokeOrder.orderNumber}: verified COD Payment is inconsistent`);
  }
  if (
    reservation.id !== baseline.reservationId ||
    reservation.status !== 'CONSUMED' ||
    reservation.stockLevel === null ||
    reservation.stockLevel.quantityOnHand !== baseline.quantityOnHand - baseline.quantity ||
    reservation.stockLevel.quantityReserved !== baseline.quantityReserved - baseline.quantity
  ) {
    throw new Error(`${smokeOrder.orderNumber}: completed stock projection is inconsistent`);
  }
  const warranty = item.warranty;
  if (
    item.id !== baseline.orderItemId ||
    warranty === null ||
    warranty.customerId !== smokeIdentity.customerId ||
    warranty.daysSnapshot !== baseline.warrantyDays ||
    warranty.startAt.getTime() !== order.completedAt.getTime() ||
    warranty.endAt.getTime() - warranty.startAt.getTime() !== baseline.warrantyDays * 86_400_000
  ) {
    throw new Error(`${smokeOrder.orderNumber}: shipping Warranty is inconsistent`);
  }
  const saleCount = await prisma.stockMovement.count({
    where: {
      type: 'SALE',
      referenceType: 'INVENTORY_RESERVATION',
      referenceId: baseline.reservationId,
    },
  });
  if (saleCount !== 1) throw new Error(`${smokeOrder.orderNumber}: SALE movement was duplicated`);
}

async function failAndReturn(
  smokeOrder: SmokeOrder,
  shipment: SmokeShipment,
  baseline: StockBaseline,
  smokeIdentity: SmokeIdentity,
): Promise<void> {
  const failureReason = 'Người nhận từ chối kiện hàng Slice 09 smoke';
  const failed = await call(
    `/backoffice/shipments/${shipment.id}/mark-failed`,
    200,
    authenticated(smokeIdentity.employeeToken, 'POST', { reason: failureReason }),
  );
  assertProjectionState(data(failed.body), 'PROCESSING', 'FAILED');
  const returnReason = 'Kho đã nhận đủ phụ kiện hoàn của Slice 09 smoke';
  const returned = await call(
    `/backoffice/shipments/${shipment.id}/mark-returned`,
    200,
    authenticated(smokeIdentity.employeeToken, 'POST', {
      returnedToLocationId: baseline.locationId,
      reason: returnReason,
    }),
  );
  assertNoStore(returned.response, `/backoffice/shipments/${shipment.id}/mark-returned`);
  assertProjectionState(data(returned.body), 'PROCESSING', 'RETURNED');
  await assertReturnedAccessoryIsNotAutoRestocked(smokeOrder, shipment, baseline);
  await returnAccessoryStock(shipment, baseline, returnReason, smokeIdentity.employeeToken);
  await assertReturnedShippingState(
    smokeOrder,
    shipment,
    baseline,
    failureReason,
    returnReason,
    smokeIdentity.employeeId,
  );

  const terminalBeforeReplay = await operationalFingerprint(smokeOrder.id);
  const replay = await call(
    `/backoffice/shipments/${shipment.id}/mark-returned`,
    200,
    authenticated(smokeIdentity.employeeToken, 'POST', {
      returnedToLocationId: baseline.locationId,
      reason: returnReason,
    }),
  );
  assertProjectionState(data(replay.body), 'PROCESSING', 'RETURNED');
  const terminalAfterReplay = await operationalFingerprint(smokeOrder.id);
  if (terminalAfterReplay !== terminalBeforeReplay) {
    throw new Error(`${smokeOrder.orderNumber}: return replay duplicated a terminal effect`);
  }

  const stockReturnBeforeReplay = await operationalFingerprint(smokeOrder.id);
  await returnAccessoryStock(shipment, baseline, returnReason, smokeIdentity.employeeToken);
  const stockReturnAfterReplay = await operationalFingerprint(smokeOrder.id);
  if (stockReturnAfterReplay !== stockReturnBeforeReplay) {
    throw new Error(`${smokeOrder.orderNumber}: stock return replay duplicated a terminal effect`);
  }
}

async function assertReturnedAccessoryIsNotAutoRestocked(
  smokeOrder: SmokeOrder,
  shipment: SmokeShipment,
  baseline: StockBaseline,
): Promise<void> {
  const reservation = await prisma.inventoryReservation.findUniqueOrThrow({
    where: { id: baseline.reservationId },
    include: { stockLevel: true },
  });
  const returnCount = await prisma.stockMovement.count({
    where: {
      type: 'RETURN',
      referenceType: 'SHIPMENT',
      referenceId: shipment.id,
      variantId: baseline.variantId,
    },
  });
  if (
    reservation.status !== 'CONSUMED' ||
    reservation.stockLevel === null ||
    reservation.stockLevel.quantityOnHand !== baseline.quantityOnHand - baseline.quantity ||
    reservation.stockLevel.quantityReserved !== baseline.quantityReserved - baseline.quantity ||
    returnCount !== 0
  ) {
    throw new Error(`${smokeOrder.orderNumber}: mark-returned auto-restocked accessory stock`);
  }
}

async function returnAccessoryStock(
  shipment: SmokeShipment,
  baseline: StockBaseline,
  reason: string,
  employeeToken: string,
): Promise<void> {
  const response = await call(
    '/backoffice/stock/return',
    200,
    authenticated(employeeToken, 'POST', {
      variantId: baseline.variantId,
      locationId: baseline.locationId,
      quantity: baseline.quantity,
      referenceType: 'SHIPMENT',
      referenceId: shipment.id,
      reason,
    }),
  );
  const movement = recordPropertyAsRecord(data(response.body), 'movement');
  assertProperty(movement, 'type', 'RETURN');
  assertProperty(movement, 'referenceType', 'SHIPMENT');
  assertProperty(movement, 'referenceId', shipment.id);
}

async function assertReturnedShippingState(
  smokeOrder: SmokeOrder,
  shipment: SmokeShipment,
  baseline: StockBaseline,
  failureReason: string,
  returnReason: string,
  employeeId: string,
): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: smokeOrder.id },
    include: {
      items: { include: { warranty: true } },
      payments: true,
      reservations: { include: { stockLevel: true } },
      shipments: true,
    },
  });
  const persistedShipment = only(
    order.shipments,
    `${smokeOrder.orderNumber}: expected one returned shipment`,
  );
  const reservation = only(
    order.reservations,
    `${smokeOrder.orderNumber}: expected one returned reservation`,
  );
  if (
    order.status !== 'PROCESSING' ||
    order.fulfillmentStatus !== 'RETURNED' ||
    order.completedAt !== null ||
    order.items.some(({ warranty }) => warranty !== null) ||
    order.payments.some(({ method }) => method === 'COD') ||
    persistedShipment.id !== shipment.id ||
    persistedShipment.status !== 'RETURNED' ||
    persistedShipment.failureReason !== failureReason ||
    persistedShipment.returnedToLocationId !== baseline.locationId ||
    persistedShipment.returnNote !== returnReason ||
    persistedShipment.failedAt === null ||
    persistedShipment.returnedAt === null ||
    persistedShipment.returnedAt < persistedShipment.failedAt
  ) {
    throw new Error(`${smokeOrder.orderNumber}: returned Shipment state is inconsistent`);
  }
  if (
    reservation.id !== baseline.reservationId ||
    reservation.status !== 'CONSUMED' ||
    reservation.stockLevel === null ||
    reservation.stockLevel.quantityOnHand !== baseline.quantityOnHand ||
    reservation.stockLevel.quantityReserved !== baseline.quantityReserved - baseline.quantity
  ) {
    throw new Error(`${smokeOrder.orderNumber}: returned accessory stock is inconsistent`);
  }
  const returns = await prisma.stockMovement.findMany({
    where: {
      type: 'RETURN',
      referenceType: 'SHIPMENT',
      referenceId: shipment.id,
      variantId: baseline.variantId,
    },
  });
  const movement = only(returns, `${smokeOrder.orderNumber}: expected one RETURN movement`);
  if (
    movement.fromLocationId !== null ||
    movement.toLocationId !== baseline.locationId ||
    movement.quantity !== baseline.quantity ||
    movement.reason !== returnReason ||
    movement.createdById !== employeeId
  ) {
    throw new Error(`${smokeOrder.orderNumber}: RETURN movement is inconsistent`);
  }
}

async function assertCustomerTracking(
  smokeOrder: SmokeOrder,
  shipment: SmokeShipment,
  expectedStatus: 'DELIVERED' | 'RETURNED',
): Promise<void> {
  const detailResponse = await call(
    `/orders/${encodeURIComponent(smokeOrder.orderNumber)}`,
    200,
    authenticated(smokeOrder.customerToken),
  );
  assertNoStore(detailResponse.response, `/orders/${smokeOrder.orderNumber}`);
  const order = data(detailResponse.body);
  const publicShipment = recordPropertyAsRecord(order, 'shipment');
  assertProperty(publicShipment, 'carrierName', 'Slice 09 Guarded Carrier');
  assertProperty(publicShipment, 'trackingCode', shipment.trackingCode);
  assertProperty(publicShipment, 'trackingUrl', shipment.trackingUrl);
  assertProperty(publicShipment, 'status', expectedStatus);
  assertExactPublicShipmentKeys(publicShipment);
  assertNoForbiddenProjectionKeys(order, [
    'internalNote',
    'reviewerName',
    'failureReason',
    'returnNote',
    'returnedToLocation',
    'createdBy',
  ]);

  const listResponse = await call(
    '/orders?page=1&pageSize=100',
    200,
    authenticated(smokeOrder.customerToken),
  );
  assertNoStore(listResponse.response, '/orders');
  const row = arrayProperty(record(listResponse.body), 'data')
    .map(record)
    .find((candidate) => candidate['orderNumber'] === smokeOrder.orderNumber);
  if (row === undefined) throw new Error(`${smokeOrder.orderNumber}: missing from customer list`);
  const listShipment = recordPropertyAsRecord(row, 'shipment');
  assertProperty(listShipment, 'trackingCode', shipment.trackingCode);
  assertProperty(listShipment, 'status', expectedStatus);
  assertExactPublicShipmentKeys(listShipment);
}

function assertExactPublicShipmentKeys(shipment: Record<string, unknown>): void {
  const allowed = new Set([
    'carrierName',
    'trackingCode',
    'trackingUrl',
    'status',
    'shippedAt',
    'deliveredAt',
    'failedAt',
    'returnedAt',
  ]);
  const unexpected = Object.keys(shipment).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    throw new Error(`Customer shipment exposed internal fields: ${unexpected.join(', ')}`);
  }
}

async function assertShippingAudits(
  smokeOrder: SmokeOrder,
  shipment: SmokeShipment,
  smokeIdentity: SmokeIdentity,
  includesOverrideAndDelivery: boolean,
): Promise<void> {
  const audits = await prisma.auditLog.findMany({
    where: {
      resourceId: { in: [smokeOrder.id, smokeOrder.paymentId, shipment.id] },
      createdAt: { gte: smokeStartedAt },
    },
    select: {
      action: true,
      actorType: true,
      actorUserId: true,
      changes: true,
      metadata: true,
    },
  });
  const expected = [
    'order.created',
    'payment.proof_submitted',
    'payment.verified',
    'fulfillment.preparation_started',
    'shipment.created',
    'shipment.handed_over',
    ...(includesOverrideAndDelivery
      ? ['order.shipping_fee_overridden', 'shipment.delivered']
      : ['shipment.failed', 'shipment.returned']),
  ];
  for (const action of expected) {
    if (audits.filter((audit) => audit.action === action).length !== 1) {
      throw new Error(`${smokeOrder.orderNumber}: expected one ${action} audit`);
    }
  }
  const customerActions = new Set(['order.created', 'payment.proof_submitted']);
  for (const audit of audits.filter(({ action }) => expected.includes(action))) {
    const expectedActor = customerActions.has(audit.action)
      ? smokeIdentity.customerId
      : smokeIdentity.employeeId;
    if (audit.actorType !== 'USER' || audit.actorUserId !== expectedActor) {
      throw new Error(`${smokeOrder.orderNumber}: ${audit.action} audit actor is inconsistent`);
    }
  }
  const serialized = JSON.stringify(audits.map(({ changes, metadata }) => ({ changes, metadata })));
  const evidence = await prisma.payment.findUniqueOrThrow({
    where: { id: smokeOrder.paymentId },
    select: { evidenceBucket: true, evidenceObjectPath: true },
  });
  if (
    (evidence.evidenceBucket !== null && serialized.includes(evidence.evidenceBucket)) ||
    (evidence.evidenceObjectPath !== null && serialized.includes(evidence.evidenceObjectPath))
  ) {
    throw new Error(`${smokeOrder.orderNumber}: audit leaked private evidence metadata`);
  }
}

async function operationalFingerprint(orderId: string): Promise<string> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      items: { include: { warranty: true }, orderBy: { id: 'asc' } },
      payments: { orderBy: { id: 'asc' } },
      reservations: { include: { stockLevel: true }, orderBy: { id: 'asc' } },
      shipments: { orderBy: { id: 'asc' } },
      voucherUsage: true,
    },
  });
  const reservationIds = order.reservations.map(({ id }) => id);
  const shipmentIds = order.shipments.map(({ id }) => id);
  const resourceIds = [order.id, ...order.payments.map(({ id }) => id), ...shipmentIds];
  const movements = await prisma.stockMovement.findMany({
    where: {
      OR: [
        {
          referenceType: 'INVENTORY_RESERVATION',
          referenceId: { in: reservationIds },
        },
        { referenceType: 'SHIPMENT', referenceId: { in: shipmentIds } },
      ],
    },
    orderBy: { id: 'asc' },
  });
  const audits = await prisma.auditLog.findMany({
    where: {
      resourceId: { in: [...resourceIds, ...movements.map(({ id }) => id)] },
      createdAt: { gte: smokeStartedAt },
    },
    select: { id: true, action: true, actorType: true, actorUserId: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return JSON.stringify({
    order: {
      status: order.status,
      fulfillmentStatus: order.fulfillmentStatus,
      paymentStatus: order.paymentStatus,
      shippingFeeOriginal: order.shippingFeeOriginal.toString(),
      shippingFee: order.shippingFee.toString(),
      shippingFeeOverrideReason: order.shippingFeeOverrideReason,
      shippingFeeOverriddenById: order.shippingFeeOverriddenById,
      shippingFeeOverriddenAt: order.shippingFeeOverriddenAt?.toISOString(),
      grandTotal: order.grandTotal.toString(),
      depositRequired: order.depositRequired.toString(),
      paidAmount: order.paidAmount.toString(),
      refundedAmount: order.refundedAmount.toString(),
      balanceDue: order.balanceDue.toString(),
      confirmedAt: order.confirmedAt?.toISOString(),
      completedAt: order.completedAt?.toISOString(),
      cancelledAt: order.cancelledAt?.toISOString(),
    },
    items: order.items.map((item) => ({
      id: item.id,
      warrantyDaysSnapshot: item.warrantyDaysSnapshot,
      warrantyTermsSnapshot: item.warrantyTermsSnapshot,
      warranty:
        item.warranty === null
          ? null
          : {
              id: item.warranty.id,
              code: item.warranty.warrantyCode,
              startAt: item.warranty.startAt.toISOString(),
              endAt: item.warranty.endAt.toISOString(),
            },
    })),
    payments: order.payments.map((payment) => ({
      id: payment.id,
      purpose: payment.purpose,
      method: payment.method,
      status: payment.status,
      expectedAmount: payment.expectedAmount.toString(),
      receivedAmount: payment.receivedAmount?.toString(),
      evidenceBucket: payment.evidenceBucket,
      evidenceObjectPath: payment.evidenceObjectPath,
      submittedAt: payment.submittedAt?.toISOString(),
      reviewedAt: payment.reviewedAt?.toISOString(),
      reviewedById: payment.reviewedById,
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
    shipments: order.shipments.map((candidate) => ({
      id: candidate.id,
      status: candidate.status,
      carrierName: candidate.carrierName,
      trackingCode: candidate.trackingCode,
      trackingUrl: candidate.trackingUrl,
      shippedAt: candidate.shippedAt?.toISOString(),
      deliveredAt: candidate.deliveredAt?.toISOString(),
      failedAt: candidate.failedAt?.toISOString(),
      returnedAt: candidate.returnedAt?.toISOString(),
      failureReason: candidate.failureReason,
      returnedToLocationId: candidate.returnedToLocationId,
      returnNote: candidate.returnNote,
    })),
    voucherUsage:
      order.voucherUsage === null
        ? null
        : {
            status: order.voucherUsage.status,
            consumedAt: order.voucherUsage.consumedAt?.toISOString(),
            releasedAt: order.voucherUsage.releasedAt?.toISOString(),
          },
    movements: movements.map((movement) => ({
      id: movement.id,
      type: movement.type,
      variantId: movement.variantId,
      fromLocationId: movement.fromLocationId,
      toLocationId: movement.toLocationId,
      quantity: movement.quantity,
      referenceType: movement.referenceType,
      referenceId: movement.referenceId,
      reason: movement.reason,
      createdById: movement.createdById,
      createdAt: movement.createdAt.toISOString(),
    })),
    audits,
  });
}

async function terminalizeExistingSmokeOrders(smokeIdentity: SmokeIdentity): Promise<void> {
  const existing = await prisma.order.findMany({
    where: {
      customerId: smokeIdentity.customerId,
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
      fulfillmentStatus: { not: 'RETURNED' },
    },
    select: { id: true, orderNumber: true },
    orderBy: { createdAt: 'asc' },
  });
  const failures: string[] = [];
  for (const order of existing) {
    try {
      await terminalizeOrder(order.id, order.orderNumber, smokeIdentity);
    } catch {
      failures.push(order.orderNumber);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Unable to terminalize prior Slice 09 smoke orders: ${failures.join(', ')}`);
  }
}

async function terminalizeOrdersAfterFailure(
  smokeIdentity: SmokeIdentity,
  orders: readonly SmokeOrder[],
): Promise<string[]> {
  const discovered = await prisma.order.findMany({
    where: {
      customerId: smokeIdentity.customerId,
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
      fulfillmentStatus: { not: 'RETURNED' },
    },
    select: { id: true, orderNumber: true },
  });
  const candidates = new Map(
    [...orders, ...discovered].map(({ id, orderNumber }) => [id, { id, orderNumber }]),
  );
  const failures: string[] = [];
  for (const order of [...candidates.values()].reverse()) {
    try {
      await terminalizeOrder(order.id, order.orderNumber, smokeIdentity);
    } catch {
      failures.push(order.orderNumber);
    }
  }
  return failures;
}

async function terminalizeOrder(
  orderId: string,
  orderNumber: string,
  smokeIdentity: SmokeIdentity,
): Promise<void> {
  let order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payments: true, shipments: true, fulfillmentLocation: true },
  });
  if (
    order === null ||
    order.status === 'COMPLETED' ||
    order.status === 'CANCELLED' ||
    order.fulfillmentStatus === 'RETURNED'
  ) {
    return;
  }
  const underReview = order.payments.find(({ status }) => status === 'UNDER_REVIEW');
  if (underReview !== undefined) {
    await call(
      `/backoffice/payments/${underReview.id}/reject`,
      200,
      authenticated(smokeIdentity.employeeToken, 'POST', {
        reason: 'Kết thúc an toàn payment sau lỗi Slice 09 smoke',
      }),
    );
  }
  order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payments: true, shipments: true, fulfillmentLocation: true },
  });
  if (order === null || order.status === 'CANCELLED' || order.status === 'COMPLETED') return;

  const shipment = order.shipments[0];
  if (shipment?.status === 'HANDED_TO_CARRIER') {
    await call(
      `/backoffice/shipments/${shipment.id}/mark-failed`,
      200,
      authenticated(smokeIdentity.employeeToken, 'POST', {
        reason: 'Kết thúc an toàn shipment sau lỗi Slice 09 smoke',
      }),
    );
  }
  order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payments: true, shipments: true, fulfillmentLocation: true },
  });
  if (order === null || order.status === 'CANCELLED' || order.status === 'COMPLETED') return;
  const failedShipment = order.shipments[0];
  if (failedShipment?.status === 'FAILED') {
    await call(
      `/backoffice/shipments/${failedShipment.id}/mark-returned`,
      200,
      authenticated(smokeIdentity.employeeToken, 'POST', {
        returnedToLocationId: await activeReturnLocationId(order.fulfillmentLocationId),
        reason: 'Kho nhận lại shipment sau lỗi Slice 09 smoke',
      }),
    );
    return;
  }

  const detail = data(
    (
      await call(
        `/orders/${encodeURIComponent(orderNumber)}`,
        200,
        authenticated(smokeIdentity.customerToken),
      )
    ).body,
  );
  if (!stringArrayProperty(detail, 'availableActions').includes('CANCEL')) {
    throw new Error(`${orderNumber}: no safe application cleanup action is available`);
  }
  await call(
    `/orders/${encodeURIComponent(orderNumber)}/cancel`,
    200,
    authenticated(smokeIdentity.customerToken, 'POST', {
      reason: 'Kết thúc an toàn đơn sau lỗi Slice 09 smoke',
    }),
  );
}

async function activeReturnLocationId(preferredId: string): Promise<string> {
  const preferred = await prisma.inventoryLocation.findUnique({
    where: { id: preferredId },
    select: { id: true, status: true },
  });
  if (preferred?.status === 'ACTIVE') return preferred.id;
  const fallback = await prisma.inventoryLocation.findFirst({
    where: { status: 'ACTIVE', type: { in: ['STORE', 'WAREHOUSE'] } },
    select: { id: true },
    orderBy: [{ type: 'asc' }, { code: 'asc' }],
  });
  if (fallback === null)
    throw new Error('No active location is available for safe shipment return');
  return fallback.id;
}

async function deleteSmokeSessions(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { normalizedEmail: { in: [smokeCustomerEmail, smokeEmployeeEmail] } },
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

function proofSubmission(headers: Record<string, string>): RequestInit {
  if (proofBytes === undefined) throw new Error('Proof fixture is unavailable in preflight mode');
  const form = new FormData();
  form.append('file', new Blob([Uint8Array.from(proofBytes)], { type: 'image/png' }), 'proof.png');
  return { method: 'POST', headers, body: form };
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
    headers: { 'Content-Type': 'application/json', Origin: requiredEnvironment('WEB_ORIGIN') },
    body: JSON.stringify({ email, password }),
  });
  return stringProperty(data(response.body), 'accessToken');
}

function assertProjectionState(
  value: Record<string, unknown>,
  status: string,
  fulfillmentStatus: string,
): void {
  assertProperty(value, 'status', status);
  assertProperty(value, 'fulfillmentStatus', fulfillmentStatus);
}

function assertNoStore(response: Response, path: string): void {
  const cacheControl = response.headers.get('cache-control') ?? '';
  if (!cacheControl.toLowerCase().includes('no-store')) {
    throw new Error(`${path}: response is missing Cache-Control no-store`);
  }
}

function assertNoPrivateEvidenceLeak(value: unknown, bucket: string, objectPath: string): void {
  const serialized = JSON.stringify(value);
  if (serialized.includes(bucket) || serialized.includes(objectPath)) {
    throw new Error('Public response contains private evidence storage metadata');
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
  throw new Error('SLICE09_SMOKE_MODE must be preflight or smoke');
}

function assertDestructiveSmokeConfirmation(): void {
  if (process.env['SLICE09_SMOKE_CONFIRM'] !== 'consume-two-accessories') {
    throw new Error(
      'Full Slice 09 smoke hands over two configured accessories; set SLICE09_SMOKE_CONFIRM=consume-two-accessories to continue',
    );
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for the Slice 09 smoke`);
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
