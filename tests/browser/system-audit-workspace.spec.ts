import { fulfillPendingTasks } from './support/pending-tasks';
import { expect, test, type Page, type Route } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';

const AUDIT_A = '0199d020-0000-7000-8000-000000000001';
const AUDIT_B = '0199d020-0000-7000-8000-000000000002';
const AUDIT_C = '0199d020-0000-7000-8000-000000000003';

interface AuditProbe {
  readonly detailReads: string[];
  readonly listQueries: URLSearchParams[];
  failNextDetail(id: string): void;
  holdNextDetail(id: string): ControlledDetailRequest;
  listReads: number;
}

interface ControlledDetailRequest {
  state(): 'waiting' | 'started' | 'completed';
  release(): void;
}

interface DetailRequestGate extends ControlledDetailRequest {
  readonly released: Promise<void>;
  markCompleted(): void;
  markStarted(): void;
}

test(bt('browser:system-admin-health', 'audit-workspace-lifecycle'), async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 900, height: 480 });
  const probe = await auditFixture(page);

  await page.goto('/backoffice/audit-logs');
  await expect(
    page.getByRole('heading', { name: 'Danh sách hoạt động', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#audit-detail-title')).toHaveText('Đã cập nhật cấu hình cửa hàng');
  expect(probe.listReads).toBeGreaterThanOrEqual(1);

  await page.getByLabel('Nhóm hành động').selectOption('employee.*');
  await page.getByLabel('Người thực hiện').selectOption('SYSTEM');
  await page.getByLabel('Thứ tự').selectOption('asc');
  await page.getByText('Bộ lọc chi tiết', { exact: true }).click();
  await page.getByLabel('Loại đối tượng').fill('User');
  await page.getByLabel('Mã yêu cầu').fill('request-b');
  const readsBeforeFilter = probe.listReads;
  await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();

  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === '/backoffice/audit-logs' &&
      url.searchParams.get('action') === 'employee.*' &&
      url.searchParams.get('actorType') === 'SYSTEM' &&
      url.searchParams.get('resourceType') === 'User' &&
      url.searchParams.get('requestId') === 'request-b' &&
      url.searchParams.get('sortOrder') === 'asc'
    );
  });
  await expect(auditRow(page, AUDIT_B)).toBeVisible();
  await expect(auditRow(page, AUDIT_A)).toHaveCount(0);
  await expect(page.locator('#audit-detail-title')).toHaveText('Đã vô hiệu hóa nhân viên');
  expect(probe.listReads).toBeGreaterThan(readsBeforeFilter);
  expect(queryRecord(probe.listQueries[probe.listQueries.length - 1])).toMatchObject({
    action: 'employee.*',
    actorType: 'SYSTEM',
    requestId: 'request-b',
    resourceType: 'User',
    sortOrder: 'asc',
  });

  await page.getByRole('button', { name: 'Xóa lọc', exact: true }).click();
  await expect(auditRow(page, AUDIT_A)).toBeVisible();
  await expect(auditRow(page, AUDIT_C)).toBeVisible();
  await expect(page).toHaveURL('/backoffice/audit-logs');

  await page.goto(`/backoffice/audit-logs/${AUDIT_A}?sortOrder=asc&selected=obsolete`);
  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === '/backoffice/audit-logs' &&
      url.searchParams.get('selected') === AUDIT_A &&
      url.searchParams.getAll('selected').length === 1 &&
      url.searchParams.get('sortOrder') === 'asc'
    );
  });
  await expect(page.locator('#audit-detail-title')).toHaveText('Đã cập nhật cấu hình cửa hàng');

  const listReadsBeforeDetailWork = probe.listReads;
  const listHeading = page.getByRole('heading', { name: 'Danh sách hoạt động', exact: true });
  const rowB = auditRow(page, AUDIT_B);
  const rowA = auditRow(page, AUDIT_A);
  await rowA.scrollIntoViewIfNeeded();
  await expect(rowA).toBeInViewport();
  await expect(rowB).toBeInViewport();
  const scrollBeforeRace = await page.evaluate(() => window.scrollY);
  const pendingDetailB = probe.holdNextDetail(AUDIT_B);
  try {
    await rowB.click({ noWaitAfter: true });
    await expect
      .poll(() => pendingDetailB.state(), {
        message: 'the selected audit detail request should start',
        timeout: 10_000,
      })
      .toBe('started');
    await expect(page.getByLabel('Đang tải chi tiết hoạt động')).toBeVisible();
    await expect(listHeading).toBeVisible();
    await expect(rowA).toBeVisible();
    await rowA.click({ noWaitAfter: true });
    await expect(page.locator('#audit-detail-title')).toHaveText('Đã cập nhật cấu hình cửa hàng');
    await expect(page.locator('#audit-detail-title')).toBeFocused();
  } finally {
    pendingDetailB.release();
  }
  await expect.poll(() => pendingDetailB.state()).toBe('completed');
  await expect(page.locator('#audit-detail-title')).toHaveText('Đã cập nhật cấu hình cửa hàng');
  await expect(page.getByRole('heading', { name: 'Đã vô hiệu hóa nhân viên' })).toHaveCount(0);
  expect(probe.listReads).toBe(listReadsBeforeDetailWork);
  expect(
    Math.abs((await page.evaluate(() => window.scrollY)) - scrollBeforeRace),
  ).toBeLessThanOrEqual(2);

  probe.failNextDetail(AUDIT_C);
  await auditRow(page, AUDIT_C).scrollIntoViewIfNeeded();
  const scrollBeforeRecovery = await page.evaluate(() => window.scrollY);
  await auditRow(page, AUDIT_C).click();
  await expect(page.getByText('Chưa mở được bản ghi', { exact: true })).toBeVisible();
  await expect(listHeading).toBeVisible();
  expect(
    Math.abs((await page.evaluate(() => window.scrollY)) - scrollBeforeRecovery),
  ).toBeLessThanOrEqual(2);
  const retry = page.getByRole('button', { name: 'Thử lại', exact: true });
  await retry.scrollIntoViewIfNeeded();
  const scrollBeforeRetry = await page.evaluate(() => window.scrollY);
  await retry.click();
  await expect(page.locator('#audit-detail-title')).toHaveText('Đã tạm khóa khách hàng');
  await expect(page.locator('#audit-detail-title')).toBeFocused();
  await expect(page.getByText('[REDACTED]', { exact: true })).toBeVisible();
  await expect(page.getByText('Thành công', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('list-secret-sentinel');
  await expect(page.locator('body')).not.toContainText('list-token-sentinel');
  expect(probe.listReads).toBe(listReadsBeforeDetailWork);
  expect(
    Math.abs((await page.evaluate(() => window.scrollY)) - scrollBeforeRetry),
  ).toBeLessThanOrEqual(2);
});

function auditRow(page: Page, id: string) {
  return page.locator(`main a[href*="selected=${id}"]`);
}

async function auditFixture(page: Page): Promise<AuditProbe> {
  const listItems = [
    auditItem(AUDIT_A, {
      action: 'settings.updated',
      createdAt: '2026-09-02T08:00:00.000Z',
      requestId: 'request-a',
      resourceId: 'store-settings',
      resourceType: 'StoreSettings',
    }),
    auditItem(AUDIT_B, {
      action: 'employee.disabled',
      actor: null,
      actorType: 'SYSTEM',
      createdAt: '2026-09-02T07:00:00.000Z',
      requestId: 'request-b',
      resourceId: 'employee-b',
    }),
    auditItem(AUDIT_C, {
      action: 'customer.suspended',
      changes: { secret: 'list-secret-sentinel' },
      createdAt: '2026-09-02T06:00:00.000Z',
      metadata: { token: 'list-token-sentinel' },
      requestId: 'request-c',
      resourceId: 'customer-c',
    }),
  ];
  const detailById = new Map<string, Record<string, unknown>>([
    [
      AUDIT_A,
      auditDetail(listItems[0] as Record<string, unknown>, {
        changes: { after: { storeName: 'rePhone mới' }, before: { storeName: 'rePhone' } },
        metadata: { fields: ['storeName'] },
      }),
    ],
    [
      AUDIT_B,
      auditDetail(listItems[1] as Record<string, unknown>, {
        changes: { after: { status: 'DISABLED' }, before: { status: 'ACTIVE' } },
        metadata: { result: 'success' },
      }),
    ],
    [
      AUDIT_C,
      auditDetail(listItems[2] as Record<string, unknown>, {
        changes: {
          after: { status: 'SUSPENDED' },
          before: { status: 'ACTIVE' },
          reason: '[REDACTED]',
        },
        metadata: { result: 'success' },
      }),
    ],
  ]);
  const detailGates = new Map<string, DetailRequestGate[]>();
  const detailFailures = new Map<string, number>();
  const probe: AuditProbe = {
    detailReads: [],
    listQueries: [],
    listReads: 0,
    failNextDetail(id) {
      detailFailures.set(id, (detailFailures.get(id) ?? 0) + 1);
    },
    holdNextDetail(id) {
      const gate = createDetailRequestGate();
      detailGates.set(id, [...(detailGates.get(id) ?? []), gate]);
      return gate;
    },
  };

  await page.route('**/api/v1/auth/refresh', (route) =>
    json(route, { data: { accessToken: 'fe09-audit-admin', user: admin() } }),
  );
  await page.route('**/api/v1/backoffice/**', async (route) => {
    if (await fulfillPendingTasks(route)) return;
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === 'OPTIONS') return preflight(route);

    if (path === '/api/v1/backoffice/audit-logs' && request.method() === 'GET') {
      probe.listReads += 1;
      probe.listQueries.push(new URLSearchParams(url.search));
      return json(route, paged(filterAuditItems(listItems, url.searchParams)));
    }
    if (path.startsWith('/api/v1/backoffice/audit-logs/') && request.method() === 'GET') {
      const id = decodeURIComponent(path.slice('/api/v1/backoffice/audit-logs/'.length));
      probe.detailReads.push(id);
      const gates = detailGates.get(id) ?? [];
      const gate = gates.shift();
      detailGates.set(id, gates);
      if (gate === undefined) {
        await delay(15);
      } else {
        gate.markStarted();
        await gate.released;
      }
      try {
        const failures = detailFailures.get(id) ?? 0;
        if (failures > 0) {
          detailFailures.set(id, failures - 1);
          await json(route, errorEnvelope('SERVICE_UNAVAILABLE'), 503);
          return;
        }
        const detail = detailById.get(id);
        if (detail === undefined) {
          await json(route, errorEnvelope('RESOURCE_NOT_FOUND'), 404);
          return;
        }
        await json(route, { data: detail });
      } finally {
        gate?.markCompleted();
      }
      return;
    }
    return json(route, errorEnvelope('RESOURCE_NOT_FOUND'), 404);
  });
  return probe;
}

function filterAuditItems(
  items: Record<string, unknown>[],
  query: URLSearchParams,
): Record<string, unknown>[] {
  let filtered = [...items];
  const action = query.get('action');
  const actorType = query.get('actorType');
  const resourceType = query.get('resourceType');
  const requestId = query.get('requestId');
  if (action !== null) {
    const prefix = action.endsWith('*') ? action.slice(0, -1) : action;
    filtered = filtered.filter((item) => String(item['action']).startsWith(prefix));
  }
  if (actorType !== null) {
    filtered = filtered.filter((item) => item['actorType'] === actorType);
  }
  if (resourceType !== null) {
    filtered = filtered.filter((item) => item['resourceType'] === resourceType);
  }
  if (requestId !== null) {
    filtered = filtered.filter((item) => item['requestId'] === requestId);
  }
  if (query.get('sortOrder') === 'asc') filtered.reverse();
  return filtered;
}

function auditItem(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: 'customer.updated',
    actor: {
      employeeCode: 'ADM-09',
      fullName: 'Quản trị FE09',
      id: 'staff-admin',
      role: 'ADMIN',
    },
    actorType: 'USER',
    changes: null,
    createdAt: '2026-09-02T05:00:00.000Z',
    id,
    metadata: null,
    requestId: `request-${id}`,
    resourceId: 'resource-fe09',
    resourceType: 'User',
    ...overrides,
  };
}

function auditDetail(
  item: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...item,
    ipAddress: '203.0.113.9',
    userAgent: 'Trình duyệt kiểm thử FE09',
    ...overrides,
  };
}

function admin() {
  return {
    email: 'admin@rephone.local',
    fullName: 'Quản trị FE09',
    id: 'staff-admin',
    phone: '0900000707',
    role: 'ADMIN',
    status: 'ACTIVE',
  };
}

function paged(data: Record<string, unknown>[]) {
  return {
    data,
    meta: {
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: data.length,
        totalPages: data.length === 0 ? 0 : 1,
      },
    },
  };
}

function queryRecord(query: URLSearchParams | undefined): Record<string, string> {
  return query === undefined ? {} : Object.fromEntries(query.entries());
}

function errorEnvelope(code: string) {
  return {
    error: {
      code,
      details: [],
      message: `Lỗi giả lập ${code}`,
      requestId: `fe09-${code}`,
    },
  };
}

async function json(route: Route, body: unknown, status = 200) {
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

async function preflight(route: Route) {
  await route.fulfill({
    headers: {
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-origin': 'http://localhost:3001',
    },
    status: 204,
  });
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createDetailRequestGate(): DetailRequestGate {
  let state: ReturnType<ControlledDetailRequest['state']> = 'waiting';
  let release = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    markCompleted() {
      state = 'completed';
    },
    markStarted() {
      state = 'started';
    },
    release,
    released,
    state: () => state,
  };
}
