import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { findSlice10PreflightViolations } from './preflight-slice10.js';
import { writeDemoManifestScenario } from './demo-scenarios-support.js';
import {
  Slice10ApiClient,
  authenticated,
  createCompletedPickupOrder,
  data,
  databaseName,
  deleteScriptSessions,
  prepareScriptIdentity,
  requiredEnvironment,
  stringProperty,
} from './slice10-script-support.js';

const SCENARIO_KEY = 'refund-processing';
const SCENARIO_MARKER = 'Demo scenario refund-processing v1';
const SCENARIO_REASON = 'Hoàn tiền demo đang được nhân viên xử lý';

export async function provisionRefundProcessingScenario(): Promise<void> {
  loadWorkspaceEnvironment();
  const connectionString = requiredEnvironment('DATABASE_URL', 'refund-processing demo');
  assertDemoTarget(connectionString);
  const api = new Slice10ApiClient(requiredEnvironment('API_PUBLIC_URL', 'refund-processing demo'));
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const startedAt = new Date();
  let userIds: string[] = [];

  try {
    await api.assertReady();
    const existing = await prisma.refund.findFirst({
      where: { reason: SCENARIO_REASON, order: { customerNote: SCENARIO_MARKER } },
      include: { order: true },
      orderBy: { createdAt: 'desc' },
    });
    if (existing !== null) {
      assertScenarioState(existing);
      await assertPreflight(prisma);
      await writeManifest(
        existing.order.id,
        existing.order.orderNumber,
        existing.id,
        existing.amount.toString(),
      );
      writeResult(existing.order.orderNumber, existing.id, true);
      return;
    }

    const identity = await prepareScriptIdentity(prisma, api, {
      customerEmail: 'refund-processing-demo-customer@rephone.local',
      employeeEmail: 'refund-processing-demo-employee@rephone.local',
      employeeCode: 'DEMO-RF10',
      label: 'Refund Processing Demo',
      webOrigin: requiredEnvironment('WEB_ORIGIN', 'refund-processing demo'),
      seedCustomerEmail: requiredEnvironment('SEED_CUSTOMER_EMAIL', 'refund-processing demo'),
      seedCustomerPassword: requiredEnvironment('SEED_CUSTOMER_PASSWORD', 'refund-processing demo'),
      seedEmployeeEmail: requiredEnvironment('SEED_EMPLOYEE_EMAIL', 'refund-processing demo'),
      seedEmployeePassword: requiredEnvironment('SEED_EMPLOYEE_PASSWORD', 'refund-processing demo'),
    });
    userIds = [identity.customerId, identity.employeeId];

    const priorOrder = await prisma.order.findFirst({
      where: { customerId: identity.customerId, customerNote: SCENARIO_MARKER },
      include: { payments: true, refunds: true },
      orderBy: { createdAt: 'desc' },
    });
    const completedOrder =
      priorOrder === null
        ? await createCompletedPickupOrder(prisma, api, identity, {
            variantSku: process.env['SLICE10_DEMO_VARIANT_SKU']?.trim() || 'ACC-CABLE-USBC-LTG-1M',
            marker: SCENARIO_MARKER,
          })
        : resumeCompletedOrder(priorOrder);

    const created = data(
      (
        await api.call(
          `/backoffice/orders/${completedOrder.id}/refunds`,
          201,
          authenticated(identity.employeeToken, 'POST', {
            paymentId: completedOrder.paymentId,
            amount: completedOrder.grandTotal,
            method: 'BANK_TRANSFER',
            reason: SCENARIO_REASON,
          }),
        )
      ).body,
    );
    const refundId = stringProperty(created, 'id');
    const processing = data(
      (
        await api.call(
          `/backoffice/refunds/${refundId}/start-processing`,
          200,
          authenticated(identity.employeeToken, 'POST', {
            note: 'Chờ Admin tải chứng từ hoàn tiền demo',
          }),
        )
      ).body,
    );
    if (processing['status'] !== 'PROCESSING') {
      throw new Error('refund-processing demo did not reach PROCESSING');
    }

    const persisted = await prisma.refund.findUniqueOrThrow({
      where: { id: refundId },
      include: { order: true },
    });
    assertScenarioState(persisted);
    await assertPreflight(prisma);
    await writeManifest(
      completedOrder.id,
      completedOrder.orderNumber,
      refundId,
      completedOrder.grandTotal,
    );
    writeResult(completedOrder.orderNumber, refundId, false);
  } finally {
    if (userIds.length > 0) await deleteScriptSessions(prisma, userIds, startedAt);
    await prisma.$disconnect();
  }
}

function assertDemoTarget(connectionString: string): void {
  const target = databaseName(connectionString);
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('refund-processing demo is disabled when NODE_ENV=production');
  }
  if (!target.endsWith('_demo') && !target.endsWith('_test')) {
    throw new Error(
      `refund-processing demo only accepts database names ending _demo or _test; received ${target}`,
    );
  }
  if (process.env['REFUND_PROCESSING_DEMO_CONFIRM'] !== 'create-refund-processing') {
    throw new Error(
      'Set REFUND_PROCESSING_DEMO_CONFIRM=create-refund-processing to create or reuse the guarded scenario',
    );
  }
}

function resumeCompletedOrder(order: {
  id: string;
  orderNumber: string;
  status: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  grandTotal: { toString(): string };
  paidAmount: { toString(): string };
  refunds: readonly unknown[];
  payments: readonly {
    id: string;
    purpose: string;
    method: string;
    status: string;
    receivedAmount: { toString(): string } | null;
  }[];
}) {
  if (
    order.status !== 'COMPLETED' ||
    order.fulfillmentStatus !== 'COMPLETED' ||
    order.paymentStatus !== 'PAID' ||
    order.refunds.length !== 0 ||
    order.paidAmount.toString() !== order.grandTotal.toString()
  ) {
    throw new Error(
      `${order.orderNumber}: interrupted demo fixture is not safely resumable; inspect it before rerun`,
    );
  }
  const payments = order.payments.filter(
    ({ purpose, method, status, receivedAmount }) =>
      purpose === 'FULL_PAYMENT' &&
      method === 'CASH' &&
      status === 'VERIFIED' &&
      receivedAmount?.toString() === order.grandTotal.toString(),
  );
  const payment = payments[0];
  if (payments.length !== 1 || payment === undefined) {
    throw new Error(
      `${order.orderNumber}: interrupted demo fixture has no single verified payment`,
    );
  }
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    grandTotal: order.grandTotal.toString(),
    paymentId: payment.id,
  };
}

function assertScenarioState(refund: {
  status: string;
  method: string;
  processedById: string | null;
  processingAt: Date | null;
  completedAt: Date | null;
  evidenceBucket: string | null;
  evidenceObjectPath: string | null;
  order: { status: string; paymentStatus: string };
}): void {
  if (
    refund.status !== 'PROCESSING' ||
    refund.method !== 'BANK_TRANSFER' ||
    refund.processedById === null ||
    refund.processingAt === null ||
    refund.completedAt !== null ||
    refund.evidenceBucket !== null ||
    refund.evidenceObjectPath !== null ||
    refund.order.status !== 'COMPLETED' ||
    refund.order.paymentStatus !== 'PAID'
  ) {
    throw new Error(
      'Existing refund-processing marker is not in the expected PROCESSING state; no automatic rebuild was attempted',
    );
  }
}

async function assertPreflight(prisma: PrismaClient): Promise<void> {
  const checks = await findSlice10PreflightViolations(
    prisma,
    requiredEnvironment('SUPABASE_PRIVATE_BUCKET', 'refund-processing demo'),
  );
  const failed = checks.filter(({ count }) => count !== 0);
  if (failed.length > 0) {
    throw new Error(
      `Slice 10 preflight failed: ${failed
        .map(({ checkName, count }) => `${checkName}=${count.toString()}`)
        .join(', ')}`,
    );
  }
}

async function writeManifest(
  orderId: string,
  orderNumber: string,
  refundId: string,
  amount: string,
): Promise<void> {
  await writeDemoManifestScenario(SCENARIO_KEY, {
    orderId,
    orderNumber,
    refundId,
    refundStatus: 'PROCESSING',
    method: 'BANK_TRANSFER',
    amount,
  });
}

function writeResult(orderNumber: string, refundId: string, reused: boolean): void {
  process.stdout.write(
    `${JSON.stringify({
      status: 'passed',
      scenario: SCENARIO_KEY,
      reused,
      orderNumber,
      refundId,
      checks: [
        'demo-database-guard',
        'application-command-only-business-transitions',
        'completed-paid-source-order',
        'bank-refund-processing',
        'slice10-preflight',
        'safe-local-manifest',
      ],
    })}\n`,
  );
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && import.meta.url === pathToFileURL(resolve(entrypoint)).href;
}

if (isMainModule()) {
  await provisionRefundProcessingScenario();
}
