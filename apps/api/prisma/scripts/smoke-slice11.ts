import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedDatabase } from '../seed-data.js';
import {
  afterSalesMultipart,
  afterSalesOperationalFingerprint,
  assertAfterSalesPublicProjection,
  assertSignedUrlTtl,
  assertSlice11Preflight,
  completedOrderItem,
} from './slice11-script-support.js';
import {
  Slice10ApiClient,
  arrayProperty,
  assertNoStore,
  authenticated,
  createCompletedPickupOrder,
  data,
  deleteScriptSessions,
  prepareScriptIdentity,
  record,
  requiredEnvironment,
  stringProperty,
} from './slice10-script-support.js';

export async function runSlice11Smoke(): Promise<void> {
  loadWorkspaceEnvironment();
  const mode = smokeMode(process.env['SLICE11_SMOKE_MODE']);
  if (mode === 'smoke') assertFullSmokeConfirmation();
  const connectionString = requiredEnvironment('DATABASE_URL', 'Slice 11 smoke');
  const privateBucket = requiredEnvironment('SUPABASE_PRIVATE_BUCKET', 'Slice 11 smoke');
  const api = new Slice10ApiClient(requiredEnvironment('API_PUBLIC_URL', 'Slice 11 smoke'));
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const startedAt = new Date();
  const marker = startedAt.getTime().toString();
  let scriptUserIds: string[] = [];

  try {
    await api.assertReady();
    const beforeChecks = await assertSlice11Preflight(prisma, privateBucket, 'before');
    if (mode === 'preflight') {
      writeResult({ status: 'passed', mode, checks: ['api-readiness', ...beforeChecks] });
      return;
    }

    const supabase = await privateStorageClient(privateBucket);
    const identity = await prepareScriptIdentity(prisma, api, {
      customerEmail: 'slice11-smoke-customer@rephone.local',
      employeeEmail: 'slice11-smoke-employee@rephone.local',
      employeeCode: 'SL11-SMOKE',
      label: 'Slice 11 Smoke',
      webOrigin: requiredEnvironment('WEB_ORIGIN', 'Slice 11 smoke'),
      seedCustomerEmail: requiredEnvironment('SEED_CUSTOMER_EMAIL', 'Slice 11 smoke'),
      seedCustomerPassword: requiredEnvironment('SEED_CUSTOMER_PASSWORD', 'Slice 11 smoke'),
      seedEmployeeEmail: requiredEnvironment('SEED_EMPLOYEE_EMAIL', 'Slice 11 smoke'),
      seedEmployeePassword: requiredEnvironment('SEED_EMPLOYEE_PASSWORD', 'Slice 11 smoke'),
    });
    scriptUserIds = [identity.customerId, identity.employeeId];
    await assertNoUnresolvedPriorRun(prisma, identity.customerId);
    await assertRouteSecurity(api, identity.customerToken, identity.employeeToken);

    const order = await createCompletedPickupOrder(prisma, api, identity, {
      variantSku: process.env['SLICE11_SMOKE_VARIANT_SKU']?.trim() || 'ACC-CABLE-USBC-LTG-1M',
      marker: `Slice 11 after-sales smoke ${marker}`,
    });
    const item = await completedOrderItem(prisma, order.id);
    await assertWarrantyProjection(api, identity.customerToken, item.warrantyCode);

    const createdResponse = await api.call(
      '/after-sales',
      201,
      authenticated(identity.customerToken, 'POST', {
        orderItemId: item.id,
        type: 'WARRANTY',
        issueDescription: 'Phụ kiện smoke Slice 11 mất kết nối ngắt quãng trong quá trình sử dụng.',
      }),
    );
    assertNoStore(createdResponse.response, '/after-sales');
    const created = data(createdResponse.body);
    assertAfterSalesPublicProjection(created);
    const requestNumber = stringProperty(created, 'requestNumber');
    if (created['requestedResolution'] !== null || created['status'] !== 'REQUESTED') {
      throw new Error('Slice 11 smoke did not persist omitted requestedResolution as null');
    }
    const request = await prisma.afterSalesRequest.findUniqueOrThrow({
      where: { requestNumber },
    });

    const attachmentBytes = Uint8Array.from(
      await readFile(new URL('../demo-assets/catalog/cap-usb-c-to-lightning.png', import.meta.url)),
    );
    const uploadedResponse = await api.call(
      `/after-sales/${requestNumber}/attachments`,
      200,
      afterSalesMultipart(
        identity.customerToken,
        attachmentBytes,
        'slice11-smoke.png',
        'image/png',
      ),
    );
    assertNoStore(uploadedResponse.response, `/after-sales/${requestNumber}/attachments`);
    const uploaded = data(uploadedResponse.body);
    assertAfterSalesPublicProjection(uploaded);
    const attachments = arrayProperty(uploaded, 'attachments').map(record);
    if (attachments.length !== 1) throw new Error('Slice 11 smoke expected one attachment');
    const attachmentId = stringProperty(attachments[0] ?? {}, 'id');
    await assertOneStorageObject(supabase, privateBucket, request.id);

    const customerDetail = await api.call(
      `/after-sales/${requestNumber}`,
      200,
      authenticated(identity.customerToken),
    );
    assertNoStore(customerDetail.response, `/after-sales/${requestNumber}`);
    assertAfterSalesPublicProjection(data(customerDetail.body));

    const orderRecord = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { fulfillmentLocationId: true },
    });
    const received = await api.call(
      `/backoffice/after-sales/${request.id}/receive`,
      200,
      authenticated(identity.employeeToken, 'POST', {
        receivedLocationId: orderRecord.fulfillmentLocationId,
        note: 'Đã nhận đủ phụ kiện và hộp sản phẩm cho smoke Slice 11.',
      }),
    );
    assertNoStore(received.response, `/backoffice/after-sales/${request.id}/receive`);
    if (
      data(received.body)['receiveNote'] !==
      'Đã nhận đủ phụ kiện và hộp sản phẩm cho smoke Slice 11.'
    ) {
      throw new Error('Slice 11 smoke did not persist receiveNote');
    }
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
          'Đã tái hiện lỗi kết nối ngắt quãng bằng hai thiết bị kiểm thử khác nhau.',
      }),
    );

    const beforeSeed = await afterSalesOperationalFingerprint(prisma, request.id);
    await seedDatabase(prisma);
    await seedDatabase(prisma);
    if ((await afterSalesOperationalFingerprint(prisma, request.id)) !== beforeSeed) {
      throw new Error(`${requestNumber}: double seed changed the INSPECTING case fingerprint`);
    }

    const approval = {
      note: 'Xác nhận lỗi thuộc phạm vi bảo hành và đủ điều kiện sửa chữa.',
    };
    await api.call(
      `/backoffice/after-sales/${request.id}/approve`,
      200,
      authenticated(identity.employeeToken, 'POST', approval),
    );
    await api.call(
      `/backoffice/after-sales/${request.id}/approve`,
      200,
      authenticated(identity.employeeToken, 'POST', approval),
    );
    const resolution = {
      resolutionNote: 'Đã sửa chữa, kiểm tra ổn định và bàn giao phụ kiện cho khách.',
    };
    const resolved = await api.call(
      `/backoffice/after-sales/${request.id}/resolve-repaired`,
      200,
      authenticated(identity.employeeToken, 'POST', resolution),
    );
    if (data(resolved.body)['status'] !== 'RESOLVED') {
      throw new Error(`${requestNumber}: repaired resolution did not reach RESOLVED`);
    }
    const terminalFingerprint = await afterSalesOperationalFingerprint(prisma, request.id);
    await api.call(
      `/backoffice/after-sales/${request.id}/resolve-repaired`,
      200,
      authenticated(identity.employeeToken, 'POST', resolution),
    );
    if ((await afterSalesOperationalFingerprint(prisma, request.id)) !== terminalFingerprint) {
      throw new Error(`${requestNumber}: exact repaired replay duplicated a side effect`);
    }

    const staffUrl = await api.call(
      `/backoffice/after-sales/${request.id}/attachments/${attachmentId}/url`,
      200,
      authenticated(identity.employeeToken),
    );
    assertNoStore(staffUrl.response, 'backoffice after-sales attachment URL');
    assertSignedUrlTtl(data(staffUrl.body));
    await assertOneStorageObject(supabase, privateBucket, request.id);

    const afterChecks = await assertSlice11Preflight(prisma, privateBucket, 'after');
    writeResult({
      status: 'passed',
      mode,
      orderNumber: order.orderNumber,
      warrantyCode: item.warrantyCode,
      requestNumber,
      checks: [
        'api-readiness',
        ...beforeChecks,
        'private-bucket-policy',
        'customer-and-backoffice-rbac-no-store',
        'completed-order-warranty-projection',
        'warranty-case-create-null-requested-resolution',
        'private-attachment-upload-and-redaction',
        'receive-note-persistence',
        'inspection-and-double-seed-fingerprint',
        'approve-and-resolution-exact-replay',
        'signed-url-at-most-300-seconds',
        ...afterChecks,
      ],
    });
  } finally {
    if (scriptUserIds.length > 0) {
      await deleteScriptSessions(prisma, scriptUserIds, startedAt);
    }
    await prisma.$disconnect();
  }
}

async function assertRouteSecurity(
  api: Slice10ApiClient,
  customerToken: string,
  employeeToken: string,
): Promise<void> {
  const customerAnonymous = await api.call('/after-sales', 401);
  assertNoStore(customerAnonymous.response, '/after-sales anonymous');
  const backofficeAnonymous = await api.call('/backoffice/after-sales', 401);
  assertNoStore(backofficeAnonymous.response, '/backoffice/after-sales anonymous');
  const forbidden = await api.call('/backoffice/after-sales', 403, authenticated(customerToken));
  assertNoStore(forbidden.response, '/backoffice/after-sales customer');
  const employee = await api.call(
    '/backoffice/after-sales?page=1&pageSize=1',
    200,
    authenticated(employeeToken),
  );
  assertNoStore(employee.response, '/backoffice/after-sales employee');
}

async function assertWarrantyProjection(
  api: Slice10ApiClient,
  customerToken: string,
  warrantyCode: string,
): Promise<void> {
  const list = await api.call('/warranties?page=1&pageSize=100', 200, authenticated(customerToken));
  const entries = arrayProperty(record(list.body), 'data').map(record);
  if (!entries.some((entry) => entry['warrantyCode'] === warrantyCode)) {
    throw new Error(`Customer warranty list is missing ${warrantyCode}`);
  }
  const detail = await api.call(
    `/warranties/${encodeURIComponent(warrantyCode)}`,
    200,
    authenticated(customerToken),
  );
  if (data(detail.body)['warrantyCode'] !== warrantyCode) {
    throw new Error(`Customer warranty detail is missing ${warrantyCode}`);
  }
}

async function assertNoUnresolvedPriorRun(prisma: PrismaClient, customerId: string): Promise<void> {
  const unresolved = await prisma.afterSalesRequest.findFirst({
    where: {
      customerId,
      status: { in: ['REQUESTED', 'RECEIVED', 'INSPECTING', 'APPROVED'] },
      orderItem: { order: { customerNote: { startsWith: 'Slice 11 after-sales smoke ' } } },
    },
    select: { requestNumber: true, status: true },
  });
  if (unresolved !== null) {
    throw new Error(
      `Prior Slice 11 smoke left ${unresolved.requestNumber}/${unresolved.status} open; resolve it through the application before rerun`,
    );
  }
}

async function privateStorageClient(privateBucket: string): Promise<SupabaseClient> {
  const client = createClient(
    new URL(requiredEnvironment('SUPABASE_URL', 'Slice 11 full smoke')).origin,
    requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY', 'Slice 11 full smoke'),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const { data: bucket, error } = await client.storage.getBucket(privateBucket);
  if (error !== null)
    throw new Error(`Private bucket ${privateBucket} is unavailable (${error.message})`);
  if (bucket.public) throw new Error(`Private bucket ${privateBucket} must not be public`);
  return client;
}

async function assertOneStorageObject(
  client: SupabaseClient,
  privateBucket: string,
  requestId: string,
): Promise<void> {
  const { data: objects, error } = await client.storage
    .from(privateBucket)
    .list(`after-sales/${requestId}`, { limit: 100 });
  if (error !== null)
    throw new Error(`Cannot list after-sales smoke attachment (${error.message})`);
  if (objects.length !== 1) {
    throw new Error(
      `${requestId}: expected exactly one attachment object, received ${objects.length.toString()}`,
    );
  }
}

function smokeMode(value: string | undefined): 'preflight' | 'smoke' {
  const normalized = value?.trim().toLowerCase() ?? 'preflight';
  if (normalized === 'preflight' || normalized === 'smoke') return normalized;
  throw new Error('SLICE11_SMOKE_MODE must be preflight or smoke');
}

function assertFullSmokeConfirmation(): void {
  if (
    process.env['SLICE11_SMOKE_CONFIRM'] !== 'consume-one-accessory-and-create-after-sales-history'
  ) {
    throw new Error(
      'Full Slice 11 smoke creates permanent Order/Warranty/AfterSales history and consumes one accessory; set SLICE11_SMOKE_CONFIRM=consume-one-accessory-and-create-after-sales-history to continue',
    );
  }
}

function writeResult(result: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && import.meta.url === pathToFileURL(resolve(entrypoint)).href;
}

if (isMainModule()) await runSlice11Smoke();
