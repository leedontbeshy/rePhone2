import { expect, test, type Page, type Response } from '@playwright/test';
import { browserTestTitle } from '../../apps/web/lib/frontend-browser-coverage';

const EMPLOYEE = {
  email: 'employee@rephone.local',
  password: 'EmployeeDemo123',
};
const MISSING_RESOURCE_ID = '0199d007-0000-7000-8000-000000000099';

interface OperationsRoute {
  readonly apiPath: string;
  readonly path: string;
  readonly ready:
    | { readonly kind: 'heading'; readonly name: string; readonly loadingLabel: string }
    | { readonly kind: 'error'; readonly name: string };
}

const OPERATIONS_ROUTES: readonly OperationsRoute[] = [
  {
    apiPath: '/api/v1/backoffice/orders',
    path: '/backoffice/orders',
    ready: {
      kind: 'heading',
      loadingLabel: 'Đang tải danh sách đơn hàng',
      name: 'Đơn hàng',
    },
  },
  {
    apiPath: `/api/v1/backoffice/orders/${MISSING_RESOURCE_ID}`,
    path: `/backoffice/orders/${MISSING_RESOURCE_ID}`,
    ready: { kind: 'error', name: 'Chưa thể hoàn tất' },
  },
  {
    apiPath: '/api/v1/backoffice/payments',
    path: '/backoffice/payments',
    ready: {
      kind: 'heading',
      loadingLabel: 'Đang tải danh sách',
      name: 'Duyệt thanh toán',
    },
  },
  {
    apiPath: `/api/v1/backoffice/payments/${MISSING_RESOURCE_ID}`,
    path: `/backoffice/payments/${MISSING_RESOURCE_ID}`,
    ready: { kind: 'error', name: 'Chưa thể tiếp tục' },
  },
  {
    apiPath: '/api/v1/backoffice/refunds',
    path: '/backoffice/refunds',
    ready: {
      kind: 'heading',
      loadingLabel: 'Đang tải danh sách',
      name: 'Hoàn tiền',
    },
  },
  {
    apiPath: `/api/v1/backoffice/refunds/${MISSING_RESOURCE_ID}`,
    path: `/backoffice/refunds/${MISSING_RESOURCE_ID}`,
    ready: { kind: 'error', name: 'Chưa thể tiếp tục' },
  },
  {
    apiPath: '/api/v1/backoffice/after-sales',
    path: '/backoffice/after-sales',
    ready: {
      kind: 'heading',
      loadingLabel: 'Đang tải hồ sơ hỗ trợ',
      name: 'Hỗ trợ sau mua',
    },
  },
  {
    apiPath: `/api/v1/backoffice/after-sales/${MISSING_RESOURCE_ID}`,
    path: `/backoffice/after-sales/${MISSING_RESOURCE_ID}`,
    ready: { kind: 'error', name: 'Chưa mở được hồ sơ' },
  },
  {
    apiPath: '/api/v1/backoffice/warranties',
    path: '/backoffice/warranties',
    ready: {
      kind: 'heading',
      loadingLabel: 'Đang tải bảo hành',
      name: 'Bảo hành đã cấp',
    },
  },
  {
    apiPath: `/api/v1/backoffice/warranties/${MISSING_RESOURCE_ID}`,
    path: `/backoffice/warranties/${MISSING_RESOURCE_ID}`,
    ready: { kind: 'error', name: 'Chưa mở được bảo hành' },
  },
  {
    apiPath: '/api/v1/backoffice/warranty-policies',
    path: '/backoffice/warranty-policies',
    ready: {
      kind: 'heading',
      loadingLabel: 'Đang tải chính sách',
      name: 'Chính sách bảo hành',
    },
  },
];

test.describe('FE-07 operations workspace route matrix', () => {
  test(
    browserTestTitle('browser:operations-lifecycle', 'staff-route-state-matrix'),
    async ({ page }) => {
      test.slow();
      await loginAsEmployee(page);

      for (const route of OPERATIONS_ROUTES) {
        await test.step(route.path, async () => {
          const apiResponsePromise = waitForGetResponse(page, route.apiPath);
          await page.goto(route.path, { waitUntil: 'domcontentloaded' });
          const apiResponse = await apiResponsePromise;

          if (route.ready.kind === 'heading') {
            expect(apiResponse.status(), `${route.apiPath} phải trả về dữ liệu hợp lệ`).toBe(200);
            await expect(
              page.getByRole('heading', { level: 1, name: route.ready.name }),
            ).toBeVisible();
            await expect(page.getByRole('status', { name: route.ready.loadingLabel })).toHaveCount(
              0,
            );
          } else {
            expect(
              apiResponse.status(),
              `${route.apiPath} phải trả về trạng thái không tìm thấy`,
            ).toBe(404);
            await expect(page.getByText(route.ready.name, { exact: true })).toBeVisible();
          }

          await expectProtectedOperationsWorkspace(page, route.path);
        });
      }
    },
  );
});

async function loginAsEmployee(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(EMPLOYEE.email);
  await page.getByLabel('Mật khẩu').fill(EMPLOYEE.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL('/backoffice', { timeout: 15_000 });
}

function waitForGetResponse(page: Page, apiPath: string): Promise<Response> {
  return page.waitForResponse(
    (response) => {
      return response.request().method() === 'GET' && new URL(response.url()).pathname === apiPath;
    },
    { timeout: 20_000 },
  );
}

async function expectProtectedOperationsWorkspace(page: Page, path: string): Promise<void> {
  await expect(page).toHaveURL(path);
  await expect(page.locator('[data-shell="backoffice"]')).toHaveCount(1);
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Các khu vực vận hành' })).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: /^(?:Đăng nhập|Không có quyền truy cập|Không thể mở khu vực này)/,
    }),
  ).toHaveCount(0);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.scrollWidth,
    `${path} không được tràn ngang (${String(dimensions.scrollWidth)} > ${String(dimensions.clientWidth)})`,
  ).toBeLessThanOrEqual(dimensions.clientWidth);
}
