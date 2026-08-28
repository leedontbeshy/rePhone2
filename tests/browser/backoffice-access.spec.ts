import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';

const PROTECTED_ORDER_HEADING = 'Vận hành đơn hàng';

test.describe('Backoffice access boundary', () => {
  test('never renders or requests a protected page while an anonymous session is unresolved', async ({
    page,
  }, testInfo) => {
    const refresh = deferred<undefined>();
    const refreshStarted = deferred<undefined>();
    const protectedRequests = collectProtectedRequests(page);

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

    await page.goto('/backoffice/orders', { waitUntil: 'domcontentloaded' });
    await refreshStarted.promise;

    await expect(page.getByRole('status', { name: 'Đang kiểm tra quyền truy cập' })).toBeVisible();
    await expect(page.getByRole('heading', { name: PROTECTED_ORDER_HEADING })).toHaveCount(0);
    await expect(page.locator('[data-shell="backoffice"]')).toHaveCount(0);
    expect(protectedRequests).toEqual([]);
    await capture(page, testInfo, 'anonymous-session-pending.png');

    refresh.resolve(undefined);
    await expect(page.getByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Đăng nhập', exact: true })).toHaveAttribute(
      'href',
      '/login',
    );
    await expect(page.getByRole('link', { name: 'Về cửa hàng', exact: true })).toHaveAttribute(
      'href',
      '/',
    );
    await expect(page.getByRole('heading', { name: PROTECTED_ORDER_HEADING })).toHaveCount(0);
    await expect(page.locator('[data-shell="backoffice"]')).toHaveCount(0);
    expect(protectedRequests).toEqual([]);
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousAccessibilityViolations(page);
  });

  test('blocks a customer on mobile without mounting the inventory workspace', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const refresh = deferred<undefined>();
    const refreshStarted = deferred<undefined>();
    const protectedRequests = collectProtectedRequests(page);

    await page.route('**/api/v1/auth/refresh', async (route) => {
      if (route.request().method() === 'OPTIONS') return fulfillPreflight(route);
      refreshStarted.resolve(undefined);
      await refresh.promise;
      await fulfillJson(route, sessionResponse('CUSTOMER'));
    });

    await page.goto('/backoffice/inventory/units', { waitUntil: 'domcontentloaded' });
    await refreshStarted.promise;
    await expect(page.getByRole('status', { name: 'Đang kiểm tra quyền truy cập' })).toBeVisible();
    await expect(page.locator('[data-shell="backoffice"]')).toHaveCount(0);
    expect(protectedRequests).toEqual([]);

    refresh.resolve(undefined);
    await expect(page.getByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Quản lý tài khoản' })).toHaveAttribute(
      'href',
      '/account',
    );
    await expect(page.getByRole('link', { name: 'Đăng nhập', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-shell="backoffice"]')).toHaveCount(0);
    expect(protectedRequests).toEqual([]);
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousAccessibilityViolations(page);
    await capture(page, testInfo, 'customer-access-denied-mobile.png');
  });

  test('fails closed on a network error and opens the overview only after a successful retry', async ({
    page,
  }, testInfo) => {
    let refreshAttempts = 0;
    const protectedRequests = collectProtectedRequests(page);

    await page.route('**/api/v1/auth/refresh', async (route) => {
      if (route.request().method() === 'OPTIONS') return fulfillPreflight(route);
      refreshAttempts += 1;
      if (refreshAttempts === 1) {
        await route.abort('failed');
        return;
      }
      await fulfillJson(route, sessionResponse('EMPLOYEE'));
    });

    await page.goto('/backoffice', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'Chưa thể kiểm tra quyền truy cập' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tổng quan vận hành' })).toHaveCount(0);
    await expect(page.locator('[data-shell="backoffice"]')).toHaveCount(0);
    expect(protectedRequests).toEqual([]);

    await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tổng quan vận hành' })).toBeVisible();
    await expect(page.locator('[data-shell="backoffice"]')).toHaveCount(1);
    await expect(
      page.getByRole('status', { name: 'Dữ liệu tổng quan đang được chuẩn bị' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tổng quan', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(refreshAttempts).toBe(2);
    expect(protectedRequests).toEqual([]);
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousAccessibilityViolations(page);
    await capture(page, testInfo, 'backoffice-overview-desktop.png');
  });
});

function collectProtectedRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/api/v1/backoffice/')) requests.push(pathname);
  });
  return requests;
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
