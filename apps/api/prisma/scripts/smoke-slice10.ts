import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedDatabase } from '../seed-data.js';
import { findSlice10PreflightViolations } from './preflight-slice10.js';
import {
  Slice10ApiClient,
  assertNoForbiddenProjectionKeys,
  assertNoStore,
  authenticated,
  createCompletedPickupOrder,
  data,
  deleteScriptSessions,
  errorCode,
  multipart,
  prepareScriptIdentity,
  record,
  requiredEnvironment,
  stringProperty,
} from './slice10-script-support.js';

loadWorkspaceEnvironment();

const mode = smokeMode(process.env['SLICE10_SMOKE_MODE']);
if (mode === 'smoke') assertFullSmokeConfirmation();
const connectionString = requiredEnvironment('DATABASE_URL', 'Slice 10 smoke');
const privateBucket = requiredEnvironment('SUPABASE_PRIVATE_BUCKET', 'Slice 10 smoke');
const api = new Slice10ApiClient(requiredEnvironment('API_PUBLIC_URL', 'Slice 10 smoke'));
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const startedAt = new Date();
const marker = startedAt.getTime().toString();
const customerEmail = 'slice10-smoke-customer@rephone.local';
const employeeEmail = 'slice10-smoke-employee@rephone.local';
const variantSku = process.env['SLICE10_SMOKE_VARIANT_SKU']?.trim() || 'ACC-CABLE-USBC-LTG-1M';
let scriptUserIds: string[] = [];

try {
  await api.assertReady();
  const beforeChecks = await assertPreflight('before');
  if (mode === 'preflight') {
    writeResult({ status: 'passed', mode, checks: ['api-readiness', ...beforeChecks] });
  } else {
    const supabase = await privateStorageClient();
    const identity = await prepareScriptIdentity(prisma, api, {
      customerEmail,
      employeeEmail,
      employeeCode: 'SL10-SMOKE',
      label: 'Slice 10 Smoke',
      webOrigin: requiredEnvironment('WEB_ORIGIN', 'Slice 10 smoke'),
      seedCustomerEmail: requiredEnvironment('SEED_CUSTOMER_EMAIL', 'Slice 10 smoke'),
      seedCustomerPassword: requiredEnvironment('SEED_CUSTOMER_PASSWORD', 'Slice 10 smoke'),
      seedEmployeeEmail: requiredEnvironment('SEED_EMPLOYEE_EMAIL', 'Slice 10 smoke'),
      seedEmployeePassword: requiredEnvironment('SEED_EMPLOYEE_PASSWORD', 'Slice 10 smoke'),
    });
    scriptUserIds = [identity.customerId, identity.employeeId];
    await assertNoUnresolvedPriorRun(identity.customerId);
    await assertBackofficeSecurity(identity.customerToken, identity.employeeToken);

    const proofBytes = Uint8Array.from(
      await readFile(new URL('../demo-assets/catalog/cap-usb-c-to-lightning.png', import.meta.url)),
    );
    const differentProofBytes = Uint8Array.from(
      await readFile(new URL('../demo-assets/catalog/iphone-13.png', import.meta.url)),
    );
    const bank = await runBankFlow(identity, supabase, proofBytes, differentProofBytes);
    const cash = await runCashFlow(identity);
    const afterChecks = await assertPreflight('after');

    writeResult({
      status: 'passed',
      mode,
      bankOrderNumber: bank.orderNumber,
      bankRefundId: bank.refundId,
      cashOrderNumber: cash.orderNumber,
      cashRefundId: cash.refundId,
      checks: [
        'api-readiness',
        ...beforeChecks,
        'private-bucket-policy',
        'backoffice-rbac-no-store',
        'pickup-cash-source-orders-through-api',
        'manual-bank-refund-create-and-start',
        'double-seed-processing-state-safety',
        'bank-evidence-metadata-and-digest',
        'bank-exact-replay-no-extra-object-or-audit',
        'bank-different-evidence-conflict',
        'signed-url-ttl-and-no-store',
        'manual-cash-refund-create-start-complete-replay',
        'reject-and-cancel-requested-refunds',
        'aggregate-over-refund-rejected',
        'customer-refund-projection-redaction',
        'refund-audit-idempotency',
        ...afterChecks,
      ],
    });
  }
} finally {
  if (scriptUserIds.length > 0) {
    await deleteScriptSessions(prisma, scriptUserIds, startedAt);
  }
  await prisma.$disconnect();
}

async function runBankFlow(
  identity: Awaited<ReturnType<typeof prepareScriptIdentity>>,
  supabase: SupabaseClient,
  proofBytes: Uint8Array,
  differentProofBytes: Uint8Array,
): Promise<{ orderNumber: string; refundId: string }> {
  const order = await createCompletedPickupOrder(prisma, api, identity, {
    variantSku,
    marker: `Slice 10 bank smoke ${marker}`,
  });
  const reason = `Hoàn tiền ngân hàng Slice 10 smoke ${marker}`;
  const created = data(
    (
      await api.call(
        `/backoffice/orders/${order.id}/refunds`,
        201,
        authenticated(identity.employeeToken, 'POST', {
          paymentId: order.paymentId,
          amount: order.grandTotal,
          method: 'BANK_TRANSFER',
          reason,
        }),
      )
    ).body,
  );
  const refundId = stringProperty(created, 'id');
  const startNote = 'Đã đối soát thông tin nhận hoàn tiền';
  const started = await api.call(
    `/backoffice/refunds/${refundId}/start-processing`,
    200,
    authenticated(identity.employeeToken, 'POST', { note: startNote }),
  );
  assertNoStore(started.response, `/backoffice/refunds/${refundId}/start-processing`);
  assertRefundState(data(started.body), 'PROCESSING', 'BANK_TRANSFER');

  const fingerprintBeforeSeed = await operationalFingerprint(order.id, refundId);
  await seedDatabase(prisma);
  await seedDatabase(prisma);
  const fingerprintAfterSeed = await operationalFingerprint(order.id, refundId);
  if (fingerprintAfterSeed !== fingerprintBeforeSeed) {
    throw new Error(`${order.orderNumber}: double seed changed PROCESSING refund state`);
  }

  const completionNote = 'Đã hoàn tiền qua ngân hàng và lưu chứng từ';
  const completed = await api.call(
    `/backoffice/refunds/${refundId}/complete-bank-transfer`,
    200,
    multipart(identity.employeeToken, proofBytes, 'refund.png', 'image/png', completionNote),
  );
  assertNoStore(completed.response, `/backoffice/refunds/${refundId}/complete-bank-transfer`);
  assertRefundState(data(completed.body), 'COMPLETED', 'BANK_TRANSFER');
  await assertBankPersisted(order.id, refundId, proofBytes);
  await assertOneStorageObject(supabase, refundId);
  const terminalFingerprint = await operationalFingerprint(order.id, refundId);
  const terminalAudits = await refundAuditCount(refundId);

  const replay = await api.call(
    `/backoffice/refunds/${refundId}/complete-bank-transfer`,
    200,
    multipart(identity.employeeToken, proofBytes, 'refund.png', 'image/png', completionNote),
  );
  assertRefundState(data(replay.body), 'COMPLETED', 'BANK_TRANSFER');
  if (
    (await operationalFingerprint(order.id, refundId)) !== terminalFingerprint ||
    (await refundAuditCount(refundId)) !== terminalAudits
  ) {
    throw new Error(`${order.orderNumber}: exact bank evidence replay duplicated a side effect`);
  }
  await assertOneStorageObject(supabase, refundId);

  const conflict = await api.call(
    `/backoffice/refunds/${refundId}/complete-bank-transfer`,
    409,
    multipart(
      identity.employeeToken,
      differentProofBytes,
      'different.png',
      'image/png',
      completionNote,
    ),
  );
  if (errorCode(conflict.body) !== 'INVALID_STATE_TRANSITION') {
    throw new Error('Different bank evidence replay did not return INVALID_STATE_TRANSITION');
  }
  await assertOneStorageObject(supabase, refundId);

  const signed = await api.call(
    `/backoffice/refunds/${refundId}/evidence-url`,
    200,
    authenticated(identity.employeeToken),
  );
  assertNoStore(signed.response, `/backoffice/refunds/${refundId}/evidence-url`);
  const signedData = data(signed.body);
  const signedUrl = new URL(stringProperty(signedData, 'url'));
  if (!['http:', 'https:'].includes(signedUrl.protocol)) {
    throw new Error('Refund evidence signed URL uses an invalid protocol');
  }
  const expiresIn = Date.parse(stringProperty(signedData, 'expiresAt')) - Date.now();
  if (expiresIn <= 0 || expiresIn > 301_000) {
    throw new Error(
      `Refund evidence signed URL TTL is outside 0..300 seconds (${expiresIn.toString()})`,
    );
  }

  const publicDetail = await api.call(
    `/orders/${order.orderNumber}`,
    200,
    authenticated(identity.customerToken),
  );
  assertNoForbiddenProjectionKeys(data(publicDetail.body));
  assertPublicRefund(data(publicDetail.body), refundId, 'COMPLETED');
  return { orderNumber: order.orderNumber, refundId };
}

async function runCashFlow(
  identity: Awaited<ReturnType<typeof prepareScriptIdentity>>,
): Promise<{ orderNumber: string; refundId: string }> {
  const order = await createCompletedPickupOrder(prisma, api, identity, {
    variantSku,
    marker: `Slice 10 cash smoke ${marker}`,
  });
  const grandTotal = BigInt(order.grandTotal);
  if (grandTotal <= 2n) throw new Error('CASH smoke source amount must be greater than two VND');
  const amount = grandTotal - 2n;
  const created = data(
    (
      await api.call(
        `/backoffice/orders/${order.id}/refunds`,
        201,
        authenticated(identity.employeeToken, 'POST', {
          paymentId: order.paymentId,
          amount: amount.toString(),
          method: 'CASH',
          reason: `Hoàn tiền mặt Slice 10 smoke ${marker}`,
        }),
      )
    ).body,
  );
  const refundId = stringProperty(created, 'id');
  await api.call(
    `/backoffice/refunds/${refundId}/start-processing`,
    200,
    authenticated(identity.employeeToken, 'POST', {
      note: 'Nhân viên đã nhận nghĩa vụ hoàn tiền mặt',
    }),
  );
  const completionNote = 'Khách đã nhận đủ tiền mặt tại cửa hàng';
  const completed = await api.call(
    `/backoffice/refunds/${refundId}/complete-cash`,
    200,
    authenticated(identity.employeeToken, 'POST', { note: completionNote }),
  );
  assertRefundState(data(completed.body), 'COMPLETED', 'CASH');
  const fingerprint = await operationalFingerprint(order.id, refundId);
  const auditCount = await refundAuditCount(refundId);
  const replay = await api.call(
    `/backoffice/refunds/${refundId}/complete-cash`,
    200,
    authenticated(identity.employeeToken, 'POST', { note: completionNote }),
  );
  assertRefundState(data(replay.body), 'COMPLETED', 'CASH');
  if (
    (await operationalFingerprint(order.id, refundId)) !== fingerprint ||
    (await refundAuditCount(refundId)) !== auditCount
  ) {
    throw new Error(`${order.orderNumber}: exact CASH replay duplicated a side effect`);
  }
  const persisted = await prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
  if (
    persisted.evidenceBucket !== null ||
    persisted.evidenceObjectPath !== null ||
    persisted.evidenceMimeType !== null ||
    persisted.evidenceFileSize !== null ||
    persisted.evidenceSha256 !== null
  ) {
    throw new Error(`${order.orderNumber}: CASH refund unexpectedly stored evidence`);
  }

  const rejected = await createOneVndRefund(
    order.id,
    order.paymentId,
    identity.employeeToken,
    'CASH',
  );
  await api.call(
    `/backoffice/refunds/${rejected}/reject`,
    200,
    authenticated(identity.employeeToken, 'POST', {
      reason: 'Từ chối nghĩa vụ thử nghiệm theo yêu cầu smoke',
    }),
  );
  const cancelled = await createOneVndRefund(
    order.id,
    order.paymentId,
    identity.employeeToken,
    'BANK_TRANSFER',
  );
  await api.call(
    `/backoffice/refunds/${cancelled}/cancel`,
    200,
    authenticated(identity.employeeToken, 'POST', {
      reason: 'Hủy nghĩa vụ thử nghiệm theo yêu cầu smoke',
    }),
  );
  const overLimit = await api.call(
    `/backoffice/orders/${order.id}/refunds`,
    422,
    authenticated(identity.employeeToken, 'POST', {
      paymentId: order.paymentId,
      amount: '3',
      method: 'CASH',
      reason: 'Yêu cầu vượt giới hạn phải bị từ chối',
    }),
  );
  if (errorCode(overLimit.body) !== 'REFUND_AMOUNT_EXCEEDS_PAID') {
    throw new Error('Aggregate over-refund did not return REFUND_AMOUNT_EXCEEDS_PAID');
  }

  const publicDetail = await api.call(
    `/orders/${order.orderNumber}`,
    200,
    authenticated(identity.customerToken),
  );
  assertNoForbiddenProjectionKeys(data(publicDetail.body));
  assertPublicRefund(data(publicDetail.body), refundId, 'COMPLETED');
  return { orderNumber: order.orderNumber, refundId };
}

async function createOneVndRefund(
  orderId: string,
  paymentId: string,
  employeeToken: string,
  method: 'BANK_TRANSFER' | 'CASH',
): Promise<string> {
  const response = await api.call(
    `/backoffice/orders/${orderId}/refunds`,
    201,
    authenticated(employeeToken, 'POST', {
      paymentId,
      amount: '1',
      method,
      reason: `Nghĩa vụ terminal ${method} Slice 10 smoke`,
    }),
  );
  return stringProperty(data(response.body), 'id');
}

async function assertBackofficeSecurity(
  customerToken: string,
  employeeToken: string,
): Promise<void> {
  await api.call('/backoffice/refunds', 401);
  await api.call('/backoffice/refunds', 403, authenticated(customerToken));
  const response = await api.call('/backoffice/refunds?page=1&pageSize=1', 200, {
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  assertNoStore(response.response, '/backoffice/refunds');
}

async function assertNoUnresolvedPriorRun(customerId: string): Promise<void> {
  const unresolved = await prisma.refund.findFirst({
    where: {
      order: { customerId, customerNote: { startsWith: 'Slice 10 ' } },
      status: 'PROCESSING',
    },
    select: { id: true, order: { select: { orderNumber: true } } },
  });
  if (unresolved !== null && unresolved.order !== null) {
    throw new Error(
      `Prior Slice 10 smoke left Refund ${unresolved.id} for ${unresolved.order.orderNumber} PROCESSING; resolve it through the application before rerun`,
    );
  }
}

async function assertBankPersisted(
  orderId: string,
  refundId: string,
  proofBytes: Uint8Array,
): Promise<void> {
  const [refund, order] = await Promise.all([
    prisma.refund.findUniqueOrThrow({ where: { id: refundId } }),
    prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
  ]);
  const expectedDigest = createHash('sha256').update(proofBytes).digest('hex');
  if (
    refund.status !== 'COMPLETED' ||
    refund.method !== 'BANK_TRANSFER' ||
    refund.evidenceBucket !== privateBucket ||
    !refund.evidenceObjectPath?.startsWith(`refunds/${refund.id}/`) ||
    refund.evidenceMimeType !== 'image/png' ||
    refund.evidenceFileSize !== proofBytes.byteLength ||
    refund.evidenceSha256 !== expectedDigest ||
    order.refundedAmount.toString() !== refund.amount.toString() ||
    order.paymentStatus !== 'REFUNDED'
  ) {
    throw new Error(`${order.orderNumber}: completed bank refund invariant failed`);
  }
}

async function privateStorageClient(): Promise<SupabaseClient> {
  const client = createClient(
    new URL(requiredEnvironment('SUPABASE_URL', 'Slice 10 full smoke')).origin,
    requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY', 'Slice 10 full smoke'),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const { data: bucket, error } = await client.storage.getBucket(privateBucket);
  if (error !== null) {
    throw new Error(`Private bucket ${privateBucket} is unavailable (${error.message})`);
  }
  if (bucket.public) throw new Error(`Private bucket ${privateBucket} must not be public`);
  return client;
}

async function assertOneStorageObject(client: SupabaseClient, refundId: string): Promise<void> {
  const { data: objects, error } = await client.storage
    .from(privateBucket)
    .list(`refunds/${refundId}`, { limit: 100 });
  if (error !== null) throw new Error(`Cannot list refund smoke evidence (${error.message})`);
  if (objects.length !== 1) {
    throw new Error(
      `${refundId}: expected exactly one evidence object, received ${objects.length.toString()}`,
    );
  }
}

async function operationalFingerprint(orderId: string, refundId: string): Promise<string> {
  const [order, refund, auditCount] = await Promise.all([
    prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        status: true,
        fulfillmentStatus: true,
        paymentStatus: true,
        paidAmount: true,
        refundedAmount: true,
        balanceDue: true,
        updatedAt: true,
      },
    }),
    prisma.refund.findUniqueOrThrow({ where: { id: refundId } }),
    refundAuditCount(refundId),
  ]);
  return JSON.stringify({
    order: {
      ...order,
      paidAmount: order.paidAmount.toString(),
      refundedAmount: order.refundedAmount.toString(),
      balanceDue: order.balanceDue.toString(),
    },
    refund: {
      ...refund,
      amount: refund.amount.toString(),
    },
    auditCount,
  });
}

function refundAuditCount(refundId: string): Promise<number> {
  return prisma.auditLog.count({ where: { resourceType: 'Refund', resourceId: refundId } });
}

async function assertPreflight(stage: 'before' | 'after'): Promise<string[]> {
  const checks = await findSlice10PreflightViolations(prisma, privateBucket);
  const failed = checks.filter(({ count }) => count !== 0);
  if (failed.length > 0) {
    throw new Error(
      `Slice 10 ${stage} preflight failed: ${failed
        .map(({ checkName, count }) => `${checkName}=${count.toString()}`)
        .join(', ')}`,
    );
  }
  return checks.map(({ checkName }) => `${stage}-preflight:${checkName}`);
}

function assertRefundState(refund: Record<string, unknown>, status: string, method: string): void {
  if (refund['status'] !== status || refund['method'] !== method) {
    throw new Error(
      `Expected Refund ${method}/${status}, received ${String(refund['method'])}/${String(refund['status'])}`,
    );
  }
}

function assertPublicRefund(
  order: Record<string, unknown>,
  refundId: string,
  status: string,
): void {
  const refunds = Array.isArray(order['refunds']) ? order['refunds'].map(record) : [];
  const target = refunds.find(({ id }) => id === refundId);
  if (target === undefined || target['status'] !== status) {
    throw new Error(`Customer Order projection is missing Refund ${refundId}/${status}`);
  }
}

function smokeMode(value: string | undefined): 'preflight' | 'smoke' {
  const normalized = value?.trim().toLowerCase() ?? 'preflight';
  if (normalized === 'preflight' || normalized === 'smoke') return normalized;
  throw new Error('SLICE10_SMOKE_MODE must be preflight or smoke');
}

function assertFullSmokeConfirmation(): void {
  if (process.env['SLICE10_SMOKE_CONFIRM'] !== 'consume-two-accessories-and-create-refunds') {
    throw new Error(
      'Full Slice 10 smoke creates permanent Order/Payment/Refund history and consumes two accessories; set SLICE10_SMOKE_CONFIRM=consume-two-accessories-and-create-refunds to continue',
    );
  }
}

function writeResult(result: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
