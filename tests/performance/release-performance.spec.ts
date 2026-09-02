import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { installDeterministicPublicMedia } from '../browser/support/deterministic-public-media';

const API_BASE_URL = 'http://localhost:4001/api/v1';
const WEB_ORIGIN = 'http://localhost:3001';
const REPORT_TYPE = reportTypeFrom(process.env.WP12_REPORT_TYPE);
const REPORT_PATH =
  process.env.WP12_REPORT_PATH?.trim() || `.local/release-performance/wp12-${REPORT_TYPE}.json`;
const SAMPLE_COUNT = 3;
const WARMUP_COUNT = 1;
const VIEWPORT = { width: 390, height: 844 } as const;
const CART_UNIT = {
  code: 'IP14P-128-001',
  path: '/products/iphone-14-pro/units/IP14P-128-001',
} as const;
const ORDER_UNIT = {
  code: 'IP14P-256-001',
  path: '/products/iphone-14-pro/units/IP14P-256-001',
} as const;
const CUSTOMER = {
  email: 'customer@rephone.local',
  password: 'CustomerDemo123',
} as const;
const ADMIN = {
  email: 'admin@rephone.local',
  password: 'AdminDemo123',
} as const;
const PROFILE = {
  browser: 'chromium',
  clientPlatform: 'windows',
  cpuSlowdownMultiplier: 4,
  latencyMs: 40,
  downloadMbps: 10,
  uploadMbps: 5,
  media: 'deterministic-public-fixture',
  viewport: VIEWPORT,
} as const;
const THRESHOLDS = {
  lcpMs: 2_500,
  cls: 0.1,
  interactionProxyMs: 200,
} as const;
const HYDRATION_WARNING =
  /hydration|hydrated but|server-rendered html|server rendered html|text content does not match|did not match/i;

type ContextRole = 'anonymous' | 'guest-cart' | 'customer' | 'admin';
type ReportType = 'baseline' | 'after';

interface RuntimeIssue {
  readonly source: 'console' | 'pageerror';
  readonly message: string;
}

interface RequestPathCount {
  readonly path: string;
  readonly count: number;
}

interface PerformanceSample {
  readonly run: number;
  readonly lcpMs: number;
  readonly cls: number;
  readonly interactionProxyMs: number;
  readonly navigationDurationMs: number;
  readonly requestCount: number;
  readonly transferredBytes: number;
  readonly clientJsBytes: number;
  readonly requestPaths: readonly RequestPathCount[];
  readonly runtimeIssues: readonly RuntimeIssue[];
}

interface PerformanceMedian {
  readonly lcpMs: number;
  readonly cls: number;
  readonly interactionProxyMs: number;
  readonly navigationDurationMs: number;
  readonly requestCount: number;
  readonly transferredBytes: number;
  readonly clientJsBytes: number;
}

interface SetupState {
  readonly customerOrderNumber: string;
  readonly backofficeOrderId: string;
  readonly catalogProductId: string;
}

interface HarnessContexts {
  readonly customer: BrowserContext;
  readonly admin: BrowserContext;
}

interface RouteDescriptor {
  readonly name: string;
  readonly routeTemplate: string;
  readonly role: ContextRole;
  readonly resolvePath: (setup: SetupState) => string;
  readonly ready: (page: Page, setup: SetupState) => Promise<void>;
  readonly interact: (page: Page, setup: SetupState) => Promise<void>;
}

interface RoutePerformanceReport {
  readonly route: string;
  readonly name: string;
  readonly role: ContextRole;
  readonly routeTemplate: string;
  readonly samples: readonly PerformanceSample[];
  readonly medians: PerformanceMedian;
  readonly requestPathMedians: readonly RequestPathCount[];
  readonly passed: boolean;
}

interface BrowserMetrics {
  lcpMs: number;
  cls: number;
  interactionPromise?: Promise<number>;
}

declare global {
  interface Window {
    __rephoneWp12Metrics: BrowserMetrics;
  }
}

const ROUTES: readonly RouteDescriptor[] = [
  {
    name: 'storefront-model',
    routeTemplate: '/products/[slug]',
    role: 'anonymous',
    resolvePath: () => '/products/iphone-14-pro',
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'iPhone 14 Pro' })).toBeVisible();
    },
    interact: openMobileMenu,
  },
  {
    name: 'storefront-exact-unit',
    routeTemplate: '/products/[slug]/units/[inventoryCode]',
    role: 'anonymous',
    resolvePath: () => CART_UNIT.path,
    ready: async (page) => {
      await expect(
        page.getByText(`Ảnh thật · Mã máy ${CART_UNIT.code}`, { exact: true }),
      ).toBeVisible();
    },
    interact: openMobileMenu,
  },
  {
    name: 'login',
    routeTemplate: '/login',
    role: 'anonymous',
    resolvePath: () => '/login',
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeVisible();
    },
    interact: async (page) => {
      const toggle = page.getByRole('button', { name: 'Hiện mật khẩu', exact: true });
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-label', 'Ẩn mật khẩu');
    },
  },
  {
    name: 'customer-account',
    routeTemplate: '/account',
    role: 'customer',
    resolvePath: () => '/account',
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Hồ sơ của bạn' })).toBeVisible();
      await expect(page.locator('#account-fullName')).toHaveValue('Khách hàng Demo');
    },
    interact: openMobileMenu,
  },
  {
    name: 'guest-cart',
    routeTemplate: '/cart',
    role: 'guest-cart',
    resolvePath: () => '/cart',
    ready: async (page) => {
      await expect(
        page.getByRole('heading', { level: 1, name: 'Kiểm tra sản phẩm đã chọn' }),
      ).toBeVisible();
      await expect(page.getByText(`Mã máy: ${CART_UNIT.code}`, { exact: true })).toBeVisible();
    },
    interact: openMobileMenu,
  },
  {
    name: 'guest-checkout',
    routeTemplate: '/checkout',
    role: 'guest-cart',
    resolvePath: () => '/checkout',
    ready: async (page) => {
      await expect(
        page.getByRole('heading', { level: 1, name: 'Hoàn tất đơn hàng' }),
      ).toBeVisible();
      await expect(page.getByLabel('Giao tận nơi')).toBeChecked();
    },
    interact: openMobileMenu,
  },
  {
    name: 'customer-order-detail',
    routeTemplate: '/orders/[orderNumber]',
    role: 'customer',
    resolvePath: (setup) => `/orders/${encodeURIComponent(setup.customerOrderNumber)}`,
    ready: async (page, setup) => {
      await expect(
        page.getByRole('heading', { level: 1, name: setup.customerOrderNumber, exact: true }),
      ).toBeVisible();
    },
    interact: openMobileMenu,
  },
  {
    name: 'backoffice-catalog-product-detail',
    routeTemplate: '/backoffice/catalog/products/[id]',
    role: 'admin',
    resolvePath: (setup) =>
      `/backoffice/catalog/products/${encodeURIComponent(setup.catalogProductId)}`,
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'iPhone 14 Pro' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Nội dung sản phẩm' })).toBeVisible();
    },
    interact: async (page) => {
      await page.getByRole('button', { name: 'Chỉnh sửa thông tin', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Chỉnh sửa thông tin' })).toBeVisible();
    },
  },
  {
    name: 'backoffice-inventory-intake',
    routeTemplate: '/backoffice/inventory/intake',
    role: 'admin',
    resolvePath: () => '/backoffice/inventory/intake',
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Nhập máy vào kho' })).toBeVisible();
      await expect(page.locator('#intake-productId')).toBeEnabled();
    },
    interact: async (page) => {
      const product = page.locator('#intake-productId');
      await product.click();
      await expect(product).toBeFocused();
      await page.keyboard.press('Escape');
    },
  },
  {
    name: 'backoffice-order-detail',
    routeTemplate: '/backoffice/orders/[id]',
    role: 'admin',
    resolvePath: (setup) => `/backoffice/orders/${encodeURIComponent(setup.backofficeOrderId)}`,
    ready: async (page, setup) => {
      await expect(
        page.getByRole('heading', { level: 1, name: setup.customerOrderNumber, exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('group', { name: 'Thao tác đang được phép' })).toBeVisible();
    },
    interact: async (page) => {
      const action = page
        .getByRole('group', { name: 'Thao tác đang được phép' })
        .getByRole('button')
        .first();
      await action.click();
      await expect(action).toHaveAttribute('aria-pressed', 'true');
    },
  },
  {
    name: 'backoffice-audit-log',
    routeTemplate: '/backoffice/audit-logs',
    role: 'admin',
    resolvePath: () => '/backoffice/audit-logs',
    ready: async (page) => {
      await expect(
        page.getByRole('heading', { level: 1, name: 'Nhật ký hoạt động' }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { level: 2, name: 'Danh sách hoạt động' }),
      ).toBeVisible();
    },
    interact: async (page) => {
      const disclosure = page.locator('details').filter({ hasText: 'Bộ lọc chi tiết' });
      await disclosure.locator('summary').click();
      await expect(disclosure).toHaveAttribute('open', '');
    },
  },
  {
    name: 'backoffice-system-health',
    routeTemplate: '/backoffice/system/health',
    role: 'admin',
    resolvePath: () => '/backoffice/system/health',
    ready: async (page) => {
      await expect(
        page.getByRole('heading', { level: 1, name: 'Trạng thái hệ thống' }),
      ).toBeVisible();
      await expect(page.locator('#system-health-summary-title')).toBeVisible();
    },
    interact: async (page) => {
      const refresh = page.getByRole('button', { name: 'Kiểm tra lại', exact: true });
      await refresh.click();
      await expect(page.getByRole('button', { name: 'Đang kiểm tra lại' })).toBeVisible();
    },
  },
];

test('WP-12 production release performance matrix', async ({ browser }) => {
  test.setTimeout(30 * 60_000);
  expect(ROUTES).toHaveLength(12);
  expect(SAMPLE_COUNT).toBeGreaterThanOrEqual(3);

  const revision = currentRevision();
  expect(
    revision.clean,
    'WP-12 performance measurement must run from a clean commit so the report SHA is reproducible.',
  ).toBe(true);

  const customer = await createAuthenticatedContext(browser, CUSTOMER, '/account');
  let admin: BrowserContext | undefined;
  try {
    const customerOrderNumber = await createRepresentativeShippingOrder(customer);
    admin = await createAuthenticatedContext(browser, ADMIN, '/backoffice/catalog/products');
    const discovery = await discoverAdminRoutes(admin, customerOrderNumber);
    const setup: SetupState = {
      customerOrderNumber,
      backofficeOrderId: discovery.backofficeOrderId,
      catalogProductId: discovery.catalogProductId,
    };
    const contexts: HarnessContexts = { customer, admin };
    await installMetricObservers(customer);
    await installMetricObservers(admin);

    const routes: RoutePerformanceReport[] = [];
    for (const descriptor of ROUTES) {
      for (let warmup = 0; warmup < WARMUP_COUNT; warmup += 1) {
        await measureRoute(browser, contexts, descriptor, setup, 0, false);
      }

      const samples: PerformanceSample[] = [];
      for (let run = 1; run <= SAMPLE_COUNT; run += 1) {
        samples.push(await measureRoute(browser, contexts, descriptor, setup, run, true));
      }
      const medians = summarizeSamples(samples);
      const requestPathMedians = summarizeRequestPaths(samples);
      routes.push({
        route: descriptor.name,
        name: descriptor.name,
        role: descriptor.role,
        routeTemplate: descriptor.routeTemplate,
        samples,
        medians,
        requestPathMedians,
        passed: passesAbsoluteGate(medians),
      });
    }

    const report = {
      schema: 'rephone.release-performance.wp12',
      schemaVersion: 2,
      reportType: REPORT_TYPE,
      measuredAt: new Date().toISOString(),
      commitSha: revision.sha,
      workingTreeClean: revision.clean,
      productionBuild: true,
      routeCount: ROUTES.length,
      runCount: SAMPLE_COUNT,
      warmupCountPerRoute: WARMUP_COUNT,
      sampleCountPerRoute: SAMPLE_COUNT,
      profile: PROFILE,
      thresholds: THRESHOLDS,
      routes,
    } as const;

    await mkdir(dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    expect(report.routeCount).toBe(12);
    for (const route of routes) assertRouteGate(route.name, route.medians, route.samples);
  } finally {
    await admin?.close();
    await customer.close();
  }
});

async function createAuthenticatedContext(
  browser: Browser,
  credentials: { readonly email: string; readonly password: string },
  destination: string,
): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await installDeterministicPublicMedia(context);
  const page = await context.newPage();
  try {
    await page.goto(`/login?returnTo=${encodeURIComponent(destination)}`);
    await page.getByLabel('Email').fill(credentials.email);
    await page.locator('#password').fill(credentials.password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForURL(destination);
  } catch (error) {
    await context.close();
    throw error;
  } finally {
    await page.close();
  }
  return context;
}

async function createRepresentativeShippingOrder(context: BrowserContext): Promise<string> {
  const page = await context.newPage();
  try {
    await page.goto(ORDER_UNIT.path);
    await expect(
      page.getByText(`Ảnh thật · Mã máy ${ORDER_UNIT.code}`, { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Thêm vào giỏ', exact: true }).click();
    await expect(page.getByText('Đã thêm vào giỏ hàng.', { exact: true })).toBeVisible();
    await page.goto('/checkout');
    await fillShippingCheckout(page);

    const preview = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v1/checkouts/preview',
    );
    await page.getByRole('button', { name: 'Kiểm tra đơn hàng', exact: true }).click();
    expect((await preview).status()).toBe(200);
    await expect(page.getByRole('button', { name: 'Đặt hàng', exact: true })).toBeVisible();

    const create = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v1/checkouts',
    );
    await page.getByRole('button', { name: 'Đặt hàng', exact: true }).click();
    expect((await create).status()).toBe(201);
    await page.waitForURL('**/orders/**');
    const orderNumber = orderNumberFrom(page.url());
    await expect(
      page.getByRole('heading', { level: 1, name: orderNumber, exact: true }),
    ).toBeVisible();
    return orderNumber;
  } finally {
    await page.close();
  }
}

async function fillShippingCheckout(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Hoàn tất đơn hàng' })).toBeVisible();
  await expect(page.getByLabel('Giao tận nơi')).toBeChecked();
  await page.locator('#checkout-fullName').fill('Khách hàng hiệu năng');
  await page.locator('#checkout-email').fill(CUSTOMER.email);
  await page.locator('#checkout-phone').fill('0900000000');
  await page.locator('#checkout-receiverName').fill('Khách hàng hiệu năng');
  await page.locator('#checkout-receiverPhone').fill('0900000000');
  await page.locator('#checkout-addressLine').fill('123 Đường Kiểm thử');
  await page.locator('#checkout-ward').fill('Phường Demo');
  await page.locator('#checkout-district').fill('Quận Demo');
  await page.locator('#checkout-province').fill('TP. Hồ Chí Minh');
}

async function discoverAdminRoutes(
  context: BrowserContext,
  orderNumber: string,
): Promise<{ backofficeOrderId: string; catalogProductId: string }> {
  const page = await context.newPage();
  try {
    await page.goto('/backoffice/catalog/products?q=iPhone%2014%20Pro');
    await expect(page.getByRole('heading', { level: 1, name: 'Danh mục sản phẩm' })).toBeVisible();
    const productHref = await requiredHref(
      page
        .locator('section[aria-label="Danh sách sản phẩm"]')
        .getByRole('link')
        .filter({ hasText: 'iPhone 14 Pro' })
        .first(),
      '/backoffice/catalog/products/',
    );

    await page.goto(`/backoffice/orders?q=${encodeURIComponent(orderNumber)}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Đơn hàng' })).toBeVisible();
    const orderHref = await requiredHref(
      page
        .getByRole('region', { name: 'Danh sách đơn hàng' })
        .getByRole('link')
        .filter({ hasText: orderNumber })
        .first(),
      '/backoffice/orders/',
    );

    return {
      catalogProductId: finalPathSegment(productHref, '/backoffice/catalog/products/'),
      backofficeOrderId: finalPathSegment(orderHref, '/backoffice/orders/'),
    };
  } finally {
    await page.close();
  }
}

async function requiredHref(locator: Locator, prefix: string): Promise<string> {
  await expect(locator).toBeVisible();
  const href = await locator.getAttribute('href');
  if (href === null || !href.startsWith(prefix)) {
    throw new Error(`Expected a sanitized discovery link beginning with ${prefix}.`);
  }
  return href;
}

function finalPathSegment(href: string, prefix: string): string {
  const segment = href.slice(prefix.length).split(/[?#/]/, 1)[0];
  if (segment === undefined || segment.length === 0) {
    throw new Error(`Expected a dynamic route segment after ${prefix}.`);
  }
  return decodeURIComponent(segment);
}

async function measureRoute(
  browser: Browser,
  contexts: HarnessContexts,
  descriptor: RouteDescriptor,
  setup: SetupState,
  run: number,
  collect: boolean,
): Promise<PerformanceSample> {
  const acquired = await acquireContext(browser, contexts, descriptor.role);
  const page = await acquired.context.newPage();
  const runtimeIssues = collectRuntimeIssues(page);
  const requestPaths = collectRequestPaths(page);
  const session = await acquired.context.newCDPSession(page);

  try {
    await applyFixedProfile(session);
    await page.goto(descriptor.resolvePath(setup), { waitUntil: 'load' });
    await descriptor.ready(page, setup);
    await page.evaluate(async () => document.fonts.ready);
    await page.waitForTimeout(750);
    const interactionProxyMs = await measureInteraction(page, async () => {
      await descriptor.interact(page, setup);
    });
    assertNoRuntimeIssues(descriptor.name, runtimeIssues);

    if (!collect) return emptySample(interactionProxyMs);
    const sample = await readSample(page, run, interactionProxyMs, requestPaths, runtimeIssues);
    assertSampleComplete(descriptor.name, sample);
    return sample;
  } finally {
    await session.detach();
    await page.close();
    if (acquired.owned) await acquired.context.close();
  }
}

async function acquireContext(
  browser: Browser,
  contexts: HarnessContexts,
  role: ContextRole,
): Promise<{ context: BrowserContext; owned: boolean }> {
  if (role === 'customer') return { context: contexts.customer, owned: false };
  if (role === 'admin') return { context: contexts.admin, owned: false };

  const context = await browser.newContext({ viewport: VIEWPORT });
  try {
    await installDeterministicPublicMedia(context);
    await installMetricObservers(context);
    if (role === 'guest-cart') await prepareGuestCart(context);
    return { context, owned: true };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function prepareGuestCart(context: BrowserContext): Promise<void> {
  const response = await context.request.post(`${API_BASE_URL}/cart/items`, {
    data: { itemType: 'IPHONE', inventoryCode: CART_UNIT.code },
    headers: { Origin: WEB_ORIGIN, 'X-Rephone-CSRF': '1' },
  });
  if (!response.ok()) {
    throw new Error(
      `Unable to prepare the guest performance cart: HTTP ${String(response.status())}`,
    );
  }
}

async function installMetricObservers(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const metrics: BrowserMetrics = { lcpMs: 0, cls: 0 };
    Object.defineProperty(window, '__rephoneWp12Metrics', {
      value: metrics,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) metrics.lcpMs = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) metrics.cls += shift.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

async function applyFixedProfile(
  session: Awaited<ReturnType<BrowserContext['newCDPSession']>>,
): Promise<void> {
  await session.send('Network.enable');
  await session.send('Network.clearBrowserCache');
  await session.send('Emulation.setCPUThrottlingRate', { rate: PROFILE.cpuSlowdownMultiplier });
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: PROFILE.latencyMs,
    downloadThroughput: (PROFILE.downloadMbps * 1_000_000) / 8,
    uploadThroughput: (PROFILE.uploadMbps * 1_000_000) / 8,
  });
}

function collectRuntimeIssues(page: Page): RuntimeIssue[] {
  const issues: RuntimeIssue[] = [];
  page.on('pageerror', (error) => {
    issues.push({ source: 'pageerror', message: sanitizeDiagnostic(error.message) });
  });
  page.on('console', (message) => {
    if (!['error', 'warning'].includes(message.type()) || !HYDRATION_WARNING.test(message.text())) {
      return;
    }
    issues.push({ source: 'console', message: sanitizeDiagnostic(message.text()) });
  });
  return issues;
}

function collectRequestPaths(page: Page): Map<string, number> {
  const paths = new Map<string, number>();
  page.on('request', (request) => {
    const path = sanitizedRequestPath(request.url());
    if (path === null) return;
    paths.set(path, (paths.get(path) ?? 0) + 1);
  });
  return paths;
}

async function measureInteraction(page: Page, interaction: () => Promise<void>): Promise<number> {
  await page.evaluate(() => {
    window.__rephoneWp12Metrics.interactionPromise = new Promise<number>((resolve) => {
      window.addEventListener(
        'click',
        () => {
          const startedAt = performance.now();
          requestAnimationFrame(() => {
            requestAnimationFrame((paintedAt) => {
              resolve(paintedAt - startedAt);
            });
          });
        },
        { capture: true, once: true },
      );
    });
  });
  await interaction();
  return await page.evaluate(async () => {
    const promise = window.__rephoneWp12Metrics.interactionPromise;
    if (promise === undefined)
      throw new Error('WP-12 interaction measurement was not initialized.');
    return await promise;
  });
}

async function readSample(
  page: Page,
  run: number,
  interactionProxyMs: number,
  requestPaths: ReadonlyMap<string, number>,
  runtimeIssues: readonly RuntimeIssue[],
): Promise<PerformanceSample> {
  const metrics = await page.evaluate((measuredInteraction) => {
    const observed = window.__rephoneWp12Metrics;
    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const transferSize = (entries: readonly PerformanceResourceTiming[]) =>
      entries.reduce((total, entry) => total + entry.transferSize, 0);
    const clientScripts = resources.filter((entry) => {
      const path = new URL(entry.name, window.location.origin).pathname;
      return path.startsWith('/_next/static/chunks/') && path.endsWith('.js');
    });
    return {
      lcpMs: observed.lcpMs,
      cls: observed.cls,
      interactionProxyMs: measuredInteraction,
      navigationDurationMs: navigation?.duration ?? 0,
      requestCount: resources.length + (navigation === undefined ? 0 : 1),
      transferredBytes: transferSize(resources) + (navigation?.transferSize ?? 0),
      clientJsBytes: transferSize(clientScripts),
    };
  }, interactionProxyMs);
  const orderedRequestPaths = Array.from(requestPaths, ([path, count]): RequestPathCount => ({
    path,
    count,
  })).sort((left, right) => left.path.localeCompare(right.path));

  return {
    run,
    lcpMs: round(metrics.lcpMs, 2),
    cls: round(metrics.cls, 4),
    interactionProxyMs: round(metrics.interactionProxyMs, 2),
    navigationDurationMs: round(metrics.navigationDurationMs, 2),
    requestCount: metrics.requestCount,
    transferredBytes: metrics.transferredBytes,
    clientJsBytes: metrics.clientJsBytes,
    requestPaths: orderedRequestPaths,
    runtimeIssues: [...runtimeIssues],
  };
}

function emptySample(interactionProxyMs: number): PerformanceSample {
  return {
    run: 0,
    lcpMs: 0,
    cls: 0,
    interactionProxyMs: round(interactionProxyMs, 2),
    navigationDurationMs: 0,
    requestCount: 0,
    transferredBytes: 0,
    clientJsBytes: 0,
    requestPaths: [],
    runtimeIssues: [],
  };
}

function assertSampleComplete(route: string, sample: PerformanceSample): void {
  expect(sample.lcpMs, `${route} run ${String(sample.run)} captured LCP`).toBeGreaterThan(0);
  expect(
    sample.interactionProxyMs,
    `${route} run ${String(sample.run)} captured interaction`,
  ).toBeGreaterThan(0);
  expect(
    sample.navigationDurationMs,
    `${route} run ${String(sample.run)} captured navigation`,
  ).toBeGreaterThan(0);
  expect(
    sample.requestCount,
    `${route} run ${String(sample.run)} captured requests`,
  ).toBeGreaterThan(0);
  expect(
    sample.transferredBytes,
    `${route} run ${String(sample.run)} captured transferred bytes`,
  ).toBeGreaterThan(0);
  expect(
    sample.clientJsBytes,
    `${route} run ${String(sample.run)} captured client JavaScript`,
  ).toBeGreaterThan(0);
  expect(
    sample.cls,
    `${route} run ${String(sample.run)} captured a valid CLS`,
  ).toBeGreaterThanOrEqual(0);
  expect(
    sample.requestPaths.length,
    `${route} run ${String(sample.run)} captured paths`,
  ).toBeGreaterThan(0);
  expect(sample.runtimeIssues, `${route} run ${String(sample.run)} runtime issues`).toEqual([]);
}

function assertNoRuntimeIssues(route: string, issues: readonly RuntimeIssue[]): void {
  expect(issues, `${route} must not emit page errors or hydration warnings`).toEqual([]);
}

function summarizeSamples(samples: readonly PerformanceSample[]): PerformanceMedian {
  if (samples.length < 3) throw new Error('WP-12 requires at least three measured samples.');
  return {
    lcpMs: median(samples.map(({ lcpMs }) => lcpMs)),
    cls: median(samples.map(({ cls }) => cls)),
    interactionProxyMs: median(samples.map(({ interactionProxyMs }) => interactionProxyMs)),
    navigationDurationMs: median(samples.map(({ navigationDurationMs }) => navigationDurationMs)),
    requestCount: median(samples.map(({ requestCount }) => requestCount)),
    transferredBytes: median(samples.map(({ transferredBytes }) => transferredBytes)),
    clientJsBytes: median(samples.map(({ clientJsBytes }) => clientJsBytes)),
  };
}

function summarizeRequestPaths(samples: readonly PerformanceSample[]): readonly RequestPathCount[] {
  const paths = new Set<string>();
  for (const sample of samples) {
    for (const requestPath of sample.requestPaths) paths.add(requestPath.path);
  }
  return Array.from(paths)
    .sort((left, right) => left.localeCompare(right))
    .map((path) => ({
      path,
      count: median(
        samples.map(
          ({ requestPaths }) => requestPaths.find((entry) => entry.path === path)?.count ?? 0,
        ),
      ),
    }))
    .filter(({ count }) => count > 0);
}

function passesAbsoluteGate(medianSample: PerformanceMedian): boolean {
  return (
    medianSample.lcpMs > 0 &&
    medianSample.navigationDurationMs > 0 &&
    medianSample.requestCount > 0 &&
    medianSample.transferredBytes > 0 &&
    medianSample.clientJsBytes > 0 &&
    medianSample.lcpMs <= THRESHOLDS.lcpMs &&
    medianSample.cls <= THRESHOLDS.cls &&
    medianSample.interactionProxyMs <= THRESHOLDS.interactionProxyMs
  );
}

function assertRouteGate(
  route: string,
  medianSample: PerformanceMedian,
  samples: readonly PerformanceSample[],
): void {
  for (const sample of samples) assertSampleComplete(route, sample);
  expect(medianSample.lcpMs, `${route} median LCP`).toBeLessThanOrEqual(THRESHOLDS.lcpMs);
  expect(medianSample.cls, `${route} median CLS`).toBeLessThanOrEqual(THRESHOLDS.cls);
  expect(medianSample.interactionProxyMs, `${route} median interaction proxy`).toBeLessThanOrEqual(
    THRESHOLDS.interactionProxyMs,
  );
  expect(passesAbsoluteGate(medianSample), `${route} absolute performance gate`).toBe(true);
}

function sanitizedRequestPath(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;

  const path = decodeURIComponent(url.pathname);
  if (path.startsWith('/storage/v1/object/')) return '/storage/v1/object/{public-media}';
  if (path.startsWith('/_next/static/chunks/')) return '/_next/static/chunks/{chunk}.js';
  if (path.startsWith('/_next/static/css/')) return '/_next/static/css/{stylesheet}.css';
  if (path.startsWith('/_next/static/media/')) return '/_next/static/media/{asset}';

  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '{id}')
    .replace(/RPH-[A-Z0-9-]+/gi, '{orderNumber}')
    .replace(/IP\d{2}[A-Z]*-[A-Z0-9-]+/gi, '{inventoryCode}')
    .replace(/\/([0-9a-z_-]{20,})(?=\/|$)/gi, '/{opaqueId}');
}

function sanitizeDiagnostic(message: string): string {
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database-url]')
    .replace(/https?:\/\/[^\s)]+/gi, '[url]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '{id}')
    .replace(/RPH-[A-Z0-9-]+/gi, '{orderNumber}')
    .replace(/[A-Za-z]:\\[^\s]+/g, '[local-path]')
    .replace(/[A-Za-z0-9_-]{43,}/g, '[token]')
    .slice(0, 500);
}

async function openMobileMenu(page: Page): Promise<void> {
  const trigger = page.getByRole('button', { name: 'Mở danh mục', exact: true });
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  if (ordered.length === 0) throw new Error('Cannot calculate a median without samples.');
  const middle = Math.floor(ordered.length / 2);
  const right = ordered[middle];
  if (right === undefined) throw new Error('Median sample is missing.');
  if (ordered.length % 2 === 1) return right;
  const left = ordered[middle - 1];
  if (left === undefined) throw new Error('Median sample pair is incomplete.');
  return round((left + right) / 2, 4);
}

function orderNumberFrom(rawUrl: string): string {
  const segments = new URL(rawUrl).pathname.split('/').filter(Boolean);
  const orderNumber = segments[segments.length - 1];
  if (orderNumber === undefined || !orderNumber.startsWith('RPH-')) {
    throw new Error('Expected a customer order detail URL after setup.');
  }
  return decodeURIComponent(orderNumber);
}

function reportTypeFrom(value: string | undefined): ReportType {
  const normalized = value?.trim().toLowerCase() || 'baseline';
  if (normalized === 'baseline' || normalized === 'after') return normalized;
  throw new Error('WP12_REPORT_TYPE must be either "baseline" or "after".');
}

function currentRevision(): { sha: string; clean: boolean } {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  return { sha, clean: status.length === 0 };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
