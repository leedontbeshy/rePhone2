import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { provisionAfterSalesInspectingScenario } from './demo-after-sales-inspecting.js';
import { provisionRefundProcessingScenario } from './demo-refund-processing.js';
import {
  assertDemoScenariosGuard,
  DEMO_SCENARIO_KEYS,
  orchestrateDemoScenarios,
  readDemoManifest,
  writeDemoManifestScenario,
  type DemoScenarioKey,
  type DemoScenarioProvisioner,
} from './demo-scenarios-support.js';
import {
  Slice10ApiClient,
  arrayProperty,
  authenticated,
  data,
  deleteScriptSessions,
  prepareScriptIdentity,
  record,
  recordProperty,
  requiredEnvironment,
  stringProperty,
  type ScriptIdentity,
} from './slice10-script-support.js';

const ACCESSORY_SKU = 'ACC-CABLE-USBC-LTG-1M';
const PROOF_ASSET = new URL('../demo-assets/catalog/cap-usb-c-to-lightning.png', import.meta.url);

const SCENARIOS = {
  'pickup-ready': {
    marker: 'Demo scenario pickup-ready v1',
    employeeCode: 'DEMO-PK12',
  },
  'shipping-awaiting-proof': {
    marker: 'Demo scenario shipping-awaiting-proof v1',
    employeeCode: 'DEMO-SA12',
  },
  'shipping-under-review': {
    marker: 'Demo scenario shipping-under-review v1',
    employeeCode: 'DEMO-SR12',
  },
  'shipping-in-transit': {
    marker: 'Demo scenario shipping-in-transit v1',
    employeeCode: 'DEMO-ST12',
  },
} as const;

type OperationalScenarioKey = keyof typeof SCENARIOS;

interface ScenarioOrder {
  id: string;
  orderNumber: string;
  fulfillmentType: string;
  status: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  pickupReadyAt: Date | null;
  payments: readonly {
    id: string;
    purpose: string;
    method: string;
    status: string;
    expectedAmount: { toString(): string };
    evidenceBucket: string | null;
    evidenceObjectPath: string | null;
    customerDeclaredAt: Date | null;
    submittedAt: Date | null;
    reviewedAt: Date | null;
  }[];
  reservations: readonly {
    status: string;
    holdReason: string;
    expiresAt: Date | null;
  }[];
  shipments: readonly {
    id: string;
    status: string;
    trackingCode: string;
    shippedAt: Date | null;
  }[];
}

interface CreatedOrder {
  id: string;
  orderNumber: string;
  paymentId?: string;
  expectedDeposit?: string;
}

interface OperationalScenarioContext {
  prisma: PrismaClient;
  api: Slice10ApiClient;
  startedAt: Date;
  sessionUserIds: Set<string>;
}

export async function provisionDemoScenarios(
  provisioners?: readonly DemoScenarioProvisioner[],
): Promise<DemoScenarioKey[]> {
  loadWorkspaceEnvironment();
  const connectionString = requiredEnvironment('DATABASE_URL', 'demo:scenarios');
  const database = assertDemoScenariosGuard({
    connectionString,
    nodeEnv: process.env['NODE_ENV'],
    confirmation: process.env['DEMO_SCENARIOS_CONFIRM'],
  });

  if (provisioners !== undefined) return orchestrateDemoScenarios(provisioners);

  const api = new Slice10ApiClient(requiredEnvironment('API_PUBLIC_URL', 'demo:scenarios'));
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const context: OperationalScenarioContext = {
    prisma,
    api,
    startedAt: new Date(),
    sessionUserIds: new Set<string>(),
  };

  try {
    await api.assertReady();
    const defaults: readonly DemoScenarioProvisioner[] = [
      ...(
        [
          'pickup-ready',
          'shipping-awaiting-proof',
          'shipping-under-review',
          'shipping-in-transit',
        ] as const
      ).map((key) => ({ key, provision: () => provisionOperationalScenario(context, key) })),
      {
        key: 'refund-processing',
        provision: () =>
          withEnvironmentConfirmation(
            'REFUND_PROCESSING_DEMO_CONFIRM',
            'create-refund-processing',
            provisionRefundProcessingScenario,
          ),
      },
      {
        key: 'after-sales-inspecting',
        provision: () =>
          withEnvironmentConfirmation(
            'AFTER_SALES_INSPECTING_DEMO_CONFIRM',
            'create-after-sales-inspecting',
            provisionAfterSalesInspectingScenario,
          ),
      },
    ];
    const completed = await orchestrateDemoScenarios(defaults);
    await assertCompleteSafeManifest();
    process.stdout.write(
      `${JSON.stringify({ status: 'passed', database, scenarios: completed })}\n`,
    );
    return completed;
  } finally {
    if (context.sessionUserIds.size > 0) {
      await deleteScriptSessions(prisma, [...context.sessionUserIds], context.startedAt);
    }
    await prisma.$disconnect();
  }
}

async function provisionOperationalScenario(
  context: OperationalScenarioContext,
  key: OperationalScenarioKey,
): Promise<void> {
  const definition = SCENARIOS[key];
  const existing = await loadScenarioOrder(context.prisma, definition.marker);
  if (existing !== null) {
    assertOperationalScenarioState(key, existing);
    await writeOperationalManifest(key, existing);
    writeScenarioResult(key, existing.orderNumber, true);
    return;
  }

  const identity = await prepareScenarioIdentity(context, key, definition.employeeCode);
  const created = await createScenarioOrder(context.api, identity, key, definition.marker);
  if (key === 'pickup-ready') {
    await transitionPickupReady(context.api, identity, created);
  } else if (key === 'shipping-under-review') {
    await submitProof(context.api, identity, requiredPayment(created));
  } else if (key === 'shipping-in-transit') {
    const payment = requiredPayment(created);
    await submitProof(context.api, identity, payment);
    await verifyProof(context.api, identity, payment);
    await transitionShippingInTransit(context.api, identity, created);
  }

  const persisted = await loadScenarioOrder(context.prisma, definition.marker);
  if (persisted === null) throw new Error(`${key}: scenario Order was not persisted`);
  assertOperationalScenarioState(key, persisted);
  await writeOperationalManifest(key, persisted);
  writeScenarioResult(key, persisted.orderNumber, false);
}

async function prepareScenarioIdentity(
  context: OperationalScenarioContext,
  key: OperationalScenarioKey,
  employeeCode: string,
): Promise<ScriptIdentity> {
  const identity = await prepareScriptIdentity(context.prisma, context.api, {
    customerEmail: `${key}-demo-customer@rephone.local`,
    employeeEmail: `${key}-demo-employee@rephone.local`,
    employeeCode,
    label: key
      .split('-')
      .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
      .join(' '),
    webOrigin: requiredEnvironment('WEB_ORIGIN', 'demo:scenarios'),
    seedCustomerEmail: requiredEnvironment('SEED_CUSTOMER_EMAIL', 'demo:scenarios'),
    seedCustomerPassword: requiredEnvironment('SEED_CUSTOMER_PASSWORD', 'demo:scenarios'),
    seedEmployeeEmail: requiredEnvironment('SEED_EMPLOYEE_EMAIL', 'demo:scenarios'),
    seedEmployeePassword: requiredEnvironment('SEED_EMPLOYEE_PASSWORD', 'demo:scenarios'),
  });
  context.sessionUserIds.add(identity.customerId);
  context.sessionUserIds.add(identity.employeeId);
  return identity;
}

async function createScenarioOrder(
  api: Slice10ApiClient,
  identity: ScriptIdentity,
  key: OperationalScenarioKey,
  marker: string,
): Promise<CreatedOrder> {
  await clearCart(api, identity.customerToken);
  const fulfillmentType = key === 'pickup-ready' ? 'PICKUP' : 'SHIPPING';
  const variantId = await findAvailableAccessory(
    api,
    process.env['SLICE12_DEMO_VARIANT_SKU']?.trim() || ACCESSORY_SKU,
    fulfillmentType,
  );
  await api.call(
    '/cart/items',
    [200, 201],
    authenticated(identity.customerToken, 'POST', {
      itemType: 'ACCESSORY',
      variantId,
      quantity: key === 'shipping-in-transit' ? 2 : 1,
    }),
  );
  const preview = data(
    (
      await api.call(
        '/checkouts/preview',
        200,
        authenticated(identity.customerToken, 'POST', { fulfillmentType }),
      )
    ).body,
  );
  const pricing = recordProperty(preview, 'pricing');
  const body: Record<string, unknown> = {
    fulfillmentType,
    contact: {
      fullName: `Demo ${key}`,
      email: identity.customerEmail,
      phone: '0900000000',
    },
    customerNote: marker,
    expectedCartUpdatedAt: stringProperty(preview, 'cartUpdatedAt'),
    expectedGrandTotal: stringProperty(pricing, 'grandTotal'),
    expectedDepositRequired: stringProperty(pricing, 'depositRequired'),
  };
  if (fulfillmentType === 'SHIPPING') {
    body['shippingAddress'] = {
      receiverName: `Demo ${key}`,
      phone: '0900000000',
      addressLine: '1 Nguyễn Huệ DEMO',
      ward: 'Bến Nghé',
      district: 'Quận 1',
      province: 'TP.HCM',
    };
  }
  const created = data(
    (await api.call('/checkouts', 201, authenticated(identity.customerToken, 'POST', body))).body,
  );
  const order = recordProperty(created, 'order');
  const result: CreatedOrder = {
    id: stringProperty(order, 'id'),
    orderNumber: stringProperty(order, 'orderNumber'),
  };
  if (fulfillmentType === 'SHIPPING') {
    const payment = arrayProperty(order, 'paymentAttempts')
      .map(record)
      .find((candidate) => candidate['status'] === 'AWAITING_PROOF');
    if (payment === undefined) throw new Error(`${key}: checkout has no deposit payment`);
    result.paymentId = stringProperty(payment, 'id');
    result.expectedDeposit = stringProperty(payment, 'expectedAmount');
    if (BigInt(result.expectedDeposit) <= 0n) {
      throw new Error(`${key}: shipping demo requires a positive deposit`);
    }
  }
  return result;
}

async function transitionPickupReady(
  api: Slice10ApiClient,
  identity: ScriptIdentity,
  order: CreatedOrder,
): Promise<void> {
  await api.call(
    `/backoffice/orders/${order.id}/confirm`,
    200,
    authenticated(identity.employeeToken, 'POST'),
  );
  await api.call(
    `/backoffice/orders/${order.id}/start-preparing`,
    200,
    authenticated(identity.employeeToken, 'POST'),
  );
  await api.call(
    `/backoffice/orders/${order.id}/mark-pickup-ready`,
    200,
    authenticated(identity.employeeToken, 'POST'),
  );
}

async function submitProof(
  api: Slice10ApiClient,
  identity: ScriptIdentity,
  payment: { paymentId: string; expectedDeposit: string },
): Promise<void> {
  const bytes = Uint8Array.from(await readFile(PROOF_ASSET));
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/png' }), 'demo-deposit-proof.png');
  await api.call(`/payments/${payment.paymentId}/submit-proof`, 200, {
    method: 'POST',
    headers: { Authorization: `Bearer ${identity.customerToken}` },
    body: form,
  });
}

async function verifyProof(
  api: Slice10ApiClient,
  identity: ScriptIdentity,
  payment: { paymentId: string; expectedDeposit: string },
): Promise<void> {
  await api.call(
    `/backoffice/payments/${payment.paymentId}/verify`,
    200,
    authenticated(identity.employeeToken, 'POST', {
      receivedAmount: payment.expectedDeposit,
    }),
  );
}

async function transitionShippingInTransit(
  api: Slice10ApiClient,
  identity: ScriptIdentity,
  order: CreatedOrder,
): Promise<void> {
  await api.call(
    `/backoffice/orders/${order.id}/start-preparing`,
    200,
    authenticated(identity.employeeToken, 'POST'),
  );
  const shipment = data(
    (
      await api.call(
        `/backoffice/orders/${order.id}/shipment`,
        201,
        authenticated(identity.employeeToken, 'POST', {
          carrierName: 'RePhone Demo Carrier',
          trackingCode: `DEMO-${order.orderNumber}`,
          trackingUrl: `https://tracking.example.test/${encodeURIComponent(order.orderNumber)}`,
        }),
      )
    ).body,
  );
  await api.call(
    `/backoffice/shipments/${stringProperty(shipment, 'id')}/hand-over`,
    200,
    authenticated(identity.employeeToken, 'POST'),
  );
}

async function loadScenarioOrder(
  prisma: PrismaClient,
  marker: string,
): Promise<ScenarioOrder | null> {
  return prisma.order.findFirst({
    where: { customerNote: marker },
    include: {
      payments: { orderBy: { createdAt: 'asc' } },
      reservations: { orderBy: { createdAt: 'asc' } },
      shipments: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

function assertOperationalScenarioState(key: OperationalScenarioKey, order: ScenarioOrder): void {
  const activeReservations = order.reservations.filter(({ status }) => status === 'ACTIVE');
  const depositPayments = order.payments.filter(
    ({ purpose, method }) => purpose === 'DEPOSIT' && method === 'BANK_TRANSFER',
  );
  const payment = depositPayments[0];

  if (key === 'pickup-ready') {
    if (
      order.fulfillmentType !== 'PICKUP' ||
      order.status !== 'PROCESSING' ||
      order.fulfillmentStatus !== 'READY' ||
      order.paymentStatus !== 'UNPAID' ||
      order.pickupReadyAt === null ||
      order.payments.length !== 0 ||
      activeReservations.length === 0 ||
      activeReservations.some(
        ({ holdReason, expiresAt }) => holdReason !== 'PICKUP' || expiresAt === null,
      )
    ) {
      throwUnexpectedState(key, order);
    }
    return;
  }

  if (
    order.fulfillmentType !== 'SHIPPING' ||
    depositPayments.length !== 1 ||
    payment === undefined
  ) {
    throwUnexpectedState(key, order);
  }

  if (key === 'shipping-awaiting-proof') {
    if (
      order.status !== 'PLACED' ||
      order.fulfillmentStatus !== 'PENDING' ||
      order.paymentStatus !== 'UNPAID' ||
      payment.status !== 'AWAITING_PROOF' ||
      payment.evidenceBucket !== null ||
      payment.evidenceObjectPath !== null ||
      activeReservations.length === 0 ||
      activeReservations.some(
        ({ holdReason, expiresAt }) => holdReason !== 'DEPOSIT' || expiresAt === null,
      ) ||
      order.shipments.length !== 0
    ) {
      throwUnexpectedState(key, order);
    }
    return;
  }

  if (key === 'shipping-under-review') {
    if (
      order.status !== 'PLACED' ||
      order.fulfillmentStatus !== 'PENDING' ||
      order.paymentStatus !== 'UNPAID' ||
      payment.status !== 'UNDER_REVIEW' ||
      payment.evidenceBucket === null ||
      payment.evidenceObjectPath === null ||
      payment.customerDeclaredAt === null ||
      payment.submittedAt === null ||
      payment.reviewedAt !== null ||
      activeReservations.length === 0 ||
      activeReservations.some(
        ({ holdReason, expiresAt }) => holdReason !== 'REVIEW' || expiresAt !== null,
      ) ||
      order.shipments.length !== 0
    ) {
      throwUnexpectedState(key, order);
    }
    return;
  }

  const shipment = order.shipments[0];
  if (
    order.status !== 'PROCESSING' ||
    order.fulfillmentStatus !== 'IN_TRANSIT' ||
    order.paymentStatus !== 'PARTIALLY_PAID' ||
    payment.status !== 'VERIFIED' ||
    payment.reviewedAt === null ||
    activeReservations.length !== 0 ||
    order.reservations.some(({ status }) => status !== 'CONSUMED') ||
    order.shipments.length !== 1 ||
    shipment === undefined ||
    shipment.status !== 'HANDED_TO_CARRIER' ||
    shipment.shippedAt === null
  ) {
    throwUnexpectedState(key, order);
  }
}

async function writeOperationalManifest(
  key: OperationalScenarioKey,
  order: ScenarioOrder,
): Promise<void> {
  const payment = order.payments.find(({ purpose }) => purpose === 'DEPOSIT');
  const shipment = order.shipments[0];
  await writeDemoManifestScenario(key, {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderStatus: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    ...(payment === undefined ? {} : { paymentId: payment.id, proofStatus: payment.status }),
    ...(shipment === undefined
      ? {}
      : {
          shipmentId: shipment.id,
          shipmentStatus: shipment.status,
          trackingCode: shipment.trackingCode,
        }),
  });
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

async function findAvailableAccessory(
  api: Slice10ApiClient,
  configuredSku: string,
  channel: 'PICKUP' | 'SHIPPING',
): Promise<string> {
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
        const supported = channel === 'PICKUP' ? availability['pickup'] : availability['shipping'];
        if (availability['inStock'] === true && supported === true) {
          return stringProperty(variant, 'id');
        }
      }
    }
  }
  throw new Error(
    `Configured Slice 12 variant ${configuredSku} is not public, ${channel.toLowerCase()}-capable and available`,
  );
}

function requiredPayment(order: CreatedOrder): { paymentId: string; expectedDeposit: string } {
  if (order.paymentId === undefined || order.expectedDeposit === undefined) {
    throw new Error(`${order.orderNumber}: expected a deposit payment`);
  }
  return { paymentId: order.paymentId, expectedDeposit: order.expectedDeposit };
}

function throwUnexpectedState(key: OperationalScenarioKey, order: ScenarioOrder): never {
  throw new Error(
    `${key}: existing marker ${order.orderNumber} is not in the expected demo state; no history was overwritten`,
  );
}

async function withEnvironmentConfirmation(
  name: string,
  value: string,
  operation: () => Promise<void>,
): Promise<void> {
  const previous = process.env[name];
  process.env[name] = value;
  try {
    await operation();
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, name);
    else process.env[name] = previous;
  }
}

async function assertCompleteSafeManifest(): Promise<void> {
  const manifest = await readDemoManifest();
  const missing = DEMO_SCENARIO_KEYS.filter((key) => manifest.scenarios[key] === undefined);
  if (missing.length > 0) throw new Error(`demo manifest is missing: ${missing.join(', ')}`);
}

function writeScenarioResult(
  scenario: OperationalScenarioKey,
  orderNumber: string,
  reused: boolean,
): void {
  process.stdout.write(`${JSON.stringify({ status: 'passed', scenario, reused, orderNumber })}\n`);
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && import.meta.url === pathToFileURL(resolve(entrypoint)).href;
}

if (isMainModule()) await provisionDemoScenarios();
