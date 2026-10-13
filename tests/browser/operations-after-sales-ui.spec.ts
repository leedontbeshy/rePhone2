import { fulfillPendingTasks } from './support/pending-tasks';
import { expect, test, type Page, type Response, type Route } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';

const CASE_ID = '0199d009-0000-7000-8000-000000000101';
const REFUND_ID = '0199d009-0000-7000-8000-000000000102';
const ORIGINAL_UNIT_ID = '0199d009-0000-7000-8000-000000000103';
const REPLACEMENT_UNIT_ID = '0199d009-0000-7000-8000-000000000104';
const PRODUCT_ID = '0199d009-0000-7000-8000-000000000105';
const VARIANT_ID = '0199d009-0000-7000-8000-000000000106';
const LOCATION_ID = '0199d009-0000-7000-8000-000000000107';
const ORDER_NUMBER = 'RPH-FE09-AS-0001';
const REQUEST_NUMBER = 'RPH-AS-FE09-UI';
const INVENTORY_CODE = 'RPH-U-FE09-ORIGINAL';

type Role = 'ADMIN' | 'EMPLOYEE';
type CaseStage =
  | 'REQUESTED'
  | 'RECEIVED'
  | 'INSPECTING_EMPTY'
  | 'INSPECTING_READY'
  | 'APPROVED'
  | 'REJECTED'
  | 'RESOLVED';
type Resolution = 'OTHER' | 'REFUNDED' | 'REPAIRED' | 'REPLACED' | 'RETURNED_UNCHANGED';

interface CaseState {
  assignedToId: string | null;
  decisionNote: string | null;
  inspectionSummary: string | null;
  receiveNote: string | null;
  resolution: Resolution | null;
  resolutionNote: string | null;
  stage: CaseStage;
}

interface FixtureProbe {
  commands: Array<{ body: unknown; path: string }>;
  detailReads: number;
  evidenceReads: number;
}

interface FixtureOptions {
  attachments?: readonly AttachmentFixture[];
  conflictOnce?: string;
  evidenceGate?: EvidenceGate;
  initialStage?: CaseStage;
  isIphone?: boolean;
  role?: Role;
}

interface AttachmentFixture {
  id: string;
  mimeType: 'application/pdf' | 'image/png';
}

interface EvidenceGate {
  readonly started: Promise<void>;
  markStarted(): void;
  release(): void;
  readonly released: Promise<void>;
}

test.describe('FE-09 after-sales click-level lifecycle', () => {
  test(bt('browser:operations-lifecycle', 'after-sales-intake-decision'), async ({ page }) => {
    const intake = await installFixture(page, {
      initialStage: 'REQUESTED',
      isIphone: false,
      role: 'EMPLOYEE',
    });
    await page.goto(`/backoffice/after-sales/${CASE_ID}`);
    await expect(page.getByRole('heading', { name: 'Hồ sơ hỗ trợ sau mua' })).toBeVisible();

    const assignment = page.locator('details').filter({ hasText: 'Phân công người phụ trách' });
    await assignment.locator('summary').click();
    const claim = assignment.getByRole('button', { name: 'Nhận xử lý', exact: true });
    await expect(claim).toBeVisible();
    await claim.dblclick();
    await expect(assignment.getByText('Bạn đang phụ trách hồ sơ này.')).toBeVisible();
    expect(commandCount(intake, 'assign')).toBe(1);

    const location = page.getByLabel('Địa điểm tiếp nhận');
    await expect(location).toHaveValue(LOCATION_ID);
    await page.getByLabel('Ghi chú khi nhận').fill('Phụ kiện được bàn giao nguyên trạng.');
    await page.getByRole('button', { name: 'Xác nhận tiếp nhận', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Bắt đầu kiểm tra', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Bắt đầu kiểm tra', exact: true }).click();
    const summary = page.getByLabel('Kết luận kiểm tra');
    await expect(summary).toBeVisible();
    await summary.fill('Đã kiểm tra phụ kiện, đủ căn cứ để tiếp tục xử lý.');
    await page.getByRole('button', { name: 'Lưu kết luận', exact: true }).click();

    await page.getByLabel('Ghi chú quyết định').fill('Yêu cầu đáp ứng điều kiện hỗ trợ.');
    await page.getByRole('button', { name: 'Chấp thuận yêu cầu', exact: true }).click();
    await expect(page.getByLabel('Phương án hoàn tất')).toBeVisible();
    await expect(page.getByText('Đã chấp thuận', { exact: true }).first()).toBeVisible();
    expect(intake.commands.map(({ path }) => operationName(path))).toEqual([
      'assign',
      'receive',
      'start-inspection',
      'record-inspection-summary',
      'approve',
    ]);

    const rejectPage = await page.context().newPage();
    const rejection = await installFixture(rejectPage, {
      conflictOnce: 'reject',
      initialStage: 'INSPECTING_READY',
      isIphone: false,
      role: 'EMPLOYEE',
    });
    await rejectPage.goto(`/backoffice/after-sales/${CASE_ID}`);
    const initialReads = rejection.detailReads;
    const conflictResponse = await rejectAfterSales(
      rejectPage,
      'Kiểm tra đồng thời đã thay đổi hồ sơ.',
    );
    expect(conflictResponse.status()).toBe(409);
    await expect(
      rejectPage.getByText('Hồ sơ vừa được xử lý ở phiên khác. Hãy tải lại.'),
    ).toBeVisible();
    await expect.poll(() => rejection.detailReads).toBeGreaterThan(initialReads);

    const rejectionResponse = await rejectAfterSales(
      rejectPage,
      'Không đủ điều kiện hỗ trợ sau khi kiểm tra.',
    );
    expect(rejectionResponse.status()).toBe(200);
    await expect(rejectPage.getByText('Không chấp thuận', { exact: true }).first()).toBeVisible();
    expect(commandCount(rejection, 'reject')).toBe(2);
    await rejectPage.close();
  });

  test(bt('browser:operations-lifecycle', 'after-sales-resolution-matrix'), async ({ page }) => {
    const resolutions = ['REPAIRED', 'RETURNED_UNCHANGED', 'REFUNDED', 'REPLACED'] as const;
    for (let index = 0; index < resolutions.length; index += 1) {
      const resolution = resolutions[index];
      if (resolution === undefined) continue;
      const current = index === 0 ? page : await page.context().newPage();
      const probe = await resolveAfterSales(current, resolution, 'EMPLOYEE');
      expect(commandCount(probe, `resolve-${operationSuffix(resolution)}`)).toBe(1);
      if (current !== page) await current.close();
    }

    const employeePage = await page.context().newPage();
    const employee = await installFixture(employeePage, {
      initialStage: 'APPROVED',
      isIphone: true,
      role: 'EMPLOYEE',
    });
    await employeePage.goto(`/backoffice/after-sales/${CASE_ID}`);
    const employeeOptions = employeePage.getByLabel('Phương án hoàn tất').locator('option');
    await expect(employeeOptions.filter({ hasText: 'Phương án khác' })).toHaveCount(0);
    expect(employee.commands).toEqual([]);
    await employeePage.close();

    const adminPage = await page.context().newPage();
    const admin = await resolveAfterSales(adminPage, 'OTHER', 'ADMIN');
    expect(commandCount(admin, 'resolve-other')).toBe(1);
    await adminPage.close();
  });

  test(bt('browser:operations-lifecycle', 'after-sales-evidence-refresh'), async ({ page }) => {
    const gate = evidenceGate();
    const fixture = await installFixture(page, {
      attachments: [
        { id: 'safe-evidence', mimeType: 'image/png' },
        { id: 'unsafe-evidence', mimeType: 'image/png' },
        { id: 'provider-error-evidence', mimeType: 'application/pdf' },
      ],
      evidenceGate: gate,
      initialStage: 'REQUESTED',
      role: 'EMPLOYEE',
    });
    await page.context().route('https://evidence.example/**', (route) =>
      route.fulfill({
        body: '<!doctype html><title>Minh chứng FE09</title>',
        contentType: 'text/html',
      }),
    );
    await page.goto(`/backoffice/after-sales/${CASE_ID}`);

    const safeItem = evidenceItem(page, 'Hình ảnh 1');
    const unsafeItem = evidenceItem(page, 'Hình ảnh 2');
    const providerItem = evidenceItem(page, 'Tài liệu 3');
    const firstPopupPromise = page.waitForEvent('popup');
    await safeItem.getByRole('button', { name: 'Xem minh chứng' }).click();
    const firstPopup = await firstPopupPromise;
    await gate.started;
    await expect(unsafeItem.getByRole('button', { name: 'Xem minh chứng' })).toBeDisabled();
    gate.release();
    await firstPopup.waitForURL(/evidence\.example\/safe-1/);
    const firstUrl = firstPopup.url();
    await firstPopup.close();

    const secondPopupPromise = page.waitForEvent('popup');
    await safeItem.getByRole('button', { name: 'Xem minh chứng' }).click();
    const secondPopup = await secondPopupPromise;
    await secondPopup.waitForURL(/evidence\.example\/safe-2/);
    expect(secondPopup.url()).not.toBe(firstUrl);
    await secondPopup.close();

    const unsafePopupPromise = page.waitForEvent('popup');
    await unsafeItem.getByRole('button', { name: 'Xem minh chứng' }).click();
    const unsafePopup = await unsafePopupPromise;
    await expect.poll(() => unsafePopup.isClosed()).toBe(true);
    await expect(page.getByText('Liên kết mở tệp không hợp lệ.')).toBeVisible();

    const providerPopupPromise = page.waitForEvent('popup');
    await providerItem.getByRole('button', { name: 'Xem minh chứng' }).click();
    const providerPopup = await providerPopupPromise;
    await expect.poll(() => providerPopup.isClosed()).toBe(true);
    await expect(page.getByText('Kho tệp riêng tư tạm thời không sẵn sàng.')).toBeVisible();
    expect(fixture.evidenceReads).toBe(4);
    expect(fixture.commands).toEqual([]);
  });
});

async function resolveAfterSales(
  page: Page,
  resolution: Resolution,
  role: Role,
): Promise<FixtureProbe> {
  const probe = await installFixture(page, {
    initialStage: 'APPROVED',
    isIphone: true,
    role,
  });
  await page.goto(`/backoffice/after-sales/${CASE_ID}`);
  const resolutionSelect = page.getByLabel('Phương án hoàn tất');
  await expect(resolutionSelect).toBeVisible();
  await resolutionSelect.selectOption(resolution);

  if (resolution === 'REFUNDED') {
    await expect(page.getByLabel('Khoản hoàn tiền')).toHaveValue(REFUND_ID);
  }
  if (resolution === 'REPLACED') {
    await expect(page.getByLabel('Máy thay thế')).toHaveValue(REPLACEMENT_UNIT_ID);
  }

  await page
    .getByLabel('Ghi chú hoàn tất')
    .fill(`Hoàn tất hồ sơ theo phương án ${resolution.toLocaleLowerCase('en-US')}.`);
  const actionForm = resolutionSelect.locator('xpath=ancestor::form[1]');
  await actionForm.getByRole('button', { name: 'Xác nhận hoàn tất', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Hoàn tất hồ sơ hỗ trợ?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Xác nhận hoàn tất', exact: true }).click();
  await expect(page.getByText('Đã hoàn tất', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kết quả cuối cùng' })).toBeVisible();
  return probe;
}

async function rejectAfterSales(page: Page, reason: string): Promise<Response> {
  await page.getByRole('button', { name: 'Không chấp thuận', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Không chấp thuận yêu cầu?' });
  await dialog.getByLabel('Lý do không chấp thuận').fill(reason);
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' &&
      new URL(candidate.url()).pathname.endsWith('/reject'),
  );
  await dialog.getByRole('button', { name: 'Xác nhận không chấp thuận' }).click();
  return response;
}

function evidenceItem(page: Page, label: string) {
  return page.locator('li').filter({ hasText: label });
}

async function installFixture(page: Page, options: FixtureOptions): Promise<FixtureProbe> {
  const role = options.role ?? 'EMPLOYEE';
  const user = staff(role);
  const state: CaseState = {
    assignedToId: options.initialStage === 'REQUESTED' ? null : user.id,
    decisionNote:
      options.initialStage === 'APPROVED' || options.initialStage === 'RESOLVED'
        ? 'Yêu cầu đã được chấp thuận.'
        : null,
    inspectionSummary:
      options.initialStage === 'INSPECTING_READY' ||
      options.initialStage === 'APPROVED' ||
      options.initialStage === 'RESOLVED'
        ? 'Đã hoàn tất kiểm tra và ghi nhận kết luận.'
        : null,
    receiveNote: options.initialStage === 'REQUESTED' ? null : 'Đã nhận sản phẩm.',
    resolution: null,
    resolutionNote: null,
    stage: options.initialStage ?? 'REQUESTED',
  };
  const probe: FixtureProbe = { commands: [], detailReads: 0, evidenceReads: 0 };
  const conflicts = new Set<string>();
  const attachments = options.attachments ?? [];

  await page.route('**/api/v1/auth/refresh', (route) =>
    json(route, { data: { accessToken: `fe09-after-sales-${role}`, user } }),
  );
  await page.route('**/api/v1/backoffice/**', async (route) => {
    if (await fulfillPendingTasks(route)) return;
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname;
    const method = request.method();
    if (method === 'OPTIONS') return preflight(route);

    if (apiPath.endsWith('/inventory-locations') && method === 'GET') {
      return json(route, {
        data: [
          {
            code: 'HCM-01',
            id: LOCATION_ID,
            name: 'Cửa hàng Hồ Chí Minh',
            status: 'ACTIVE',
            type: 'STORE',
          },
        ],
      });
    }

    if (apiPath.endsWith('/refunds') && method === 'GET') {
      return json(route, pageEnvelope([completedRefund()]));
    }

    if (apiPath.endsWith('/inventory-units') && method === 'GET') {
      const rows =
        url.searchParams.get('lifecycleStatus') === 'AVAILABLE'
          ? [inventoryUnit(REPLACEMENT_UNIT_ID, 'RPH-U-FE09-REPLACEMENT', 'AVAILABLE')]
          : [inventoryUnit(ORIGINAL_UNIT_ID, INVENTORY_CODE, 'SOLD')];
      return json(route, pageEnvelope(rows, 100));
    }

    const attachmentMatch = apiPath.match(
      new RegExp(`/after-sales/${CASE_ID}/attachments/([^/]+)/url$`),
    );
    if (attachmentMatch !== null && method === 'GET') {
      probe.evidenceReads += 1;
      const attachmentId = attachmentMatch[1] ?? '';
      if (attachmentId === 'safe-evidence' && probe.evidenceReads === 1 && options.evidenceGate) {
        options.evidenceGate.markStarted();
        await options.evidenceGate.released;
      }
      if (attachmentId === 'unsafe-evidence') {
        return json(route, {
          data: { expiresAt: '2026-09-02T12:05:00.000Z', url: 'javascript:alert(1)' },
        });
      }
      if (attachmentId === 'provider-error-evidence') {
        return json(route, errorEnvelope('STORAGE_UNAVAILABLE'), 503);
      }
      return json(route, {
        data: {
          expiresAt: '2026-09-02T12:05:00.000Z',
          url: `https://evidence.example/safe-${String(probe.evidenceReads)}?token=fresh`,
        },
      });
    }

    if (apiPath.endsWith(`/after-sales/${CASE_ID}`) && method === 'GET') {
      probe.detailReads += 1;
      return json(route, { data: caseDetail(state, role, options.isIphone === true, attachments) });
    }

    const commandMatch = apiPath.match(new RegExp(`/after-sales/${CASE_ID}/([^/]+)$`));
    if (commandMatch !== null && method === 'POST') {
      const operation = commandMatch[1] ?? '';
      const body = safeBody(route);
      probe.commands.push({ body, path: apiPath });
      if (options.conflictOnce === operation && !conflicts.has(operation)) {
        conflicts.add(operation);
        return json(route, errorEnvelope('CONCURRENT_MODIFICATION'), 409);
      }
      if (operation === 'resolve-other' && role !== 'ADMIN') {
        return json(route, errorEnvelope('FORBIDDEN'), 403);
      }
      applyCommand(state, operation, body, user.id);
      return json(route, { data: caseDetail(state, role, options.isIphone === true, attachments) });
    }

    return json(route, errorEnvelope('RESOURCE_NOT_FOUND'), 404);
  });
  return probe;
}

function applyCommand(state: CaseState, operation: string, body: unknown, userId: string): void {
  const input = record(body);
  if (operation === 'assign') {
    state.assignedToId = typeof input['employeeId'] === 'string' ? input['employeeId'] : userId;
    return;
  }
  if (operation === 'receive') {
    state.stage = 'RECEIVED';
    state.receiveNote = optionalText(input['note']);
    return;
  }
  if (operation === 'start-inspection') {
    state.stage = 'INSPECTING_EMPTY';
    return;
  }
  if (operation === 'record-inspection-summary') {
    state.stage = 'INSPECTING_READY';
    state.inspectionSummary = optionalText(input['inspectionSummary']);
    return;
  }
  if (operation === 'approve') {
    state.stage = 'APPROVED';
    state.decisionNote = optionalText(input['note']);
    return;
  }
  if (operation === 'reject') {
    state.stage = 'REJECTED';
    state.decisionNote = optionalText(input['reason']);
    return;
  }
  const resolution = resolutionFromOperation(operation);
  if (resolution !== null) {
    state.stage = 'RESOLVED';
    state.resolution = resolution;
    state.resolutionNote = optionalText(input['resolutionNote']);
  }
}

function caseDetail(
  state: CaseState,
  role: Role,
  isIphone: boolean,
  attachments: readonly AttachmentFixture[],
) {
  const status = statusForStage(state.stage);
  const resolved = state.stage === 'RESOLVED';
  const inspected =
    state.stage === 'INSPECTING_READY' ||
    state.stage === 'APPROVED' ||
    resolved ||
    state.stage === 'REJECTED';
  const received = state.stage !== 'REQUESTED';
  return {
    assignedTo:
      state.assignedToId === null ? null : { fullName: 'Nhân viên FE09', id: state.assignedToId },
    attachmentCount: attachments.length,
    attachments: attachments.map((attachment, index) => ({
      fileSize: 2_048 + index,
      id: attachment.id,
      mimeType: attachment.mimeType,
      uploadedAt: '2026-09-02T08:05:00.000Z',
    })),
    availableActions: actionsFor(state.stage, role, isIphone),
    cancelReason: null,
    customer: {
      email: 'khach@example.com',
      id: 'customer-fe09',
      name: 'Khách FE09',
      phone: '0900000000',
    },
    decidedBy:
      state.stage === 'APPROVED' || state.stage === 'REJECTED' || resolved
        ? { fullName: 'Nhân viên FE09', id: state.assignedToId ?? 'staff-employee' }
        : null,
    decisionNote: state.decisionNote,
    id: CASE_ID,
    inspection: null,
    inspectionSummary: state.inspectionSummary,
    issueDescription: 'Sản phẩm cần được kiểm tra trong hồ sơ FE09.',
    orderItem: {
      id: 'order-item-fe09',
      inventoryCode: isIphone ? INVENTORY_CODE : null,
      orderNumber: ORDER_NUMBER,
      productName: isIphone ? 'iPhone 17 Pro' : 'Cáp USB-C to Lightning',
      quantity: 1,
      variantName: isIphone ? '256 GB · Xanh đậm' : 'Dài 1 mét',
    },
    receiveNote: state.receiveNote,
    receivedBy: received ? { fullName: 'Nhân viên FE09', id: 'staff-employee' } : null,
    receivedLocation: received
      ? { code: 'HCM-01', id: LOCATION_ID, name: 'Cửa hàng Hồ Chí Minh', type: 'STORE' }
      : null,
    refund:
      state.resolution === 'REFUNDED'
        ? {
            amount: '3000000',
            completedAt: '2026-09-02T10:00:00.000Z',
            id: REFUND_ID,
            method: 'BANK_TRANSFER',
            status: 'COMPLETED',
          }
        : null,
    replacementUnit:
      state.resolution === 'REPLACED'
        ? { id: REPLACEMENT_UNIT_ID, inventoryCode: 'RPH-U-FE09-REPLACEMENT' }
        : null,
    requestedAt: '2026-09-02T08:00:00.000Z',
    requestedResolution: 'Kiểm tra và đưa ra phương án phù hợp',
    requestNumber: REQUEST_NUMBER,
    resolutionNote: state.resolutionNote,
    resolutionType: state.resolution,
    resolvedBy: resolved ? { fullName: 'Nhân viên FE09', id: 'staff-employee' } : null,
    returnNote: state.resolution === 'RETURNED_UNCHANGED' ? state.resolutionNote : null,
    status,
    timeline: {
      cancelledAt: null,
      decidedAt:
        state.stage === 'APPROVED' || state.stage === 'REJECTED' || resolved
          ? '2026-09-02T09:00:00.000Z'
          : null,
      inspectedAt: inspected ? '2026-09-02T08:45:00.000Z' : null,
      receivedAt: received ? '2026-09-02T08:20:00.000Z' : null,
      requestedAt: '2026-09-02T08:00:00.000Z',
      resolvedAt: resolved ? '2026-09-02T10:00:00.000Z' : null,
      returnedAt: state.resolution === 'RETURNED_UNCHANGED' ? '2026-09-02T10:00:00.000Z' : null,
    },
    type: 'WARRANTY',
    updatedAt: '2026-09-02T10:00:00.000Z',
    warranty: null,
  };
}

function actionsFor(stage: CaseStage, role: Role, isIphone: boolean): string[] {
  if (stage === 'REQUESTED') return ['ASSIGN', 'RECEIVE'];
  if (stage === 'RECEIVED') return ['ASSIGN', 'START_INSPECTION'];
  if (stage === 'INSPECTING_EMPTY') return ['ASSIGN', 'RECORD_INSPECTION_SUMMARY'];
  if (stage === 'INSPECTING_READY') {
    return ['ASSIGN', 'RECORD_INSPECTION_SUMMARY', 'APPROVE', 'REJECT'];
  }
  if (stage !== 'APPROVED') return [];
  return [
    'ASSIGN',
    'RESOLVE_REPAIRED',
    ...(isIphone ? ['RESOLVE_REPLACED'] : []),
    'RESOLVE_REFUNDED',
    'RESOLVE_RETURNED_UNCHANGED',
    ...(role === 'ADMIN' ? ['RESOLVE_OTHER'] : []),
  ];
}

function statusForStage(stage: CaseStage): string {
  if (stage === 'INSPECTING_EMPTY' || stage === 'INSPECTING_READY') return 'INSPECTING';
  return stage;
}

function resolutionFromOperation(operation: string): Resolution | null {
  if (operation === 'resolve-repaired') return 'REPAIRED';
  if (operation === 'resolve-replaced') return 'REPLACED';
  if (operation === 'resolve-refunded') return 'REFUNDED';
  if (operation === 'resolve-returned-unchanged') return 'RETURNED_UNCHANGED';
  if (operation === 'resolve-other') return 'OTHER';
  return null;
}

function operationSuffix(resolution: Resolution): string {
  if (resolution === 'RETURNED_UNCHANGED') return 'returned-unchanged';
  return resolution.toLocaleLowerCase('en-US');
}

function completedRefund() {
  return {
    amount: '3000000',
    completedAt: '2026-09-02T09:45:00.000Z',
    createdAt: '2026-09-02T09:00:00.000Z',
    evidenceAvailable: true,
    id: REFUND_ID,
    method: 'BANK_TRANSFER',
    orderNumber: ORDER_NUMBER,
    processingAt: '2026-09-02T09:10:00.000Z',
    requestedByType: 'STAFF',
    requester: null,
    status: 'COMPLETED',
    terminalAt: null,
  };
}

function inventoryUnit(id: string, inventoryCode: string, lifecycleStatus: 'AVAILABLE' | 'SOLD') {
  return {
    activeReservationCount: 0,
    availabilityReadiness: { isReady: lifecycleStatus === 'AVAILABLE', reasons: [] },
    availableActions: [],
    carrierName: null,
    compareAtPrice: '13900000',
    currentInspection: {
      batteryHealthPercent: 95,
      conditionGrade: 'A',
      id: `inspection-${id}`,
      inspectedAt: '2026-09-02T07:30:00.000Z',
      overallResult: 'PASSED',
    },
    id,
    inventoryCode,
    lifecycleStatus,
    location: {
      code: 'HCM-01',
      id: LOCATION_ID,
      name: 'Cửa hàng Hồ Chí Minh',
      type: 'STORE',
    },
    maskedIdentifiers: [{ maskedValue: '***********0909', type: 'IMEI_1' }],
    media: [],
    mediaCount: 0,
    modelNumber: 'A0001',
    product: { id: PRODUCT_ID, name: 'iPhone 17 Pro', slug: 'iphone-17-pro', status: 'ACTIVE' },
    receivedAt: '2026-09-02T07:00:00.000Z',
    regionCode: 'VN/A',
    salePrice: '12500000',
    simConfiguration: 'PHYSICAL_AND_ESIM',
    simLockStatus: 'UNLOCKED',
    updatedAt: '2026-09-02T07:30:00.000Z',
    variant: {
      displayName: '256 GB · Xanh đậm',
      id: VARIANT_ID,
      sku: 'IP17P-256-BLU',
      status: 'ACTIVE',
    },
    warrantyDaysOverride: 90,
  };
}

function staff(role: Role) {
  return {
    email: `${role.toLocaleLowerCase('en-US')}@rephone.local`,
    fullName: role === 'ADMIN' ? 'Quản trị FE09' : 'Nhân viên FE09',
    id: role === 'ADMIN' ? 'staff-admin' : 'staff-employee',
    phone: '0900000909',
    role,
    status: 'ACTIVE',
  };
}

function commandCount(probe: FixtureProbe, operation: string): number {
  return probe.commands.filter(({ path }) => operationName(path) === operation).length;
}

function operationName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] ?? '';
}

function pageEnvelope(data: unknown[], pageSize = 20) {
  return {
    data,
    meta: {
      pagination: {
        page: 1,
        pageSize,
        totalItems: data.length,
        totalPages: data.length === 0 ? 0 : 1,
      },
    },
  };
}

function evidenceGate(): EvidenceGate {
  let markStarted!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { markStarted, release, released, started };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function safeBody(route: Route): unknown {
  try {
    const raw = route.request().postData();
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return route.request().postData();
  }
}

function errorEnvelope(code: string) {
  return {
    error: { code, details: [], message: `Lỗi giả lập ${code}`, requestId: `fe09-${code}` },
  };
}

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: {
      'access-control-allow-credentials': 'true',
      'access-control-allow-origin': 'http://localhost:3001',
    },
    status,
  });
}

async function preflight(route: Route): Promise<void> {
  await route.fulfill({
    headers: {
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
      'access-control-allow-origin': 'http://localhost:3001',
    },
    status: 204,
  });
}
