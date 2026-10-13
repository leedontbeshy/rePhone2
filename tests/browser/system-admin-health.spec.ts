import { expect, test, type Page, type Response } from '@playwright/test';
import { browserTestTitle } from '../../apps/web/lib/frontend-browser-coverage';

const ADMIN = {
  email: 'admin@rephone.local',
  password: 'AdminDemo123',
};

const HEALTH_STATES = new Set(['healthy', 'degraded', 'unavailable']);
const DEPENDENCY_STATES = new Set(['healthy', 'degraded', 'unavailable', 'not_configured']);

type HealthState = 'healthy' | 'degraded' | 'unavailable';
type DependencyState = HealthState | 'not_configured';

interface LiveHealthSnapshot {
  readonly api: LiveHealthProbe;
  readonly checkedAt: string;
  readonly database: LiveHealthProbe;
  readonly durationMs: number;
  readonly mail: LiveHealthProbe;
  readonly state: HealthState;
  readonly storage: LiveHealthProbe;
}

interface LiveHealthProbe {
  readonly state: DependencyState;
}

const HEALTH_SUMMARY_LABELS: Readonly<Record<HealthState, string>> = {
  degraded: 'Hệ thống đang hoạt động hạn chế',
  healthy: 'Hệ thống đang hoạt động ổn định',
  unavailable: 'Hệ thống đang gián đoạn',
};

const HEALTH_PROBE_LABELS: Readonly<Record<DependencyState, string>> = {
  degraded: 'Cần chú ý',
  healthy: 'Ổn định',
  not_configured: 'Chưa cấu hình',
  unavailable: 'Gián đoạn',
};

test(
  browserTestTitle('browser:system-admin-health', 'live-admin-route-matrix'),
  async ({ page }) => {
    const failedBackofficeResponses = collectFailedBackofficeResponses(page);
    const backofficeMutations = collectBackofficeMutationRequests(page);

    const overview = await loginAsAdmin(page);
    expectRecordWith(overview.data, 'sales', 'financial report');
    await expectProtectedWorkspace(page, 'Báo cáo tài chính');
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

    const auditList = await visitLiveProjection(
      page,
      '/backoffice/audit-logs',
      '/api/v1/backoffice/audit-logs',
      'Nhật ký hoạt động',
    );
    expectList(auditList.data, 'audit logs');

    const health = await visitLiveProjection(
      page,
      '/backoffice/system/health',
      '/api/v1/backoffice/system/health',
      'Trạng thái hệ thống',
    );
    expect(health.response.headers()['cache-control']).toContain('no-store');
    expectLiveHealthSnapshot(health.data);
    await expectLiveHealthPresentation(page, health.data);
    await expect(
      page.getByRole('heading', { name: 'Thông tin lần kiểm tra', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Cơ sở dữ liệu', { exact: true })).toBeVisible();
    await expect(page.getByText('Kho tệp', { exact: true })).toBeVisible();
    await expect(page.getByText('Gửi email', { exact: true })).toBeVisible();

    expect(failedBackofficeResponses).toEqual([]);
    expect(backofficeMutations).toEqual([]);
  },
);

async function loginAsAdmin(page: Page): Promise<{ data: unknown; response: Response }> {
  await page.goto('/login?returnTo=%2Fbackoffice');
  await page.getByLabel(/^Email/).fill(ADMIN.email);
  await page.getByLabel(/^Mật khẩu/).fill(ADMIN.password);
  const responsePromise = waitForLiveResponse(page, '/api/v1/backoffice/overview/financial');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  const response = await responsePromise;
  const data = await dataFromLiveResponse(response, '/api/v1/backoffice/overview/financial');
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
  const responsePromise = waitForLiveResponse(page, apiPath);

  await page.goto(route);
  const response = await responsePromise;
  const data = await dataFromLiveResponse(response, apiPath);

  await expectProtectedWorkspace(page, heading);
  await expectNoHorizontalOverflow(page);
  return { data, response };
}

function waitForLiveResponse(page: Page, apiPath: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'GET' && url.pathname === apiPath;
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
  expectList(value, label);
  expect(value.length, `Expected live ${label} data`).toBeGreaterThan(0);
}

function expectList(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`Expected ${label} to be an array`);
}

function expectRecordWith(value: unknown, key: string, label: string): void {
  if (!isRecord(value) || !(key in value)) {
    throw new Error(`Expected ${label} to contain ${key}`);
  }
}

function expectLiveHealthSnapshot(value: unknown): asserts value is LiveHealthSnapshot {
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

async function expectLiveHealthPresentation(
  page: Page,
  snapshot: LiveHealthSnapshot,
): Promise<void> {
  const panel = page.locator('section[aria-labelledby="system-health-summary-title"]');
  await expect(
    panel.getByRole('heading', { name: HEALTH_SUMMARY_LABELS[snapshot.state], exact: true }),
  ).toBeVisible();

  for (const dependency of [
    { key: 'api', label: 'API' },
    { key: 'database', label: 'Cơ sở dữ liệu' },
    { key: 'storage', label: 'Kho tệp' },
    { key: 'mail', label: 'Gửi email' },
  ] as const) {
    const row = panel.getByText(dependency.label, { exact: true }).locator('..');
    await expect(
      row.getByText(HEALTH_PROBE_LABELS[snapshot[dependency.key].state], { exact: true }),
    ).toBeVisible();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectBackofficeMutationRequests(page: Page): string[] {
  const mutations: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    if (
      pathname.startsWith('/api/v1/backoffice/') &&
      method !== 'GET' &&
      method !== 'HEAD' &&
      method !== 'OPTIONS'
    ) {
      mutations.push(`${method} ${pathname}`);
    }
  });
  return mutations;
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
