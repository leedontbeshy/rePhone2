import { expect, test, type Page, type Route } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';

type Role = 'ADMIN' | 'EMPLOYEE';

interface FixtureResponse<T> {
  readonly body?: T;
  readonly delayMs?: number;
  readonly status?: number;
}

interface SystemProbe {
  healthReads: number;
  holdNextHealthFailure(): ControlledRequest;
  holdNextOverview(): ControlledRequest;
  overviewReads: number;
}

interface ControlledRequest {
  state(): 'waiting' | 'started' | 'completed';
  release(): void;
}

interface RequestGate extends ControlledRequest {
  readonly released: Promise<void>;
  markCompleted(): void;
  markStarted(): void;
}

test(bt('browser:system-admin-health', 'health-dependency-state-matrix'), async ({ context }) => {
  test.slow();
  const cases = [
    {
      dependency: 'API',
      dependencyState: 'Ổn định',
      snapshot: healthSnapshot(),
      summary: 'Hệ thống đang hoạt động ổn định',
    },
    {
      dependency: 'Cơ sở dữ liệu',
      dependencyState: 'Cần chú ý',
      snapshot: healthSnapshot({
        state: 'degraded',
        database: databaseProbe('degraded', 'incomplete_migration'),
      }),
      summary: 'Hệ thống đang hoạt động hạn chế',
    },
    {
      dependency: 'Kho tệp',
      dependencyState: 'Gián đoạn',
      snapshot: healthSnapshot({
        state: 'degraded',
        storage: dependencyProbe('unavailable', 'timeout', 850),
      }),
      summary: 'Hệ thống đang hoạt động hạn chế',
    },
    {
      dependency: 'Gửi email',
      dependencyState: 'Chưa cấu hình',
      snapshot: healthSnapshot({
        state: 'degraded',
        mail: dependencyProbe('not_configured', 'not_configured', 0),
      }),
      summary: 'Hệ thống đang hoạt động hạn chế',
    },
    {
      dependency: 'Cơ sở dữ liệu',
      dependencyState: 'Gián đoạn',
      snapshot: healthSnapshot({
        state: 'unavailable',
        database: databaseProbe('unavailable', 'timeout'),
      }),
      summary: 'Hệ thống đang gián đoạn',
    },
  ] as const;

  for (const scenario of cases) {
    const page = await context.newPage();
    const probe = await installSystemFixture(page, 'ADMIN', {
      health: [{ body: scenario.snapshot }],
    });

    await page.goto('/backoffice/system/health');
    await expect(page.getByRole('heading', { name: scenario.summary, exact: true })).toBeVisible();
    await expect(dependencyRow(page, scenario.dependency)).toContainText(scenario.dependencyState);
    if (scenario.snapshot.state !== 'healthy') {
      await expect(
        page.getByRole('heading', { name: 'Hệ thống đang hoạt động ổn định', exact: true }),
      ).toHaveCount(0);
    }
    expect(probe.healthReads).toBeGreaterThanOrEqual(1);
    await page.close();
  }
});

test(bt('browser:system-admin-health', 'health-stale-refresh'), async ({ page }) => {
  const staleSnapshot = healthSnapshot({
    state: 'degraded',
    storage: dependencyProbe('degraded', 'timeout', 420),
  });
  const probe = await installSystemFixture(page, 'ADMIN', {
    health: [{ body: staleSnapshot }],
  });

  await page.goto('/backoffice/system/health');
  const panel = page.locator('section[aria-labelledby="system-health-summary-title"]');
  await expect(
    page.getByRole('heading', { name: 'Hệ thống đang hoạt động hạn chế', exact: true }),
  ).toBeVisible();

  const routeBeforeRefresh = page.url();
  const pendingRefresh = probe.holdNextHealthFailure();
  try {
    const refreshRequest = page.waitForRequest((request) => {
      return (
        request.method() === 'GET' &&
        new URL(request.url()).pathname === '/api/v1/backoffice/system/health'
      );
    });
    await page.getByRole('button', { name: 'Kiểm tra lại', exact: true }).click();
    await refreshRequest;
    await expect.poll(() => pendingRefresh.state()).toBe('started');
    await expect(panel).toHaveAttribute('aria-busy', 'true');
    await expect(panel).toContainText('Đang cập nhật');
    await expect(panel).toContainText('Kho tệp');
    await expect(page.getByLabel('Đang kiểm tra trạng thái hệ thống')).toHaveCount(0);
  } finally {
    pendingRefresh.release();
  }
  await expect.poll(() => pendingRefresh.state()).toBe('completed');

  await expect(page.getByText('Chưa thể hoàn tất kiểm tra', { exact: true })).toBeVisible();
  await expect(panel).not.toHaveAttribute('aria-busy', 'true');
  await expect(
    page.getByRole('heading', { name: 'Hệ thống đang hoạt động hạn chế', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Chưa có kết quả kiểm tra', { exact: true })).toHaveCount(0);
  expect(page.url()).toBe(routeBeforeRefresh);
  expect(probe.healthReads).toBeGreaterThanOrEqual(2);
});

test(
  bt('browser:system-admin-health', 'overview-refresh-role-boundary'),
  async ({ context, page }) => {
    const initial = overviewSnapshot(12, '2026-09-02T02:00:00.000Z');
    const refreshed = overviewSnapshot(14, '2026-09-02T02:05:00.000Z');
    const adminProbe = await installSystemFixture(page, 'ADMIN', {
      overview: [{ body: initial }, { body: refreshed }, { status: 503 }],
    });

    await page.goto('/backoffice');
    await expect(
      page.getByRole('heading', { name: 'Tổng quan vận hành', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Đơn đang xử lý: 12. Mở danh sách')).toBeVisible();
    await expect(page.getByText('Thanh toán chờ duyệt quá lâu', { exact: true })).toBeVisible();
    await expect(page.getByText('5 việc', { exact: true })).toBeVisible();
    await expect(page.getByText('RPH-20260902-0001', { exact: true })).toBeVisible();
    await expectAdminQuickLinks(page, true);

    const routeBeforeRefresh = page.url();
    const pendingRefresh = adminProbe.holdNextOverview();
    try {
      const refreshRequest = page.waitForRequest((request) => {
        return (
          request.method() === 'GET' &&
          new URL(request.url()).pathname === '/api/v1/backoffice/overview'
        );
      });
      await page.getByRole('button', { name: 'Cập nhật', exact: true }).click();
      await refreshRequest;
      await expect.poll(() => pendingRefresh.state()).toBe('started');
      const dashboard = page
        .locator('[aria-busy="true"]')
        .filter({ hasText: 'Tình hình vận hành' });
      await expect(dashboard).toContainText('thông tin hiện tại vẫn có thể sử dụng');
      await expect(page.getByLabel('Đơn đang xử lý: 12. Mở danh sách')).toBeVisible();
    } finally {
      pendingRefresh.release();
    }
    await expect.poll(() => pendingRefresh.state()).toBe('completed');
    await expect(page.getByLabel('Đơn đang xử lý: 14. Mở danh sách')).toBeVisible();
    expect(page.url()).toBe(routeBeforeRefresh);

    const pendingFailure = adminProbe.holdNextOverview();
    try {
      const failureRequest = page.waitForRequest((request) => {
        return (
          request.method() === 'GET' &&
          new URL(request.url()).pathname === '/api/v1/backoffice/overview'
        );
      });
      await page.getByRole('button', { name: 'Cập nhật', exact: true }).click();
      await failureRequest;
      await expect.poll(() => pendingFailure.state()).toBe('started');
      await expect(page.getByLabel('Đơn đang xử lý: 14. Mở danh sách')).toBeVisible();
    } finally {
      pendingFailure.release();
    }
    await expect.poll(() => pendingFailure.state()).toBe('completed');
    await expect(page.getByLabel('Đơn đang xử lý: 14. Mở danh sách')).toBeVisible();
    await expect(
      page.getByText('Dữ liệu có thể chưa phải mới nhất', { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Đang tải tổng quan vận hành')).toHaveCount(0);
    await expect(page.getByText('RPH-20260902-0001', { exact: true })).toBeVisible();
    expect(page.url()).toBe(routeBeforeRefresh);
    expect(adminProbe.overviewReads).toBe(3);

    const employeePage = await context.newPage();
    const employeeProbe = await installSystemFixture(employeePage, 'EMPLOYEE', {
      overview: [{ body: initial }],
    });
    await employeePage.goto('/backoffice');
    await expect(
      employeePage.getByRole('heading', { name: 'Tổng quan vận hành', exact: true }),
    ).toBeVisible();
    const employeeQuickLinks = employeePage.getByRole('navigation', {
      name: 'Lối tắt công việc',
    });
    await expect(employeeQuickLinks.getByRole('link', { name: /Xử lý đơn hàng/ })).toBeVisible();
    await expect(employeeQuickLinks.getByRole('link', { name: /Duyệt thanh toán/ })).toBeVisible();
    await expectAdminQuickLinks(employeePage, false);
    expect(employeeProbe.overviewReads).toBe(1);
    await employeePage.close();
  },
);

function dependencyRow(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator('..');
}

async function expectAdminQuickLinks(page: Page, visible: boolean): Promise<void> {
  const quickLinks = page.getByRole('navigation', { name: 'Lối tắt công việc' });
  for (const name of [
    'Mã ưu đãi',
    'Cấu hình cửa hàng',
    'Nhật ký hoạt động',
    'Trạng thái hệ thống',
  ]) {
    const link = quickLinks.getByRole('link', { name: new RegExp(name) });
    if (visible) await expect(link).toBeVisible();
    else await expect(link).toHaveCount(0);
  }
}

async function installSystemFixture(
  page: Page,
  role: Role,
  responses: Readonly<{
    health?: readonly FixtureResponse<ReturnType<typeof healthSnapshot>>[];
    overview?: readonly FixtureResponse<ReturnType<typeof overviewSnapshot>>[];
  }>,
): Promise<SystemProbe> {
  let nextHealthFailure: RequestGate | undefined;
  let nextOverview: RequestGate | undefined;
  const probe: SystemProbe = {
    healthReads: 0,
    holdNextHealthFailure() {
      const gate = createRequestGate();
      nextHealthFailure = gate;
      return gate;
    },
    holdNextOverview() {
      const gate = createRequestGate();
      nextOverview = gate;
      return gate;
    },
    overviewReads: 0,
  };
  await page.route('**/api/v1/auth/refresh', (route) =>
    json(route, { data: { accessToken: `fe09-${role}`, user: staff(role) } }),
  );
  await page.route('**/api/v1/backoffice/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') return preflight(route);

    if (request.method() === 'GET' && path === '/api/v1/backoffice/system/health') {
      const response = responseAt(responses.health, probe.healthReads);
      probe.healthReads += 1;
      const failureGate = nextHealthFailure;
      nextHealthFailure = undefined;
      if (failureGate !== undefined) {
        failureGate.markStarted();
        await failureGate.released;
        try {
          await json(route, errorEnvelope('SERVICE_UNAVAILABLE'), 503);
        } finally {
          failureGate.markCompleted();
        }
        return;
      }
      return respond(route, response);
    }
    if (request.method() === 'GET' && path === '/api/v1/backoffice/overview') {
      const response = responseAt(responses.overview, probe.overviewReads);
      probe.overviewReads += 1;
      const overviewGate = nextOverview;
      nextOverview = undefined;
      if (overviewGate === undefined) return respond(route, response);
      overviewGate.markStarted();
      await overviewGate.released;
      try {
        await respond(route, response);
      } finally {
        overviewGate.markCompleted();
      }
      return;
    }
    return json(route, errorEnvelope('RESOURCE_NOT_FOUND'), 404);
  });
  return probe;
}

function responseAt<T>(
  responses: readonly FixtureResponse<T>[] | undefined,
  index: number,
): FixtureResponse<T> {
  if (responses === undefined || responses.length === 0) return { status: 404 };
  return responses[Math.min(index, responses.length - 1)] ?? { status: 404 };
}

async function respond<T>(route: Route, response: FixtureResponse<T>): Promise<void> {
  if (response.delayMs !== undefined) await delay(response.delayMs);
  const status = response.status ?? 200;
  if (status >= 400) return json(route, errorEnvelope('SERVICE_UNAVAILABLE'), status);
  return json(route, { data: response.body });
}

function healthSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    api: {
      latencyMs: 4,
      reason: 'ok',
      state: 'healthy',
      uptimeSeconds: 7_200,
      version: 'fe09-fixture',
    },
    checkedAt: '2026-09-02T02:00:00.000Z',
    database: databaseProbe('healthy', 'ok'),
    durationMs: 28,
    mail: dependencyProbe('healthy', 'ok', 11),
    state: 'healthy',
    storage: dependencyProbe('healthy', 'ok', 18),
    ...overrides,
  };
}

function databaseProbe(state: string, reason: string) {
  return {
    appliedMigrationCount: 18,
    incompleteMigrationCount: state === 'degraded' ? 1 : 0,
    latencyMs: state === 'unavailable' ? 900 : 12,
    reason,
    state,
  };
}

function dependencyProbe(state: string, reason: string, latencyMs: number) {
  return { latencyMs, reason, state };
}

function overviewSnapshot(activeOrders: number, generatedAt: string) {
  return {
    generatedAt,
    metrics: {
      activeOrders,
      lowStockLevels: 2,
      openAfterSales: 4,
      paymentsUnderReview: 3,
    },
    priorities: [
      {
        count: 3,
        href: '/backoffice/payments',
        key: 'PAYMENT_REVIEW_OVERDUE',
        oldestAt: '2026-09-01T02:00:00.000Z',
      },
      {
        count: 2,
        href: '/backoffice/refunds',
        key: 'REFUND_REQUESTED',
        oldestAt: '2026-09-01T03:00:00.000Z',
      },
    ],
    recentOrders: [
      {
        customerName: 'Khách hàng Tổng quan',
        fulfillmentStatus: 'IN_TRANSIT',
        grandTotal: '24500000',
        id: '0199d010-0000-7000-8000-000000000021',
        orderNumber: 'RPH-20260902-0001',
        paymentStatus: 'PARTIALLY_PAID',
        placedAt: '2026-09-02T01:30:00.000Z',
        status: 'PROCESSING',
      },
    ],
  };
}

function staff(role: Role) {
  return {
    email: `${role.toLowerCase()}@rephone.local`,
    fullName: role === 'ADMIN' ? 'Quản trị FE09' : 'Nhân viên FE09',
    id: `staff-${role}`,
    phone: '0900000707',
    role,
    status: 'ACTIVE',
  };
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
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-origin': 'http://localhost:3001',
    },
    status: 204,
  });
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createRequestGate(): RequestGate {
  let state: ReturnType<ControlledRequest['state']> = 'waiting';
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
