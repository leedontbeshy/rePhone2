import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';
import { stabilizeVisualPage } from './support/stabilize-visual-page';

const EMPLOYEE_ID = '0199d030-0000-7000-8000-000000000001';
const CUSTOMER_ID = '0199d030-0000-7000-8000-000000000002';
const AUDIT_ID = '0199d030-0000-7000-8000-000000000003';
const AUDIT_REQUEST_ID = 'request-fe09-release-matrix-correlation-000030';
const AUDIT_RESOURCE_ID = '0199d030-0000-7000-8000-000000000030';

const RELEASE_VIEWPORTS = [
  { height: 844, name: 'mobile-320', width: 320 },
  { height: 844, name: 'mobile-390', width: 390 },
  { height: 1024, name: 'tablet-768', width: 768 },
  { height: 768, name: 'desktop-1024', width: 1024 },
  { height: 900, name: 'desktop-1440', width: 1440 },
] as const;

type AuthenticatedRole = 'ADMIN' | 'CUSTOMER' | 'EMPLOYEE';
type MatrixRole = AuthenticatedRole | 'ANONYMOUS';

interface MatrixProbe {
  readonly childRequests: string[];
}

const ROUTES = [
  {
    active: 'Tổng quan',
    heading: 'Tổng quan vận hành',
    route: '/backoffice',
    state: 'Tình hình vận hành',
  },
  {
    active: 'Nhân viên',
    heading: 'Quản lý nhân viên',
    route: '/backoffice/employees',
    state: 'Nhân viên Ma trận',
  },
  {
    active: 'Khách hàng',
    heading: 'Quản lý khách hàng',
    route: '/backoffice/customers',
    state: 'Khách hàng Ma trận',
  },
  {
    active: 'Cấu hình cửa hàng',
    heading: 'Cấu hình cửa hàng',
    route: '/backoffice/settings',
    state: 'Thông tin cửa hàng',
  },
  {
    active: 'Nhật ký hoạt động',
    heading: 'Nhật ký hoạt động',
    route: '/backoffice/audit-logs',
    state: 'Danh sách hoạt động',
  },
  {
    active: 'Nhật ký hoạt động',
    heading: 'Nhật ký hoạt động',
    route: `/backoffice/audit-logs/${AUDIT_ID}`,
    state: 'Truy vết yêu cầu',
  },
  {
    active: 'Trạng thái hệ thống',
    heading: 'Trạng thái hệ thống',
    route: '/backoffice/system/health',
    state: 'Hệ thống đang hoạt động ổn định',
  },
] as const;

const EMPLOYEE_ROUTES = [ROUTES[0], ROUTES[2]] as const;

const EMPLOYEE_DENIED_ROUTES = [ROUTES[1], ROUTES[3], ROUTES[4], ROUTES[5], ROUTES[6]] as const;

test(
  bt('browser:system-admin-health', 'system-admin-responsive-route-matrix'),
  async ({ context }) => {
    test.slow();
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 360, height: 844 },
    ]) {
      for (const accessCase of [
        { role: 'ADMIN' as const, routes: ROUTES },
        { role: 'EMPLOYEE' as const, routes: EMPLOYEE_ROUTES },
      ]) {
        for (const route of accessCase.routes) {
          const page = await context.newPage();
          await page.setViewportSize(viewport);
          await installMatrixFixture(page, accessCase.role);
          await page.goto(route.route, { waitUntil: 'domcontentloaded' });

          await expect(page.locator('[data-shell="backoffice"]')).toHaveCount(1);
          await expect(
            page.getByRole('heading', { name: route.heading, exact: true }),
          ).toBeVisible();
          await expect(page.locator('main')).toContainText(route.state);
          const activeNavigation = page.locator(
            'aside[aria-label="Điều hướng backoffice"] [aria-current="page"]',
          );
          await expect(activeNavigation).toContainText(route.active);
          await expect(activeNavigation).toBeInViewport();
          if (route.route.includes(`/audit-logs/${AUDIT_ID}`)) {
            await expect(page).toHaveURL((url) => {
              return (
                url.pathname === '/backoffice/audit-logs' &&
                url.searchParams.get('selected') === AUDIT_ID
              );
            });
          }

          const routeLabel = `${accessCase.role} ${route.route}`;
          await expectNoHorizontalOverflow(page, routeLabel, viewport.width);
          await expectNoSeriousAccessibilityViolations(page, routeLabel, viewport.width);
          if (process.env['FE09_CAPTURE_SCREENSHOTS'] === '1') {
            await capture(page, route.route, viewport.width, accessCase.role);
          }
          await page.close();
        }
      }
    }
  },
);

test(
  bt('browser:system-admin-health', 'system-admin-immediate-permission-gate'),
  async ({ context }) => {
    const deniedCases = [
      ...EMPLOYEE_DENIED_ROUTES.map((route) => ({ role: 'EMPLOYEE' as const, route })),
      { role: 'CUSTOMER' as const, route: ROUTES[3] },
      { role: 'ANONYMOUS' as const, route: ROUTES[3] },
    ];

    for (const denied of deniedCases) {
      const page = await context.newPage();
      await page.setViewportSize({ width: 360, height: 844 });
      const probe = await installMatrixFixture(page, denied.role);
      await page.goto(denied.route.route, { waitUntil: 'domcontentloaded' });

      if (denied.role === 'EMPLOYEE') {
        await expect(page.locator('[data-shell="backoffice"]')).toHaveCount(1);
        await expect(
          page.getByRole('heading', { name: 'Không thể mở khu vực này', exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText('Chỉ quản trị viên được mở khu vực này.', { exact: true }),
        ).toBeVisible();
      } else {
        await expect(page.locator('[data-shell="backoffice"]')).toHaveCount(0);
        await expect(
          page.getByRole('heading', { name: 'Không có quyền truy cập', exact: true }),
        ).toBeVisible();
      }
      await expect(
        page.getByRole('heading', { name: denied.route.heading, exact: true }),
      ).toHaveCount(0);
      expect(probe.childRequests, `${denied.role} không được gọi dữ liệu trang con`).toEqual([]);

      const routeLabel = `${denied.role} ${denied.route.route} permission`;
      await expectNoHorizontalOverflow(page, routeLabel, 360);
      await expectNoSeriousAccessibilityViolations(page, routeLabel, 360);
      if (process.env['FE09_CAPTURE_SCREENSHOTS'] === '1') {
        await capture(page, `${denied.route.route}-permission`, 360, denied.role);
      }
      await page.close();
    }
  },
);

test(
  bt('browser:system-admin-health', 'system-admin-audit-selected-release-matrix'),
  async ({ page }) => {
    test.setTimeout(180_000);
    await installMatrixFixture(page, 'ADMIN');

    for (const viewport of RELEASE_VIEWPORTS) {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await page.goto(`/backoffice/audit-logs/${AUDIT_ID}`, {
        waitUntil: 'domcontentloaded',
      });

      await expect(page.locator('#audit-detail-title')).toHaveText('Đã cập nhật cấu hình cửa hàng');
      await expect(page).toHaveURL((url) => {
        return (
          url.pathname === '/backoffice/audit-logs' && url.searchParams.get('selected') === AUDIT_ID
        );
      });

      const activeNavigation = page.locator(
        'aside[aria-label="Điều hướng backoffice"] [aria-current="page"]',
      );
      await expect(activeNavigation).toHaveText('Nhật ký hoạt động');
      await expect(activeNavigation).toBeInViewport();

      const selectedAudit = page.locator(`main a[href*="selected=${AUDIT_ID}"]`);
      await expect(selectedAudit).toHaveAttribute('aria-current', 'page');
      await expect(selectedAudit).toHaveAttribute('data-selected', 'true');
      await expect(selectedAudit).toContainText('Đang chọn');
      await expect(selectedAudit).toBeVisible();

      const detailPanel = page.locator('aside[aria-labelledby="audit-detail-title"]');
      await expect(detailPanel).toContainText(AUDIT_REQUEST_ID);
      await expect(detailPanel).toContainText(AUDIT_RESOURCE_ID);
      const technicalDisclosures = detailPanel.locator('details');
      for (let index = 0; index < (await technicalDisclosures.count()); index += 1) {
        await technicalDisclosures.nth(index).locator('summary').click();
      }
      await expect(detailPanel.locator('pre').first()).toContainText('[REDACTED]');

      const routeLabel = `ADMIN audit selected ${viewport.name}`;
      await expectNoHorizontalOverflow(page, routeLabel, viewport.width);
      await expectNoSeriousAccessibilityViolations(page, routeLabel, viewport.width);

      if (viewport.name === 'desktop-1440' || viewport.name === 'mobile-390') {
        await stabilizeVisualPage(page);
        if (viewport.name === 'desktop-1440') {
          const sidebar = page.getByRole('complementary', {
            name: 'Điều hướng backoffice',
          });
          const targetScrollTop = await sidebar.evaluate((element) => {
            // Keep the nested scroller at its viewport height while Playwright expands the page
            // for a full-page capture; otherwise dvh growth clamps scrollTop back to zero.
            element.style.blockSize = `${String(element.getBoundingClientRect().height)}px`;
            const maximumScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
            element.scrollTop = maximumScrollTop;
            return maximumScrollTop;
          });
          await expect
            .poll(() => sidebar.evaluate((element) => element.scrollTop))
            .toBe(targetScrollTop);
          await expect(activeNavigation).toBeInViewport();
        }
        await expect(page).toHaveScreenshot(
          `wp11-system-admin-audit-selected-${viewport.name}.png`,
          {
            animations: 'disabled',
            caret: 'hide',
            fullPage: true,
          },
        );
      }
    }
  },
);

async function installMatrixFixture(page: Page, role: MatrixRole): Promise<MatrixProbe> {
  const probe: MatrixProbe = { childRequests: [] };
  await page.route('**/api/v1/auth/refresh', (route) => {
    if (role === 'ANONYMOUS') return json(route, errorEnvelope('AUTH_REQUIRED'), 401);
    return json(route, { data: { accessToken: `fe09-matrix-${role}`, user: staff(role) } });
  });
  await page.route('**/api/v1/cart**', (route) => json(route, emptyCart()));
  await page.route('**/api/v1/backoffice/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const requestPath = url.pathname;
    if (request.method() === 'OPTIONS') return preflight(route);
    probe.childRequests.push(`${request.method()} ${requestPath}`);

    if (request.method() !== 'GET') return json(route, errorEnvelope('FORBIDDEN'), 403);
    if (requestPath === '/api/v1/backoffice/overview') {
      return json(route, { data: overviewSnapshot() });
    }
    if (requestPath === '/api/v1/backoffice/employees') {
      return json(route, paged([employeeProjection()]));
    }
    if (requestPath === `/api/v1/backoffice/employees/${EMPLOYEE_ID}`) {
      return json(route, { data: employeeProjection() });
    }
    if (requestPath === '/api/v1/backoffice/customers') {
      return json(route, paged([customerProjection()]));
    }
    if (requestPath === `/api/v1/backoffice/customers/${CUSTOMER_ID}`) {
      return json(route, { data: customerProjection() });
    }
    if (requestPath === '/api/v1/backoffice/settings') {
      return json(route, { data: settingsProjection() });
    }
    if (requestPath === '/api/v1/backoffice/audit-logs') {
      return json(route, paged([auditItem()]));
    }
    if (requestPath === `/api/v1/backoffice/audit-logs/${AUDIT_ID}`) {
      return json(route, { data: auditDetail() });
    }
    if (requestPath === '/api/v1/backoffice/system/health') {
      return json(route, { data: healthSnapshot() });
    }
    return json(route, errorEnvelope('RESOURCE_NOT_FOUND'), 404);
  });
  return probe;
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
    priorities: [
      {
        count: 3,
        href: '/backoffice/payments',
        key: 'PAYMENT_REVIEW_OVERDUE',
        oldestAt: '2026-09-01T03:00:00.000Z',
      },
    ],
    recentOrders: [
      {
        customerName: 'Khách hàng Ma trận',
        fulfillmentStatus: 'IN_TRANSIT',
        grandTotal: '24500000',
        id: '0199d030-0000-7000-8000-000000000011',
        orderNumber: 'RPH-20260902-0030',
        paymentStatus: 'PARTIALLY_PAID',
        placedAt: '2026-09-02T02:30:00.000Z',
        status: 'PROCESSING',
      },
    ],
  };
}

function employeeProjection() {
  return {
    createdAt: '2026-08-01T02:00:00.000Z',
    disabledAt: null,
    email: 'nhanvien.matran@example.com',
    emailVerifiedAt: '2026-08-01T03:00:00.000Z',
    employeeCode: 'NV-030',
    fullName: 'Nhân viên Ma trận',
    hiredAt: '2026-08-01',
    id: EMPLOYEE_ID,
    invitationExpiresAt: null,
    lastLoginAt: '2026-09-02T02:00:00.000Z',
    phone: '0900000030',
    status: 'ACTIVE',
    updatedAt: '2026-09-02T02:00:00.000Z',
  };
}

function customerProjection() {
  return {
    createdAt: '2026-08-02T02:00:00.000Z',
    email: 'khachhang.matran@example.com',
    emailVerifiedAt: '2026-08-02T03:00:00.000Z',
    fullName: 'Khách hàng Ma trận',
    id: CUSTOMER_ID,
    lastLoginAt: '2026-09-02T02:15:00.000Z',
    lastOrderAt: '2026-09-01T02:00:00.000Z',
    orderCount: 3,
    phone: '0900000031',
    status: 'ACTIVE',
    suspendedAt: null,
    updatedAt: '2026-09-02T02:15:00.000Z',
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
    storePhone: '0909000030',
    timezone: 'Asia/Ho_Chi_Minh',
    updatedAt: '2026-09-01T02:00:00.000Z',
    updatedBy: { fullName: 'Quản trị FE09', id: 'staff-ADMIN' },
    version: 3,
  };
}

function auditItem() {
  return {
    action: 'settings.updated',
    actor: {
      employeeCode: 'ADM-09',
      fullName: 'Quản trị viên hệ thống Nguyễn Minh Anh phụ trách cửa hàng trung tâm',
      id: 'staff-ADMIN',
      role: 'ADMIN',
    },
    actorType: 'USER',
    changes: null,
    createdAt: '2026-09-02T02:00:00.000Z',
    id: AUDIT_ID,
    metadata: null,
    requestId: AUDIT_REQUEST_ID,
    resourceId: AUDIT_RESOURCE_ID,
    resourceType: 'StoreSettings',
  };
}

function auditDetail() {
  return {
    ...auditItem(),
    changes: {
      after: {
        defaultWarrantyTerms:
          'Bảo hành tại cửa hàng trung tâm Thành phố Hồ Chí Minh theo chính sách hiện hành.',
        storeName: 'rePhone Ma trận phát hành toàn diện FE09',
      },
      before: {
        defaultWarrantyTerms: 'Bảo hành theo chính sách rePhone.',
        storeName: 'rePhone',
      },
      protectedCredential: '[REDACTED]',
    },
    ipAddress: '203.0.113.30',
    metadata: {
      fields: ['storeName', 'defaultWarrantyTerms'],
      requestContext: {
        correlationReference:
          'correlation-fe09-release-hardening-system-administration-visual-baseline-000030',
        sessionCredential: '[REDACTED]',
      },
      result: 'success',
    },
    userAgent:
      'Trình duyệt kiểm thử FE09 trên thiết bị quản trị có chuỗi nhận diện dài để kiểm tra xuống dòng',
  };
}

function healthSnapshot() {
  return {
    api: {
      latencyMs: 4,
      reason: 'ok',
      state: 'healthy',
      uptimeSeconds: 7_200,
      version: 'fe09-matrix',
    },
    checkedAt: '2026-09-02T03:00:00.000Z',
    database: {
      appliedMigrationCount: 18,
      incompleteMigrationCount: 0,
      latencyMs: 12,
      reason: 'ok',
      state: 'healthy',
    },
    durationMs: 28,
    mail: { latencyMs: 11, reason: 'ok', state: 'healthy' },
    state: 'healthy',
    storage: { latencyMs: 18, reason: 'ok', state: 'healthy' },
  };
}

function staff(role: AuthenticatedRole) {
  return {
    email: `${role.toLowerCase()}@rephone.local`,
    fullName:
      role === 'ADMIN'
        ? 'Quản trị FE09'
        : role === 'EMPLOYEE'
          ? 'Nhân viên FE09'
          : 'Khách hàng FE09',
    id: `staff-${role}`,
    phone: '0900000707',
    role,
    status: 'ACTIVE',
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

async function expectNoHorizontalOverflow(page: Page, route: string, width: number): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth, `${route} tràn ngang tại ${String(width)}px`).toBeLessThanOrEqual(
    dimensions.clientWidth,
  );
}

async function expectNoSeriousAccessibilityViolations(
  page: Page,
  route: string,
  width: number,
): Promise<void> {
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
    `${route} có lỗi accessibility nghiêm trọng tại ${String(width)}px`,
  ).toEqual([]);
}

async function capture(page: Page, route: string, width: number, role: MatrixRole): Promise<void> {
  const directory = path.resolve('.local/fe09/wp10-audit');
  await mkdir(directory, { recursive: true });
  await page.locator('nextjs-portal').evaluateAll((nodes) => {
    nodes.forEach((node) => {
      node.remove();
    });
  });
  const routeWithoutPrefix = route.replace(/^\/backoffice\/?/, '');
  const slug =
    routeWithoutPrefix.length === 0 ? 'overview' : routeWithoutPrefix.split('/').join('-');
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: path.join(directory, `${role.toLowerCase()}-${slug}-${String(width)}.png`),
  });
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
