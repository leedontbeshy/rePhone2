import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type Route,
} from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';
import { installDeterministicPublicMedia } from './support/deterministic-public-media';

const EXACT_UNIT_PATH = '/products/iphone-14-pro/units/IP14P-128-001';
const CUSTOMER_ID = '0199d090-0000-7000-8000-000000000001';
const FIRST_EMPLOYEE_ID = '0199d090-0000-7000-8000-000000000002';
const SECOND_EMPLOYEE_ID = '0199d090-0000-7000-8000-000000000003';

type FixtureRole = 'ADMIN' | 'CUSTOMER' | 'EMPLOYEE' | 'ANONYMOUS';

test(
  bt('browser:release-matrix', 'skip-links-and-axe'),
  async ({ context }: { context: BrowserContext }) => {
    const cases = [
      { path: '/', role: 'ANONYMOUS' as const, shell: 'storefront' },
      { path: '/login', role: 'ANONYMOUS' as const, shell: 'auth' },
      { path: '/account', role: 'CUSTOMER' as const, shell: 'customer' },
      { path: '/backoffice', role: 'ADMIN' as const, shell: 'backoffice' },
    ];

    for (const shellCase of cases) {
      const page = await context.newPage();
      await installReleaseFixture(page, shellCase.role);
      await page.goto(shellCase.path, { waitUntil: 'domcontentloaded' });
      await expect(page.locator(`[data-shell="${shellCase.shell}"]`)).toHaveCount(1);
      await waitForShellState(page, shellCase.role, shellCase.path);
      await removeNextDevPortal(page);
      await expectKeyboardSkipLink(page);

      await expectNoSeriousAccessibilityViolations(
        page,
        `${shellCase.shell} representative success state`,
      );
      await page.close();
    }
  },
);

test(
  bt('browser:release-matrix', 'reduced-motion'),
  async ({ context }: { context: BrowserContext }) => {
    const storefrontPage = await context.newPage();
    await storefrontPage.emulateMedia({ reducedMotion: 'reduce' });
    await installReleaseFixture(storefrontPage, 'ANONYMOUS');
    await storefrontPage.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(storefrontPage.locator('[data-shell="storefront"]')).toHaveCount(1);
    await removeNextDevPortal(storefrontPage);
    await expectReducedMotionStyles(storefrontPage, [
      storefrontPage.getByRole('link', { name: 'rePhone — Trang chủ' }),
      storefrontPage.getByRole('button', { name: 'Tìm kiếm' }),
    ]);
    await expectKeyboardSkipLink(storefrontPage);
    await storefrontPage.close();

    const backofficePage = await context.newPage();
    await backofficePage.emulateMedia({ reducedMotion: 'reduce' });
    await installReleaseFixture(backofficePage, 'ADMIN');
    await backofficePage.goto('/backoffice', { waitUntil: 'domcontentloaded' });
    await expect(
      backofficePage.getByRole('heading', { name: 'Tổng quan vận hành', exact: true }),
    ).toBeVisible();
    await removeNextDevPortal(backofficePage);
    await expectReducedMotionStyles(backofficePage, [
      backofficePage.locator('aside[aria-label="Điều hướng backoffice"] [aria-current="page"]'),
      backofficePage.getByRole('button', { name: 'Đăng xuất', exact: true }),
    ]);
    await expectKeyboardSkipLink(backofficePage);
    await backofficePage.close();
  },
);

test(
  bt('browser:release-matrix', 'forced-colors-focus'),
  async ({ context }: { context: BrowserContext }) => {
    const authPage = await context.newPage();
    await authPage.emulateMedia({ forcedColors: 'active' });
    await installReleaseFixture(authPage, 'ANONYMOUS');
    await authPage.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(authPage.locator('[data-shell="auth"]')).toHaveCount(1);
    expect(await authPage.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);

    for (const [label, control] of [
      ['auth wordmark', authPage.getByRole('link', { name: 'rePhone — Trang chủ' })],
      ['auth email', authPage.locator('#email')],
      ['auth submit', authPage.getByRole('button', { name: 'Đăng nhập', exact: true })],
    ] as const) {
      await expectForcedColorFocus(control, label);
    }
    await authPage.close();

    const backofficePage = await context.newPage();
    await backofficePage.emulateMedia({ forcedColors: 'active' });
    await installReleaseFixture(backofficePage, 'ADMIN');
    await backofficePage.goto('/backoffice', { waitUntil: 'domcontentloaded' });
    await expect(
      backofficePage.getByRole('heading', { name: 'Tổng quan vận hành', exact: true }),
    ).toBeVisible();
    expect(await backofficePage.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(
      true,
    );

    await expectForcedColorFocus(
      backofficePage.locator('aside[aria-label="Điều hướng backoffice"] [aria-current="page"]'),
      'backoffice navigation',
    );
    await expectForcedColorFocus(
      backofficePage.getByRole('button', { name: 'Đăng xuất', exact: true }),
      'backoffice session action',
    );
    await backofficePage.close();
  },
);

test(
  bt('browser:release-matrix', 'touch-targets-and-reflow-proxy'),
  async ({ context }, testInfo) => {
    testInfo.annotations.push({
      type: 'evidence-limit',
      description:
        'The 720×450 CSS viewport is a deterministic 200% reflow proxy for a 1440×900 layout. It is not evidence from native browser zoom.',
    });
    const viewports = [
      { width: 320, height: 844 },
      { width: 390, height: 844 },
    ] as const;

    const storefrontPage = await context.newPage();
    await installReleaseFixture(storefrontPage, 'ANONYMOUS');
    await installDeterministicPublicMedia(storefrontPage);

    for (const viewport of viewports) {
      await storefrontPage.setViewportSize(viewport);
      await storefrontPage.goto('/', { waitUntil: 'domcontentloaded' });
      const menuTrigger = storefrontPage.getByRole('button', {
        name: 'Mở danh mục',
        exact: true,
      });
      const cartLink = storefrontPage.getByRole('link', {
        name: 'Giỏ hàng, 0 sản phẩm',
        exact: true,
      });
      await expectCriticalTouchTarget(
        menuTrigger,
        `storefront menu trigger at ${String(viewport.width)}px`,
      );
      await expectCriticalTouchTarget(
        cartLink,
        `storefront cart link at ${String(viewport.width)}px`,
      );

      await menuTrigger.click();
      const closeButton = storefrontPage.getByRole('button', { name: 'Đóng', exact: true });
      const mobileSearch = storefrontPage.getByRole('combobox', {
        name: 'Tìm iPhone hoặc phụ kiện',
      });
      await expectCriticalTouchTarget(
        closeButton,
        `storefront menu close at ${String(viewport.width)}px`,
      );
      await expectCriticalTouchTarget(
        mobileSearch,
        `storefront mobile search at ${String(viewport.width)}px`,
      );
      await storefrontPage.keyboard.press('Escape');
      await expect(menuTrigger).toBeFocused();
      await expectNoDocumentOverflow(
        storefrontPage,
        `storefront touch targets at ${String(viewport.width)}px`,
      );
    }

    const customerPage = await context.newPage();
    await installReleaseFixture(customerPage, 'CUSTOMER');
    for (const viewport of viewports) {
      await customerPage.setViewportSize(viewport);
      await customerPage.goto('/account', { waitUntil: 'domcontentloaded' });
      await expect(customerPage.locator('#account-fullName')).toHaveValue('Khách hàng Ma trận');
      await expectCriticalTouchTarget(
        customerPage.getByRole('button', { name: 'Mở danh mục', exact: true }),
        `customer menu trigger at ${String(viewport.width)}px`,
      );
      await expectCriticalTouchTarget(
        customerPage.getByRole('button', { name: 'Đăng xuất', exact: true }),
        `customer sign out at ${String(viewport.width)}px`,
      );
      await expectNoDocumentOverflow(
        customerPage,
        `customer touch targets at ${String(viewport.width)}px`,
      );
    }
    await customerPage.close();

    const backofficePage = await context.newPage();
    await installReleaseFixture(backofficePage, 'ADMIN');
    for (const viewport of viewports) {
      await backofficePage.setViewportSize(viewport);
      await backofficePage.goto('/backoffice', { waitUntil: 'domcontentloaded' });
      await expect(
        backofficePage.getByRole('heading', { name: 'Tổng quan vận hành', exact: true }),
      ).toBeVisible();
      await expectCriticalTouchTarget(
        backofficePage.getByRole('link', { name: 'Về cửa hàng', exact: true }),
        `backoffice storefront link at ${String(viewport.width)}px`,
      );
      await expectCriticalTouchTarget(
        backofficePage.getByRole('button', { name: 'Đăng xuất', exact: true }),
        `backoffice sign out at ${String(viewport.width)}px`,
      );
      await expectNoDocumentOverflow(
        backofficePage,
        `backoffice touch targets at ${String(viewport.width)}px`,
      );
    }
    await backofficePage.close();

    await storefrontPage.setViewportSize({ width: 720, height: 450 });
    await storefrontPage.goto(EXACT_UNIT_PATH, { waitUntil: 'domcontentloaded' });
    await expect(
      storefrontPage.getByText('Ảnh thật · Mã máy IP14P-128-001', { exact: true }),
    ).toBeVisible();
    await removeNextDevPortal(storefrontPage);
    await expectNoDocumentOverflow(storefrontPage, '720×450 reflow proxy');

    const purchaseActions = storefrontPage.locator('#unit-purchase-actions');
    await purchaseActions.scrollIntoViewIfNeeded();
    await expect(purchaseActions).toBeInViewport();
    await settleIntersectionObservers(storefrontPage);

    const relatedLink = storefrontPage.getByRole('link', { name: 'Xem tất cả', exact: true });
    await relatedLink.focus();
    await expect(relatedLink).toBeFocused();
    const stickyPurchase = storefrontPage.getByRole('complementary', { name: 'Mua máy này' });
    await expect(stickyPurchase).toBeVisible();
    await settleIntersectionObservers(storefrontPage);
    await expectViewportControlClearOfStickyChrome(storefrontPage, relatedLink, stickyPurchase);

    const footer = storefrontPage.locator('footer');
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeInViewport();
    await expect(stickyPurchase).toHaveCount(0);
    await expectNoDocumentOverflow(storefrontPage, '720×450 reflow proxy after footer handoff');
    await storefrontPage.close();
  },
);

test(bt('browser:release-matrix', 'keyboard-master-detail-focus'), async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await installReleaseFixture(page, 'ADMIN');
  await page.goto('/backoffice/employees', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Quản lý nhân viên', exact: true })).toBeVisible();

  const secondEmployee = page.getByRole('button').filter({ hasText: 'Nhân viên Ma trận Hai' });
  await expect(secondEmployee).toBeVisible();
  await tabToControl(page, secondEmployee, 80);
  await page.keyboard.press('Enter');
  await expect(secondEmployee).toHaveAttribute('aria-current', 'true');

  const detailHeading = page.getByRole('heading', {
    name: 'Chi tiết nhân viên',
    exact: true,
  });
  await expect(detailHeading).toBeFocused();
  await expect(page.locator('#employee-detail')).toContainText('nhanvien.hai@example.com');

  await page.keyboard.press('Tab');
  const returnButton = page.getByRole('button', { name: 'Quay lại danh sách', exact: true });
  await expect(returnButton).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#employee-list-title')).toBeFocused();
});

async function tabToControl(page: Page, target: Locator, maximumTabs: number): Promise<void> {
  for (let index = 0; index < maximumTabs; index += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => document.activeElement === element)) return;
  }
  await expect(
    target,
    `target must be reachable within ${String(maximumTabs)} Tab presses`,
  ).toBeFocused();
}

async function waitForShellState(page: Page, role: FixtureRole, path: string): Promise<void> {
  if (role === 'CUSTOMER') {
    await expect(page.locator('#account-fullName')).toHaveValue('Khách hàng Ma trận');
    return;
  }
  if (role === 'ADMIN') {
    await expect(
      page.getByRole('heading', { name: 'Tổng quan vận hành', exact: true }),
    ).toBeVisible();
    return;
  }
  if (path === '/login') {
    await expect(page.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeVisible();
    return;
  }
  await expect(page.locator('main#main-content')).toBeVisible();
}

async function expectKeyboardSkipLink(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0 });
  });
  const skipLink = page.getByRole('link', { name: 'Chuyển đến nội dung chính', exact: true });
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main-content')).toBeFocused();
}

async function expectReducedMotionStyles(page: Page, controls: readonly Locator[]): Promise<void> {
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true,
  );
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe(
    'auto',
  );

  for (const control of controls) {
    await expect(control).toBeVisible();
    const timings = await control.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationDuration: style.animationDuration,
        animationIterationCount: style.animationIterationCount,
        transitionDuration: style.transitionDuration,
      };
    });
    expect(maxCssTimeMs(timings.transitionDuration)).toBeLessThanOrEqual(0.01);
    expect(maxCssTimeMs(timings.animationDuration)).toBeLessThanOrEqual(0.01);
    expect(maxIterationCount(timings.animationIterationCount)).toBeLessThanOrEqual(1);
  }
}

async function expectForcedColorFocus(control: Locator, label: string): Promise<void> {
  await expect(control).toBeVisible();
  await control.focus();
  await expect(control).toBeFocused();
  const focusStyle = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(focusStyle.outlineStyle, `${label} must retain a forced-colors focus outline`).not.toBe(
    'none',
  );
  expect(focusStyle.outlineWidth, `${label} forced-colors focus outline`).toBeGreaterThanOrEqual(2);
}

async function expectCriticalTouchTarget(control: Locator, label: string): Promise<void> {
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  expect(box, `${label} must have a measurable target`).not.toBeNull();
  expect(box?.width ?? 0, `${label} width`).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0, `${label} height`).toBeGreaterThanOrEqual(44);
}

async function expectNoDocumentOverflow(page: Page, label: string): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth, `${label} must not overflow the document`).toBeLessThanOrEqual(
    dimensions.clientWidth,
  );
}

async function expectViewportControlClearOfStickyChrome(
  page: Page,
  control: Locator,
  stickyPurchase: Locator,
): Promise<void> {
  await expect(control).toBeFocused();
  await expect(control).toBeInViewport();
  await expect(stickyPurchase).toBeInViewport();
  await expect
    .poll(
      async () => {
        const [headerBox, controlBox, purchaseBox] = await Promise.all([
          page.locator('[data-shell="storefront"] > header').boundingBox(),
          control.boundingBox(),
          stickyPurchase.boundingBox(),
        ]);
        if (headerBox === null || controlBox === null || purchaseBox === null) {
          return { abovePurchase: false, belowHeader: false, hit: false, measurable: false };
        }
        const hit = await control.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const target = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
          return target !== null && (target === element || element.contains(target));
        });
        return {
          abovePurchase: controlBox.y + controlBox.height <= purchaseBox.y + 1,
          belowHeader: controlBox.y >= headerBox.y + headerBox.height - 1,
          hit,
          measurable: true,
        };
      },
      {
        message:
          'focused content control must settle between the sticky header and purchase action',
      },
    )
    .toEqual({ abovePurchase: true, belowHeader: true, hit: true, measurable: true });
}

async function settleIntersectionObservers(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

async function expectNoSeriousAccessibilityViolations(page: Page, label: string): Promise<void> {
  await expect(page).toHaveTitle(/rePhone/);
  const results = await new AxeBuilder({ page })
    .exclude('nextjs-portal')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations
      .filter(({ impact }) => impact === 'serious' || impact === 'critical')
      .map(({ id, impact, nodes }) => ({
        id,
        impact,
        targets: nodes.map(({ target }) => target),
      })),
    `${label} must have no serious or critical Axe findings`,
  ).toEqual([]);
}

function maxCssTimeMs(value: string): number {
  return Math.max(
    0,
    ...value.split(',').map((part) => {
      const normalized = part.trim();
      if (normalized.endsWith('ms')) return Number.parseFloat(normalized);
      if (normalized.endsWith('s')) return Number.parseFloat(normalized) * 1_000;
      return Number.parseFloat(normalized) || 0;
    }),
  );
}

function maxIterationCount(value: string): number {
  return Math.max(
    0,
    ...value.split(',').map((part) => {
      const normalized = part.trim();
      return normalized === 'infinite'
        ? Number.POSITIVE_INFINITY
        : Number.parseFloat(normalized) || 0;
    }),
  );
}

async function removeNextDevPortal(page: Page): Promise<void> {
  await page.locator('nextjs-portal').evaluateAll((nodes) => {
    nodes.forEach((node) => {
      node.remove();
    });
  });
}

async function installReleaseFixture(page: Page, role: FixtureRole): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') return fulfillPreflight(route);

    if (path === '/api/v1/auth/refresh') {
      if (role === 'ANONYMOUS') return fulfillJson(route, errorEnvelope('AUTH_REQUIRED'), 401);
      return fulfillJson(route, {
        data: { accessToken: `wp11-${role.toLowerCase()}`, user: authUser(role) },
      });
    }
    if (path.startsWith('/api/v1/cart')) return fulfillJson(route, emptyCart());
    if (path === '/api/v1/affiliate/profile') return fulfillJson(route, { data: null });
    if (path === '/api/v1/account' && request.method() === 'GET') {
      return fulfillJson(route, { data: customerAccount() });
    }
    if (path === '/api/v1/backoffice/overview' && request.method() === 'GET') {
      return fulfillJson(route, { data: overviewSnapshot() });
    }
    if (path === '/api/v1/backoffice/employees' && request.method() === 'GET') {
      return fulfillJson(route, paged([firstEmployee(), secondEmployee()]));
    }
    if (path === `/api/v1/backoffice/employees/${FIRST_EMPLOYEE_ID}`) {
      return fulfillJson(route, { data: firstEmployee() });
    }
    if (path === `/api/v1/backoffice/employees/${SECOND_EMPLOYEE_ID}`) {
      return fulfillJson(route, { data: secondEmployee() });
    }
    if (path === '/api/v1/backoffice/settings' && request.method() === 'GET') {
      return fulfillJson(route, { data: settingsProjection() });
    }
    return fulfillJson(route, errorEnvelope('RESOURCE_NOT_FOUND'), 404);
  });
}

function authUser(role: Exclude<FixtureRole, 'ANONYMOUS'>) {
  return {
    email: `${role.toLowerCase()}-wp11@rephone.local`,
    fullName:
      role === 'ADMIN'
        ? 'Quản trị Ma trận'
        : role === 'EMPLOYEE'
          ? 'Nhân viên Ma trận'
          : 'Khách hàng Ma trận',
    id:
      role === 'CUSTOMER'
        ? CUSTOMER_ID
        : role === 'ADMIN'
          ? '0199d090-0000-7000-8000-000000000004'
          : '0199d090-0000-7000-8000-000000000005',
    phone: '0900000909',
    role,
    status: 'ACTIVE',
  };
}

function customerAccount() {
  return {
    email: 'customer-wp11@rephone.local',
    emailVerifiedAt: '2026-09-01T02:00:00.000Z',
    fullName: 'Khách hàng Ma trận',
    id: CUSTOMER_ID,
    phone: '0900000909',
    role: 'CUSTOMER',
    status: 'ACTIVE',
  };
}

function firstEmployee() {
  return employeeProjection({
    email: 'nhanvien.mot@example.com',
    employeeCode: 'NV-091',
    fullName: 'Nhân viên Ma trận Một',
    id: FIRST_EMPLOYEE_ID,
  });
}

function secondEmployee() {
  return employeeProjection({
    email: 'nhanvien.hai@example.com',
    employeeCode: 'NV-092',
    fullName: 'Nhân viên Ma trận Hai',
    id: SECOND_EMPLOYEE_ID,
  });
}

function employeeProjection(identity: {
  email: string;
  employeeCode: string;
  fullName: string;
  id: string;
}) {
  return {
    ...identity,
    createdAt: '2026-08-01T02:00:00.000Z',
    disabledAt: null,
    emailVerifiedAt: '2026-08-01T03:00:00.000Z',
    hiredAt: '2026-08-01',
    invitationExpiresAt: null,
    lastLoginAt: '2026-09-02T02:00:00.000Z',
    phone: '0900000092',
    status: 'ACTIVE',
    updatedAt: '2026-09-02T02:00:00.000Z',
  };
}

function overviewSnapshot() {
  return {
    generatedAt: '2026-09-02T03:00:00.000Z',
    metrics: {
      activeOrders: 12,
      lowStockLevels: 2,
      openAfterSales: 4,
      paymentsUnderReview: 3,
    },
    priorities: [],
    recentOrders: [],
  };
}

function settingsProjection() {
  return {
    bankAccountHolder: 'REPHONE COMPANY',
    bankAccountNumber: '0123456789',
    bankName: 'Ngân hàng FE09',
    bankQrUrl: null,
    createdAt: '2026-08-01T02:00:00.000Z',
    currency: 'VND',
    defaultShippingFee: '30000',
    defaultWarrantyDays: 180,
    defaultWarrantyTerms: 'Bảo hành theo chính sách rePhone.',
    depositProofWindowMinutes: 60,
    depositReviewWindowMinutes: 120,
    pickupHoldMinutes: 1_440,
    shippingDepositAmount: '500000',
    storeAddress: '123 Đường FE09, Thành phố Hồ Chí Minh',
    storeName: 'rePhone Ma trận',
    storePhone: '0909000090',
    timezone: 'Asia/Ho_Chi_Minh',
    updatedAt: '2026-09-01T02:00:00.000Z',
    updatedBy: { fullName: 'Quản trị Ma trận', id: 'staff-ADMIN' },
    version: 3,
  };
}

function emptyCart() {
  return {
    data: {
      estimatedSubtotal: '0',
      expiresAt: null,
      id: null,
      items: [],
      status: 'ACTIVE',
      warnings: [],
    },
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

function errorEnvelope(code: string) {
  return {
    error: {
      code,
      details: [],
      message: `Lỗi giả lập ${code}`,
      requestId: `wp11-${code.toLowerCase()}`,
    },
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: corsHeaders(route),
    status,
  });
}

async function fulfillPreflight(route: Route): Promise<void> {
  await route.fulfill({ headers: corsHeaders(route), status: 204 });
}

function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers()['origin'];
  return {
    ...(origin === undefined
      ? {}
      : {
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Origin': origin,
        }),
    'Access-Control-Allow-Headers': 'authorization, content-type, x-rephone-csrf',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
}
