import { expect, test, type Page, type Route } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';

const WARRANTY_ID = '0199d009-0000-7000-8000-000000000091';
const POLICY_ID = '0199d009-0000-7000-8000-000000000092';

type Role = 'ADMIN' | 'EMPLOYEE';

interface Command {
  readonly body: unknown;
  readonly method: string;
  readonly path: string;
}

interface WarrantyProbe {
  readonly commands: Command[];
  detailReads: number;
}

interface PolicyProbe {
  readonly commands: Command[];
  detailReads: number;
}

interface PolicyState {
  archiveBlockedReason: 'ACTIVE_CATALOG_REFERENCES' | null;
  archivedAt: string | null;
  code: string;
  createdAt: string;
  defaultDays: number;
  id: string;
  isArchived: boolean;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  terms: string;
  updatedAt: string;
}

test.describe('FE09 warranty click-level lifecycle contracts', () => {
  test(bt('browser:operations-lifecycle', 'warranty-void-boundary'), async ({ page }) => {
    const employee = await warrantyFixture(page, 'EMPLOYEE');
    await page.goto(`/backoffice/warranties/${WARRANTY_ID}`);

    await expect(page.getByRole('heading', { name: 'Chi tiết bảo hành' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Vô hiệu bảo hành' })).toHaveCount(0);
    expect(employee.commands).toEqual([]);

    const admin = await page.context().newPage();
    const adminProbe = await warrantyFixture(admin, 'ADMIN');
    await admin.goto(`/backoffice/warranties/${WARRANTY_ID}`);
    await admin.getByRole('button', { name: 'Vô hiệu bảo hành' }).click();
    const dialog = admin.getByRole('dialog', { name: 'Vô hiệu bảo hành này?' });
    await dialog.getByLabel('Lý do vô hiệu').fill('Bảo hành được cấp nhầm cho thiết bị');
    await dialog.getByRole('button', { name: 'Vô hiệu bảo hành', exact: true }).dblclick();

    await expect(admin.getByText('Đã vô hiệu bảo hành.', { exact: false })).toBeVisible();
    await expect(admin.getByText('Không còn hiệu lực', { exact: true }).first()).toBeVisible();
    await expect(admin.getByRole('button', { name: 'Vô hiệu bảo hành' })).toHaveCount(0);
    expect(adminProbe.commands.filter(({ path }) => path.endsWith('/void'))).toHaveLength(1);
    expect(adminProbe.detailReads).toBeGreaterThanOrEqual(2);
    await admin.close();

    const conflict = await page.context().newPage();
    const conflictProbe = await warrantyFixture(conflict, 'ADMIN', { conflictOnce: true });
    await conflict.goto(`/backoffice/warranties/${WARRANTY_ID}`);
    await conflict.getByRole('button', { name: 'Vô hiệu bảo hành' }).click();
    const conflictDialog = conflict.getByRole('dialog', { name: 'Vô hiệu bảo hành này?' });
    await conflictDialog.getByLabel('Lý do vô hiệu').fill('Dữ liệu vừa được xử lý ở phiên khác');
    await conflictDialog.getByRole('button', { name: 'Vô hiệu bảo hành', exact: true }).click();

    await expect(conflict.getByText('Dữ liệu vừa được cập nhật. Hãy tải lại trang.')).toBeVisible();
    await expect(conflict.getByText('Không còn hiệu lực', { exact: true }).first()).toBeVisible();
    await expect(conflict.getByRole('button', { name: 'Vô hiệu bảo hành' })).toHaveCount(0);
    expect(conflictProbe.commands.filter(({ path }) => path.endsWith('/void'))).toHaveLength(1);
    expect(conflictProbe.detailReads).toBeGreaterThanOrEqual(2);
    await conflict.close();
  });

  test(bt('browser:operations-lifecycle', 'warranty-policy-lifecycle'), async ({ page }) => {
    test.slow();
    const lifecycle = await policyFixture(page, { initiallyEmpty: true });
    await page.goto('/backoffice/warranty-policies');
    await page.getByRole('button', { name: 'Thêm chính sách' }).first().click();
    await page.getByLabel('Mã chính sách').fill('FE09-CLICK');
    await page.getByLabel('Tên chính sách').fill('Chính sách thao tác FE09');
    await page.getByLabel('Thời hạn mặc định (ngày)').fill('180');
    await page.getByLabel('Điều khoản').fill('Điều khoản được tạo hoàn toàn qua giao diện.');
    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === '/api/v1/backoffice/warranty-policies',
      ),
      page.getByRole('button', { name: 'Tạo chính sách', exact: true }).click(),
    ]);

    expect(createResponse.status()).toBe(200);
    await expect(page.getByText('Đã tạo chính sách.', { exact: false })).toBeVisible();
    expect(lifecycle.detailReads).toBe(1);
    await page.getByLabel('Tên chính sách').fill('Chính sách thao tác FE09 đã chỉnh sửa');
    await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await expect(page.getByText('Đã lưu thay đổi chính sách.', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Bắt đầu áp dụng', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ngừng áp dụng', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Ngừng áp dụng', exact: true }).click();
    const deactivate = page.getByRole('dialog', { name: 'Ngừng áp dụng chính sách?' });
    await deactivate.getByLabel('Lý do ngừng áp dụng').fill('Cập nhật phạm vi áp dụng mới');
    await deactivate.getByRole('button', { name: 'Ngừng áp dụng', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Bắt đầu áp dụng', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Lưu trữ vĩnh viễn', exact: true }).click();
    const archive = page.getByRole('dialog', { name: 'Lưu trữ chính sách?' });
    await archive.getByLabel('Lý do lưu trữ').fill('Chính sách đã được thay thế hoàn toàn');
    await archive.getByRole('button', { name: 'Lưu trữ vĩnh viễn', exact: true }).click();

    await expect(page.locator('p').filter({ hasText: /^Đã lưu trữ$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bắt đầu áp dụng' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Lưu trữ vĩnh viễn' })).toHaveCount(0);
    expect(lifecycle.commands.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'POST /api/v1/backoffice/warranty-policies',
      `PATCH /api/v1/backoffice/warranty-policies/${POLICY_ID}`,
      `POST /api/v1/backoffice/warranty-policies/${POLICY_ID}/activate`,
      `POST /api/v1/backoffice/warranty-policies/${POLICY_ID}/deactivate`,
      `POST /api/v1/backoffice/warranty-policies/${POLICY_ID}/archive`,
    ]);

    const blocked = await page.context().newPage();
    const blockedProbe = await policyFixture(blocked, { archiveBlocked: true });
    await blocked.goto('/backoffice/warranty-policies');
    await blocked
      .getByRole('button', { name: 'Xem chi tiết chính sách FE09-CLICK', exact: true })
      .click();
    await expect(blocked.getByText('Chưa thể lưu trữ', { exact: true })).toBeVisible();
    await expect(blocked.getByRole('button', { name: 'Lưu trữ vĩnh viễn' })).toHaveCount(0);
    expect(blockedProbe.commands).toEqual([]);
    await blocked.close();

    const conflict = await page.context().newPage();
    const conflictProbe = await policyFixture(conflict, {
      conflictOnEdit: true,
      failConflictRefetchOnce: true,
    });
    await conflict.goto('/backoffice/warranty-policies');
    await conflict
      .getByRole('button', { name: 'Xem chi tiết chính sách FE09-CLICK', exact: true })
      .click();
    await conflict.getByLabel('Tên chính sách').fill('Tên ghi đè từ phiên cũ');
    await conflict.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();

    await expect(conflict.getByRole('heading', { name: 'Cần tải lại chính sách' })).toBeVisible();
    await expect(conflict.getByText(/Dữ liệu vừa được cập nhật/)).toBeVisible();
    await conflict.getByRole('button', { name: 'Tải lại chi tiết', exact: true }).click();
    await expect(conflict.getByLabel('Tên chính sách')).toHaveValue('Chính sách từ máy chủ');
    expect(conflictProbe.commands.filter(({ method }) => method === 'PATCH')).toHaveLength(1);
    expect(conflictProbe.detailReads).toBeGreaterThanOrEqual(3);
    await conflict.close();
  });
});

async function warrantyFixture(
  page: Page,
  role: Role,
  options: Readonly<{ conflictOnce?: boolean }> = {},
): Promise<WarrantyProbe> {
  const probe: WarrantyProbe = { commands: [], detailReads: 0 };
  let projection = warrantyProjection(role, false);
  let conflictPending = options.conflictOnce === true;

  await authFixture(page, role);
  await page.route('**/api/v1/backoffice/warranties/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method === 'OPTIONS') return preflight(route);
    if (method === 'GET' && path === `/api/v1/backoffice/warranties/${WARRANTY_ID}`) {
      probe.detailReads += 1;
      return json(route, { data: projection });
    }
    if (method === 'POST' && path.endsWith(`/${WARRANTY_ID}/void`)) {
      probe.commands.push({ body: safeBody(route), method, path });
      if (role !== 'ADMIN') return json(route, errorBody('FORBIDDEN'), 403);
      projection = warrantyProjection(role, true);
      if (conflictPending) {
        conflictPending = false;
        return json(route, errorBody('CONCURRENT_MODIFICATION'), 409);
      }
      await delay(80);
      return json(route, { data: projection });
    }
    return json(route, errorBody('RESOURCE_NOT_FOUND'), 404);
  });
  return probe;
}

async function policyFixture(
  page: Page,
  options: Readonly<{
    archiveBlocked?: boolean;
    conflictOnEdit?: boolean;
    failConflictRefetchOnce?: boolean;
    initiallyEmpty?: boolean;
  }> = {},
): Promise<PolicyProbe> {
  const probe: PolicyProbe = { commands: [], detailReads: 0 };
  let state: PolicyState | null = options.initiallyEmpty === true ? null : policyState();
  let conflictPending = options.conflictOnEdit === true;
  let conflictRefetchFailurePending = options.failConflictRefetchOnce === true;
  let conflictStarted = false;
  if (state !== null && options.archiveBlocked === true) {
    state.archiveBlockedReason = 'ACTIVE_CATALOG_REFERENCES';
  }

  await authFixture(page, 'ADMIN');
  await page.route('**/api/v1/backoffice/warranty-policies**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method === 'OPTIONS') return preflight(route);
    if (method === 'GET' && path === '/api/v1/backoffice/warranty-policies') {
      return json(route, policyPage(state));
    }
    if (method === 'GET' && path === `/api/v1/backoffice/warranty-policies/${POLICY_ID}`) {
      probe.detailReads += 1;
      if (conflictStarted && conflictRefetchFailurePending) {
        conflictRefetchFailurePending = false;
        return json(route, errorBody('SERVICE_UNAVAILABLE'), 503);
      }
      return state === null
        ? json(route, errorBody('RESOURCE_NOT_FOUND'), 404)
        : json(route, { data: policyProjection(state) });
    }
    if (method === 'POST' && path === '/api/v1/backoffice/warranty-policies') {
      probe.commands.push({ body: safeBody(route), method, path });
      const body = recordBody(route);
      state = policyState({
        code: stringField(body, 'code', 'FE09-CLICK'),
        defaultDays: numberField(body, 'defaultDays', 180),
        name: stringField(body, 'name', 'Chính sách thao tác FE09'),
        terms: stringField(body, 'terms', 'Điều khoản được tạo qua giao diện.'),
      });
      return json(route, { data: policyProjection(state) });
    }
    if (method === 'PATCH' && path === `/api/v1/backoffice/warranty-policies/${POLICY_ID}`) {
      probe.commands.push({ body: safeBody(route), method, path });
      if (state === null) return json(route, errorBody('RESOURCE_NOT_FOUND'), 404);
      if (conflictPending) {
        conflictPending = false;
        conflictStarted = true;
        state = policyState({ ...state, name: 'Chính sách từ máy chủ' });
        return json(route, errorBody('CONCURRENT_MODIFICATION'), 409);
      }
      const body = recordBody(route);
      state = policyState({
        ...state,
        defaultDays: numberField(body, 'defaultDays', state.defaultDays),
        name: stringField(body, 'name', state.name),
        terms: stringField(body, 'terms', state.terms),
      });
      return json(route, { data: policyProjection(state) });
    }
    if (method === 'POST' && path.endsWith(`/${POLICY_ID}/activate`)) {
      probe.commands.push({ body: safeBody(route), method, path });
      if (state === null) return json(route, errorBody('RESOURCE_NOT_FOUND'), 404);
      state = policyState({ ...state, status: 'ACTIVE' });
      return json(route, { data: policyProjection(state) });
    }
    if (method === 'POST' && path.endsWith(`/${POLICY_ID}/deactivate`)) {
      probe.commands.push({ body: safeBody(route), method, path });
      if (state === null) return json(route, errorBody('RESOURCE_NOT_FOUND'), 404);
      state = policyState({ ...state, status: 'INACTIVE' });
      return json(route, { data: policyProjection(state) });
    }
    if (method === 'POST' && path.endsWith(`/${POLICY_ID}/archive`)) {
      probe.commands.push({ body: safeBody(route), method, path });
      if (state === null) return json(route, errorBody('RESOURCE_NOT_FOUND'), 404);
      if (state.archiveBlockedReason !== null) {
        return json(route, errorBody('INVALID_STATE_TRANSITION'), 409);
      }
      state = policyState({
        ...state,
        archivedAt: '2026-09-02T10:00:00.000Z',
        isArchived: true,
        status: 'INACTIVE',
      });
      return json(route, { data: policyProjection(state) });
    }
    return json(route, errorBody('RESOURCE_NOT_FOUND'), 404);
  });
  return probe;
}

async function authFixture(page: Page, role: Role): Promise<void> {
  await page.route('**/api/v1/auth/refresh', (route) =>
    json(route, { data: { accessToken: `fe09-warranty-${role}`, user: staff(role) } }),
  );
}

function warrantyProjection(role: Role, voided: boolean) {
  return {
    availableActions: role === 'ADMIN' && !voided ? ['VOID'] : [],
    createdAt: '2026-09-02T08:00:00.000Z',
    customer: {
      customerId: 'customer-1',
      email: 'khach@example.com',
      name: 'Khách FE09',
      phone: '0900000000',
    },
    daysSnapshot: 90,
    endAt: '2026-12-01T00:00:00.000Z',
    id: WARRANTY_ID,
    inventoryCode: 'RPH-U-FE09',
    isExpired: false,
    isValid: !voided,
    maskedIdentifierSuffix: '0909',
    orderItemId: 'order-item-1',
    orderNumber: 'RPH-FE09-0001',
    policy: { code: 'BH-90', id: POLICY_ID, name: 'Bảo hành 90 ngày' },
    productName: 'iPhone 17 Pro',
    sku: 'IP17P-256-BLU',
    startAt: '2026-09-02T00:00:00.000Z',
    status: voided ? 'VOIDED' : 'ACTIVE',
    termsSnapshot: 'Điều khoản bảo hành FE09.',
    updatedAt: '2026-09-02T10:00:00.000Z',
    variantName: '256 GB · Xanh đậm',
    voidedAt: voided ? '2026-09-02T10:00:00.000Z' : null,
    voidedBy: voided ? { fullName: 'Quản trị FE09', id: 'staff-ADMIN' } : null,
    voidReason: voided ? 'Bảo hành được vô hiệu trong fixture FE09' : null,
    warrantyCode: 'RPH-W-FE09',
  };
}

function policyState(overrides: Partial<PolicyState> = {}): PolicyState {
  return {
    archiveBlockedReason: null,
    archivedAt: null,
    code: 'FE09-CLICK',
    createdAt: '2026-09-02T08:00:00.000Z',
    defaultDays: 180,
    id: POLICY_ID,
    isArchived: false,
    name: 'Chính sách thao tác FE09',
    status: 'INACTIVE',
    terms: 'Điều khoản được tạo hoàn toàn qua giao diện.',
    updatedAt: '2026-09-02T09:00:00.000Z',
    ...overrides,
  };
}

function policyProjection(state: PolicyState) {
  const availableActions = state.isArchived
    ? []
    : state.status === 'ACTIVE'
      ? ['EDIT', 'DEACTIVATE']
      : state.archiveBlockedReason === null
        ? ['EDIT', 'ACTIVATE', 'ARCHIVE']
        : ['EDIT', 'ACTIVATE'];
  return { ...state, availableActions };
}

function policyPage(state: PolicyState | null) {
  const data = state === null ? [] : [policyProjection(state)];
  return {
    data,
    meta: { page: 1, pageSize: 20, totalItems: data.length, totalPages: data.length === 0 ? 0 : 1 },
  };
}

function staff(role: Role) {
  return {
    email: `${role.toLowerCase()}@rephone.local`,
    fullName: role === 'ADMIN' ? 'Quản trị FE09' : 'Nhân viên FE09',
    id: `staff-${role}`,
    phone: '0900000909',
    role,
    status: 'ACTIVE',
  };
}

function recordBody(route: Route): Record<string, unknown> {
  const value = safeBody(route);
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function stringField(body: Record<string, unknown>, key: string, fallback: string): string {
  return typeof body[key] === 'string' ? body[key] : fallback;
}

function numberField(body: Record<string, unknown>, key: string, fallback: number): number {
  return typeof body[key] === 'number' ? body[key] : fallback;
}

function safeBody(route: Route): unknown {
  try {
    const raw = route.request().postData();
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return route.request().postData();
  }
}

function errorBody(code: string) {
  return {
    error: {
      code,
      details: [],
      message: `Lỗi giả lập ${code}`,
      requestId: `fe09-warranty-${code}`,
    },
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

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
