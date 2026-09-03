import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test,
  type ConsoleMessage,
  type Page,
  type Route,
  type TestInfo,
} from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';

const PROTECTED_OVERVIEW_HEADING = 'Tổng quan vận hành';

test.describe('Backoffice access boundary', () => {
  test(bt('browser:backoffice-access', 'anonymous-fail-closed'), async ({ page }, testInfo) => {
    const refresh = deferred<undefined>();
    const refreshStarted = deferred<undefined>();
    const protectedRequests = collectProtectedRequests(page);
    const runtimeErrors = collectRuntimeErrors(page);

    await page.route('**/api/v1/auth/refresh', async (route) => {
      if (route.request().method() === 'OPTIONS') return fulfillPreflight(route);
      refreshStarted.resolve(undefined);
      await refresh.promise;
      await fulfillJson(
        route,
        { error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } },
        401,
      );
    });

    const navigationResponse = await page.goto('/backoffice', { waitUntil: 'domcontentloaded' });
    const initialPayload = (await navigationResponse?.text()) ?? '';
    await refreshStarted.promise;

    expect(initialPayload).not.toContain(PROTECTED_OVERVIEW_HEADING);
    expect(initialPayload).not.toContain('Dữ liệu tổng quan vận hành');
    await expect(page.getByRole('status', { name: 'Đang kiểm tra quyền truy cập' })).toBeVisible();
    await expect(page.getByRole('heading', { name: PROTECTED_OVERVIEW_HEADING })).toHaveCount(0);
    await expect(page.locator('[data-shell="backoffice"]')).toHaveCount(0);
    expect(protectedRequests).toEqual([]);
    await capture(page, testInfo, 'anonymous-session-pending.png');

    refresh.resolve(undefined);
    const deniedHeading = page.getByRole('heading', { name: 'Không có quyền truy cập' });
    await expect(deniedHeading).toBeVisible();
    await expect(deniedHeading).toBeFocused();
    await expect(page.getByRole('link', { name: 'Đăng nhập', exact: true })).toHaveAttribute(
      'href',
      '/login',
    );
    await expect(page.getByRole('link', { name: 'Về cửa hàng', exact: true })).toHaveAttribute(
      'href',
      '/',
    );
    await expect(page.getByRole('heading', { name: PROTECTED_OVERVIEW_HEADING })).toHaveCount(0);
    await expect(page.locator('[data-shell="backoffice"]')).toHaveCount(0);
    expect(protectedRequests).toEqual([]);
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousAccessibilityViolations(page);
    expect(runtimeErrors).toEqual([]);
  });

  test(bt('browser:backoffice-access', 'customer-mobile-denied'), async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const refresh = deferred<undefined>();
    const refreshStarted = deferred<undefined>();
    const protectedRequests = collectProtectedRequests(page);
    const runtimeErrors = collectRuntimeErrors(page);
    let cartMergeRequests = 0;

    await page.route('**/api/v1/auth/refresh', async (route) => {
      if (route.request().method() === 'OPTIONS') return fulfillPreflight(route);
      refreshStarted.resolve(undefined);
      await refresh.promise;
      await fulfillJson(route, sessionResponse('CUSTOMER'));
    });
    await page.route('**/api/v1/cart**', async (route) => {
      if (route.request().method() === 'OPTIONS') return fulfillPreflight(route);
      if (new URL(route.request().url()).pathname.endsWith('/cart/merge')) cartMergeRequests += 1;
      await fulfillJson(route, emptyCartResponse());
    });

    await page.goto('/backoffice/inventory/units', { waitUntil: 'domcontentloaded' });
    await refreshStarted.promise;
    await expect(page.getByRole('status', { name: 'Đang kiểm tra quyền truy cập' })).toBeVisible();
    await expect(page.locator('[data-shell="backoffice"]')).toHaveCount(0);
    expect(protectedRequests).toEqual([]);

    refresh.resolve(undefined);
    const deniedHeading = page.getByRole('heading', { name: 'Không có quyền truy cập' });
    const accountLink = page.getByRole('link', { name: 'Quản lý tài khoản' });
    await expect(deniedHeading).toBeVisible();
    await expect(deniedHeading).toBeFocused();
    await expect(accountLink).toHaveAttribute('href', '/account');
    await page.keyboard.press('Tab');
    await expect(accountLink).toBeFocused();
    await expect.poll(() => cartMergeRequests).toBe(1);
    await expect(page.getByRole('link', { name: 'Đăng nhập', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-shell="backoffice"]')).toHaveCount(0);
    expect(protectedRequests).toEqual([]);
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousAccessibilityViolations(page);
    await capture(page, testInfo, 'customer-access-denied-mobile.png');
    await expect(accountLink).toBeVisible();
    await expect(page.getByRole('link', { name: 'Đăng nhập', exact: true })).toHaveCount(0);
    expect(runtimeErrors).toEqual([]);
  });

  test(bt('browser:backoffice-access', 'network-error-retry'), async ({ page }, testInfo) => {
    let refreshAttempts = 0;
    const overview = deferred<undefined>();
    const overviewStarted = deferred<undefined>();
    const protectedRequests = collectProtectedRequests(page);
    const runtimeErrors = collectRuntimeErrors(page);

    await page.route('**/api/v1/auth/refresh', async (route) => {
      if (route.request().method() === 'OPTIONS') return fulfillPreflight(route);
      refreshAttempts += 1;
      if (refreshAttempts === 1) {
        await route.abort('failed');
        return;
      }
      await fulfillJson(route, sessionResponse('EMPLOYEE'));
    });
    await page.route('**/api/v1/backoffice/overview', async (route) => {
      if (route.request().method() === 'OPTIONS') return fulfillPreflight(route);
      overviewStarted.resolve(undefined);
      await overview.promise;
      await fulfillJson(route, overviewResponse());
    });

    await page.goto('/backoffice', { waitUntil: 'domcontentloaded' });
    const unavailableHeading = page.getByRole('heading', {
      name: 'Chưa thể kiểm tra quyền truy cập',
    });
    const retryButton = page.getByRole('button', { name: 'Thử lại', exact: true });
    await expect(unavailableHeading).toBeVisible();
    await expect(unavailableHeading).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Tổng quan vận hành' })).toHaveCount(0);
    await expect(page.locator('[data-shell="backoffice"]')).toHaveCount(0);
    expect(protectedRequests).toEqual([]);

    await page.keyboard.press('Tab');
    await expect(retryButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Tổng quan vận hành' })).toBeVisible();
    await expect(page.getByText('Đã xác nhận quyền truy cập.', { exact: true })).toBeAttached();
    await expect(page.locator('[data-shell="backoffice"]')).toHaveCount(1);
    await overviewStarted.promise;
    await expect(page.getByRole('status', { name: 'Đang tải tổng quan vận hành' })).toBeVisible();
    overview.resolve(undefined);
    await expect(page.getByText('Đơn đang xử lý', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tổng quan', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(refreshAttempts).toBe(2);
    expect(protectedRequests).toEqual(['/api/v1/backoffice/overview']);
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousAccessibilityViolations(page);
    await capture(page, testInfo, 'backoffice-overview-desktop.png');
    expect(runtimeErrors).toEqual([]);
  });
});

function collectProtectedRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/api/v1/backoffice/') && request.method() !== 'OPTIONS') {
      requests.push(pathname);
    }
  });
  return requests;
}

function collectRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !isExpectedSessionCheckFailure(message)) {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  return errors;
}

function isExpectedSessionCheckFailure(message: ConsoleMessage): boolean {
  if (!message.text().startsWith('Failed to load resource:')) return false;

  const locationUrl = message.location().url;
  if (locationUrl.length === 0) return false;

  return new URL(locationUrl).pathname === '/api/v1/auth/refresh';
}

function sessionResponse(role: 'CUSTOMER' | 'EMPLOYEE') {
  return {
    data: {
      accessToken: `backoffice-access-${role.toLowerCase()}`,
      user: {
        id:
          role === 'CUSTOMER'
            ? '0199d190-0000-7000-8000-000000000001'
            : '0199d190-0000-7000-8000-000000000002',
        email: `${role.toLowerCase()}-access@rephone.local`,
        fullName: role === 'CUSTOMER' ? 'Khách kiểm thử quyền' : 'Nhân viên kiểm thử quyền',
        phone: '0900000606',
        role,
        status: 'ACTIVE',
      },
    },
  } as const;
}

function emptyCartResponse() {
  return {
    data: {
      estimatedSubtotal: '0',
      expiresAt: null,
      id: null,
      items: [],
      status: 'ACTIVE',
      warnings: [],
    },
  } as const;
}

function overviewResponse() {
  return {
    data: {
      generatedAt: '2026-09-01T10:00:00.000Z',
      metrics: {
        activeOrders: 3,
        lowStockLevels: 1,
        openAfterSales: 2,
        paymentsUnderReview: 1,
      },
      priorities: [],
      recentOrders: [],
    },
  } as const;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function fulfillPreflight(route: Route): Promise<void> {
  await route.fulfill({ status: 204, headers: corsHeaders(route) });
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: corsHeaders(route),
    body: JSON.stringify(body),
  });
}

function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers()['origin'];
  return {
    ...(origin === undefined
      ? {}
      : {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        }),
    'Access-Control-Allow-Headers': 'authorization, content-type, x-rephone-csrf',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectNoSeriousAccessibilityViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
  ).toEqual([]);
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: testInfo.outputPath(name), fullPage: true });
}
