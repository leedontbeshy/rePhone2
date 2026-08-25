import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { writeDemoManifestScenario } from './demo-scenarios-support.js';
import {
  afterSalesMultipart,
  assertAfterSalesPublicProjection,
  assertSlice11Preflight,
  completedOrderItem,
} from './slice11-script-support.js';
import {
  Slice10ApiClient,
  assertNoStore,
  authenticated,
  createCompletedPickupOrder,
  data,
  databaseName,
  deleteScriptSessions,
  prepareScriptIdentity,
  requiredEnvironment,
  stringProperty,
} from './slice10-script-support.js';

const SCENARIO_KEY = 'after-sales-inspecting';
const SCENARIO_MARKER = 'Demo scenario after-sales-inspecting v1';
const SCENARIO_DESCRIPTION = 'Phụ kiện demo mất kết nối ngắt quãng và đang chờ kết luận kiểm định.';

export async function provisionAfterSalesInspectingScenario(): Promise<void> {
  loadWorkspaceEnvironment();
  const connectionString = requiredEnvironment('DATABASE_URL', SCENARIO_KEY);
  assertDemoTarget(connectionString);
  const privateBucket = requiredEnvironment('SUPABASE_PRIVATE_BUCKET', SCENARIO_KEY);
  const api = new Slice10ApiClient(requiredEnvironment('API_PUBLIC_URL', SCENARIO_KEY));
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const startedAt = new Date();
  let userIds: string[] = [];

  try {
    await api.assertReady();
    const existing = await prisma.afterSalesRequest.findFirst({
      where: {
        issueDescription: SCENARIO_DESCRIPTION,
        orderItem: { order: { customerNote: SCENARIO_MARKER } },
      },
      include: { orderItem: { include: { order: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing !== null) {
      assertScenarioState(existing, privateBucket);
      await assertSlice11Preflight(prisma, privateBucket, 'demo-reuse');
      await writeManifest(existing.orderItem.order, existing.id, existing.requestNumber);
      writeResult(existing.orderItem.order.orderNumber, existing.requestNumber, true);
      return;
    }

    const identity = await prepareScriptIdentity(prisma, api, {
      customerEmail: 'after-sales-inspecting-demo-customer@rephone.local',
      employeeEmail: 'after-sales-inspecting-demo-employee@rephone.local',
      employeeCode: 'DEMO-AS11',
      label: 'After Sales Inspecting Demo',
      webOrigin: requiredEnvironment('WEB_ORIGIN', SCENARIO_KEY),
      seedCustomerEmail: requiredEnvironment('SEED_CUSTOMER_EMAIL', SCENARIO_KEY),
      seedCustomerPassword: requiredEnvironment('SEED_CUSTOMER_PASSWORD', SCENARIO_KEY),
      seedEmployeeEmail: requiredEnvironment('SEED_EMPLOYEE_EMAIL', SCENARIO_KEY),
      seedEmployeePassword: requiredEnvironment('SEED_EMPLOYEE_PASSWORD', SCENARIO_KEY),
    });
    userIds = [identity.customerId, identity.employeeId];

    const priorOrder = await prisma.order.findFirst({
      where: { customerId: identity.customerId, customerNote: SCENARIO_MARKER },
      orderBy: { createdAt: 'desc' },
    });
    const order =
      priorOrder === null
        ? await createCompletedPickupOrder(prisma, api, identity, {
            variantSku: process.env['SLICE11_DEMO_VARIANT_SKU']?.trim() || 'ACC-CABLE-USBC-LTG-1M',
            marker: SCENARIO_MARKER,
          })
        : resumeCompletedOrder(priorOrder);
    const item = await completedOrderItem(prisma, order.id);
    const sourceOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { fulfillmentLocationId: true },
    });

    const createdResponse = await api.call(
      '/after-sales',
      201,
      authenticated(identity.customerToken, 'POST', {
        orderItemId: item.id,
        type: 'RETURN',
        issueDescription: SCENARIO_DESCRIPTION,
        requestedResolution: 'Kiểm tra và sửa nếu lỗi thuộc về sản phẩm.',
      }),
    );
    assertNoStore(createdResponse.response, '/after-sales');
    const requestNumber = stringProperty(data(createdResponse.body), 'requestNumber');
    assertAfterSalesPublicProjection(data(createdResponse.body));
    const request = await prisma.afterSalesRequest.findUniqueOrThrow({
      where: { requestNumber },
    });

    const attachmentBytes = Uint8Array.from(
      await readFile(new URL('../demo-assets/catalog/cap-usb-c-to-lightning.png', import.meta.url)),
    );
    const upload = await api.call(
      `/after-sales/${requestNumber}/attachments`,
      200,
      afterSalesMultipart(
        identity.customerToken,
        attachmentBytes,
        'after-sales-demo.png',
        'image/png',
      ),
    );
    assertNoStore(upload.response, `/after-sales/${requestNumber}/attachments`);
    assertAfterSalesPublicProjection(data(upload.body));

    await api.call(
      `/backoffice/after-sales/${request.id}/receive`,
      200,
      authenticated(identity.employeeToken, 'POST', {
        receivedLocationId: sourceOrder.fulfillmentLocationId,
        note: 'Đã nhận phụ kiện demo và hộp sản phẩm đầy đủ.',
      }),
    );
    await api.call(
      `/backoffice/after-sales/${request.id}/start-inspection`,
      200,
      authenticated(identity.employeeToken, 'POST'),
    );
    await api.call(
      `/backoffice/after-sales/${request.id}/record-inspection-summary`,
      200,
      authenticated(identity.employeeToken, 'POST', {
        inspectionSummary:
          'Đã tái hiện lỗi kết nối ngắt quãng; hồ sơ đang chờ quyết định của nhân viên.',
      }),
    );

    const persisted = await prisma.afterSalesRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: { orderItem: { include: { order: true } } },
    });
    assertScenarioState(persisted, privateBucket);
    await assertSlice11Preflight(prisma, privateBucket, 'demo-created');
    await writeManifest(persisted.orderItem.order, persisted.id, persisted.requestNumber);
    writeResult(persisted.orderItem.order.orderNumber, persisted.requestNumber, false);
  } finally {
    if (userIds.length > 0) await deleteScriptSessions(prisma, userIds, startedAt);
    await prisma.$disconnect();
  }
}

function assertDemoTarget(connectionString: string): void {
  const target = databaseName(connectionString);
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(`${SCENARIO_KEY} demo is disabled when NODE_ENV=production`);
  }
  if (!target.endsWith('_demo') && !target.endsWith('_test')) {
    throw new Error(
      `${SCENARIO_KEY} only accepts database names ending _demo or _test; received ${target}`,
    );
  }
  if (process.env['AFTER_SALES_INSPECTING_DEMO_CONFIRM'] !== 'create-after-sales-inspecting') {
    throw new Error(
      'Set AFTER_SALES_INSPECTING_DEMO_CONFIRM=create-after-sales-inspecting to create or reuse this guarded scenario',
    );
  }
}

function resumeCompletedOrder(order: {
  id: string;
  orderNumber: string;
  status: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  fulfillmentLocationId: string;
}) {
  if (
    order.status !== 'COMPLETED' ||
    order.fulfillmentStatus !== 'COMPLETED' ||
    order.paymentStatus !== 'PAID'
  ) {
    throw new Error(
      `${order.orderNumber}: interrupted demo Order is not safely resumable; inspect it before rerun`,
    );
  }
  return order;
}

function assertScenarioState(
  request: {
    id: string;
    type: string;
    status: string;
    receivedLocationId: string | null;
    receivedById: string | null;
    receiveNote: string | null;
    inspectionSummary: string | null;
    inventoryInspectionId: string | null;
    decisionNote: string | null;
    resolutionType: string | null;
    attachments: unknown;
  },
  privateBucket: string,
): void {
  const attachments = Array.isArray(request.attachments) ? request.attachments : [];
  const attachment = attachments[0] as Record<string, unknown> | undefined;
  if (
    request.type !== 'RETURN' ||
    request.status !== 'INSPECTING' ||
    request.receivedLocationId === null ||
    request.receivedById === null ||
    request.receiveNote === null ||
    request.inspectionSummary === null ||
    request.inventoryInspectionId !== null ||
    request.decisionNote !== null ||
    request.resolutionType !== null ||
    attachments.length !== 1 ||
    attachment?.['bucket'] !== privateBucket ||
    typeof attachment['objectPath'] !== 'string' ||
    !attachment['objectPath'].startsWith(`after-sales/${request.id}/`)
  ) {
    throw new Error(
      `Existing ${SCENARIO_KEY} marker is not in the expected INSPECTING state; no automatic rebuild was attempted`,
    );
  }
}

async function writeManifest(
  order: { id: string; orderNumber: string },
  requestId: string,
  requestNumber: string,
): Promise<void> {
  await writeDemoManifestScenario(SCENARIO_KEY, {
    orderId: order.id,
    orderNumber: order.orderNumber,
    afterSalesRequestId: requestId,
    requestNumber,
    requestStatus: 'INSPECTING',
  });
}

function writeResult(orderNumber: string, requestNumber: string, reused: boolean): void {
  process.stdout.write(
    `${JSON.stringify({
      status: 'passed',
      scenario: SCENARIO_KEY,
      reused,
      orderNumber,
      requestNumber,
      checks: [
        'demo-database-and-confirmation-guard',
        'application-command-only-business-transitions',
        'completed-accessory-source-order',
        'private-attachment-upload',
        'received-note-persistence',
        'after-sales-inspecting-state',
        'slice11-preflight',
        'safe-local-manifest',
      ],
    })}\n`,
  );
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && import.meta.url === pathToFileURL(resolve(entrypoint)).href;
}

if (isMainModule()) await provisionAfterSalesInspectingScenario();
