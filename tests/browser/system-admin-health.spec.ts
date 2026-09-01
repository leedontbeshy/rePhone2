import { expect, test, type Page, type Response } from '@playwright/test';
import { browserTestTitle } from '../../apps/web/lib/frontend-browser-coverage';

const ADMIN = {
  email: 'admin@rephone.local',
  password: 'AdminDemo123',
};

const HEALTH_STATES = new Set(['healthy', 'degraded', 'unavailable']);
const DEPENDENCY_STATES = new Set(['healthy', 'degraded', 'unavailable', 'not_configured']);

test(
  browserTestTitle('browser:system-admin-health', 'live-admin-route-matrix'),
  async ({ page }) => {
    const failedBackofficeResponses = collectFailedBackofficeResponses(page);

    const overview = await loginAsAdmin(page);
    expectRecordWith(overview.data, 'metrics', 'operations overview');
    await expectProtectedWorkspace(page, 'Tổng quan vận hành');
    await expectNoHorizontalOverflow(page);

    const employees = await visitLiveProjection(
      page,
      '/backoffice/employees',
      '/api/v1/backoffice/employees',
      'Quản lý nhân viên',
    );
    expectNonEmptyList(employees.data, 'employees');
    await expect(page.getByText('Nhân viên Demo', { exact: true }).first()).toBeVisible();

    const customers = await visitLiveProjection(
      page,
      '/backoffice/customers',
      '/api/v1/backoffice/customers',
      'Quản lý khách hàng',
    );
    expectNonEmptyList(customers.data, 'customers');
    await expect(page.getByText('Khách hàng Demo', { exact: true }).first()).toBeVisible();

    const settings = await visitLiveProjection(
      page,
      '/backoffice/settings',
      '/api/v1/backoffice/settings',
      'Cấu hình cửa hàng',
    );
    expectRecordWith(settings.data, 'version', 'store settings');

    // A reversible settings update guarantees that the audit detail route can be
    // exercised even when this spec runs by itself against a freshly seeded DB.
    const storeNameInput = page.getByLabel(/^Tên cửa hàng/);
    const originalStoreName = await storeNameInput.inputValue();
    const temporaryStoreName = `${originalStoreName} · kiểm thử FE-09`;
    await saveStoreName(page, temporaryStoreName);
    await saveStoreName(page, originalStoreName);

    const auditList = await visitLiveProjection(
      page,
      '/backoffice/audit-logs',
      '/api/v1/backoffice/audit-logs',
      'Nhật ký hoạt động',
    );
    expectNonEmptyList(auditList.data, 'audit logs');

    const auditHref = await page
      .locator('main a[href*="/backoffice/audit-logs?"][href*="selected="]')
      .first()
      .getAttribute('href');
    expect(auditHref).not.toBeNull();
    const auditId = new URL(auditHref ?? '', 'http://localhost').searchParams.get('selected');
    expect(auditId).not.toBeNull();
    if (auditId === null) throw new Error('Expected a selected audit id from the live list');

    const auditDetail = await visitLiveProjection(
      page,
      `/backoffice/audit-logs/${encodeURIComponent(auditId)}`,
      `/api/v1/backoffice/audit-logs/${auditId}`,
      'Nhật ký hoạt động',
    );
    expectRecordWith(auditDetail.data, 'action', 'audit detail');
    expect(recordValue(auditDetail.data, 'id')).toBe(auditId);
    await expect(page).toHaveURL((url) => {
      return (
        url.pathname === '/backoffice/audit-logs' && url.searchParams.get('selected') === auditId
      );
    });
    await expect(
      page.getByRole('heading', { name: 'Truy vết yêu cầu', exact: true }),
    ).toBeVisible();

    const health = await visitLiveProjection(
      page,
      '/backoffice/system/health',
      '/api/v1/backoffice/system/health',
      'Trạng thái hệ thống',
    );
    expect(health.response.headers()['cache-control']).toContain('no-store');
    expectLiveHealthSnapshot(health.data);
    await expect(
      page.getByRole('heading', { name: 'Thông tin lần kiểm tra', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Cơ sở dữ liệu', { exact: true })).toBeVisible();
    await expect(page.getByText('Kho tệp', { exact: true })).toBeVisible();
    await expect(page.getByText('Gửi email', { exact: true })).toBeVisible();

    expect(failedBackofficeResponses).toEqual([]);
  },
);

async function loginAsAdmin(page: Page): Promise<{ data: unknown; response: Response }> {
  await page.goto('/login?returnTo=%2Fbackoffice');
  await page.getByLabel(/^Email/).fill(ADMIN.email);
  await page.getByLabel(/^Mật khẩu/).fill(ADMIN.password);
  const responsePromise = waitForLiveResponse(page, 'GET', '/api/v1/backoffice/overview');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  const response = await responsePromise;
  const data = await dataFromLiveResponse(response, '/api/v1/backoffice/overview');
  await page.waitForURL('/backoffice');
  await expect(page.getByText('Quản trị viên Demo', { exact: true })).toBeVisible();
  return { data, response };
}

async function visitLiveProjection(
  page: Page,
  route: string,
  apiPath: string,
  heading: string,
): Promise<{ data: unknown; response: Response }> {
  const responsePromise = waitForLiveResponse(page, 'GET', apiPath);

  await page.goto(route);
  const response = await responsePromise;
  const data = await dataFromLiveResponse(response, apiPath);

  await expectProtectedWorkspace(page, heading);
  await expectNoHorizontalOverflow(page);
  return { data, response };
}

function waitForLiveResponse(page: Page, method: 'GET' | 'PATCH', apiPath: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === method && url.pathname === apiPath;
  });
}

async function dataFromLiveResponse(response: Response, apiPath: string): Promise<unknown> {
  expect(response.status(), `${apiPath} should return a successful live projection`).toBe(200);
  expect(response.fromServiceWorker(), `${apiPath} must not come from a service worker`).toBe(
    false,
  );

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !('data' in payload)) {
    throw new Error(`${apiPath} did not return the expected data envelope`);
  }
  return payload['data'];
}

async function saveStoreName(page: Page, value: string): Promise<void> {
  const input = page.getByLabel(/^Tên cửa hàng/);
  await input.fill(value);

  const saveButton = page.getByRole('button', { name: 'Lưu thay đổi', exact: true });
  await expect(saveButton).toBeEnabled();
  const responsePromise = waitForLiveResponse(page, 'PATCH', '/api/v1/backoffice/settings');
  await saveButton.click();

  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await expect(page.getByText('Đã lưu cấu hình cửa hàng.', { exact: true })).toBeVisible();
  await expect(input).toHaveValue(value);
}

async function expectProtectedWorkspace(page: Page, heading: string): Promise<void> {
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.locator('[data-shell="backoffice"]')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Không có quyền truy cập' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Không thể mở khu vực này' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Đăng nhập để quản trị hệ thống' })).toHaveCount(
    0,
  );
}

function expectNonEmptyList(value: unknown, label: string): void {
  if (!Array.isArray(value)) throw new Error(`Expected ${label} to be an array`);
  expect(value.length, `Expected live ${label} data`).toBeGreaterThan(0);
}

function expectRecordWith(value: unknown, key: string, label: string): void {
  if (!isRecord(value) || !(key in value)) {
    throw new Error(`Expected ${label} to contain ${key}`);
  }
}

function expectLiveHealthSnapshot(value: unknown): void {
  if (!isRecord(value)) throw new Error('Expected a live health snapshot object');
  expect(HEALTH_STATES.has(String(value['state']))).toBe(true);
  expect(Number.isNaN(Date.parse(String(value['checkedAt'])))).toBe(false);
  expect(value['durationMs']).toEqual(expect.any(Number));

  for (const dependency of ['api', 'database', 'storage', 'mail']) {
    const projection = value[dependency];
    if (!isRecord(projection)) throw new Error(`Expected the ${dependency} health projection`);
    expect(DEPENDENCY_STATES.has(String(projection['state']))).toBe(true);
    expect(projection['latencyMs']).toEqual(expect.any(Number));
  }

  const api = value['api'];
  const database = value['database'];
  if (!isRecord(api) || !isRecord(database)) {
    throw new Error('Expected API and database health details');
  }
  expect(api['version']).toEqual(expect.any(String));
  expect(api['uptimeSeconds']).toEqual(expect.any(Number));
  expect(database['appliedMigrationCount']).toEqual(expect.any(Number));
  expect(database['incompleteMigrationCount']).toEqual(expect.any(Number));
}

function recordValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectFailedBackofficeResponses(page: Page): string[] {
  const failures: string[] = [];
  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.startsWith('/api/v1/backoffice/') && response.status() >= 400) {
      failures.push(`${response.request().method()} ${pathname}: ${String(response.status())}`);
    }
  });
  return failures;
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}
