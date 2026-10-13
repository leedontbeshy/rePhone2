import { fulfillPendingTasks } from './support/pending-tasks';
import { expect, test, type Page, type Route } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';

const EMPLOYEE_A = '0199d010-0000-7000-8000-000000000001';
const EMPLOYEE_B = '0199d010-0000-7000-8000-000000000002';
const CUSTOMER_A = '0199d010-0000-7000-8000-000000000011';
const CUSTOMER_B = '0199d010-0000-7000-8000-000000000012';

type Role = 'ADMIN' | 'EMPLOYEE';

type ControlledRequestState = 'waiting' | 'started' | 'completed';

interface ControlledDetailRequest {
  readonly release: () => void;
  readonly state: () => ControlledRequestState;
}

interface UserProbe {
  readonly commands: string[];
  readonly detailFailures: Set<string>;
  readonly detailReads: string[];
  readonly holdNextDetail: (path: string) => ControlledDetailRequest;
  employeeListReads: number;
  customerListReads: number;
}

test(bt('browser:system-admin-health', 'user-master-detail-stability'), async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 1024, height: 720 });
  const probe = await userFixture(page, 'ADMIN');

  await page.goto('/backoffice/employees');
  const employeeList = page.getByRole('heading', { name: 'Nhân viên (2)', exact: true });
  await expect(employeeList).toBeVisible();
  await expect(page.locator('#employee-detail')).toContainText('Nhân viên An');
  const employeeListReads = probe.employeeListReads;
  expect(employeeListReads).toBeGreaterThanOrEqual(1);

  const employeeB = userButton(page, 'Nhân viên Bình');
  const employeeA = userButton(page, 'Nhân viên An');
  const employeeAPath = `/api/v1/backoffice/employees/${EMPLOYEE_A}`;
  const employeeBPath = `/api/v1/backoffice/employees/${EMPLOYEE_B}`;
  const employeeBDetail = probe.holdNextDetail(employeeBPath);
  const employeeBRequest = waitForDetailRequest(page, employeeBPath);
  await employeeB.scrollIntoViewIfNeeded();
  const employeeScroll = await page.evaluate(() => window.scrollY);
  await employeeB.click();
  await employeeBRequest;
  await expect.poll(employeeBDetail.state).toBe('started');
  try {
    await expect(page.getByLabel('Đang tải chi tiết')).toBeVisible();
    await expect(employeeList).toBeVisible();
    const employeeARequest = waitForDetailRequest(page, employeeAPath);
    await employeeA.click();
    await employeeARequest;
    await expect(page.locator('#employee-detail')).toContainText('Nhân viên An');
    await expect(page.locator('#employee-detail').getByRole('heading', { level: 2 })).toBeFocused();
    await expect(page.locator('#employee-detail')).not.toContainText('Nhân viên Bình');
    expect(probe.employeeListReads).toBe(employeeListReads);
    expect(
      Math.abs((await page.evaluate(() => window.scrollY)) - employeeScroll),
    ).toBeLessThanOrEqual(2);
  } finally {
    employeeBDetail.release();
  }
  await expect.poll(employeeBDetail.state).toBe('completed');
  await expect(page.locator('#employee-detail')).toContainText('Nhân viên An');
  await expect(page.locator('#employee-detail')).not.toContainText('Nhân viên Bình');
  expect(probe.employeeListReads).toBe(employeeListReads);
  expect(
    Math.abs((await page.evaluate(() => window.scrollY)) - employeeScroll),
  ).toBeLessThanOrEqual(2);

  await page.goto('/backoffice/customers');
  const customerList = page.getByRole('heading', { name: 'Khách hàng (2)', exact: true });
  await expect(customerList).toBeVisible();
  await expect(page.locator('#customer-detail')).toContainText('Khách An');
  const customerListReads = probe.customerListReads;
  expect(customerListReads).toBeGreaterThanOrEqual(1);

  const customerA = userButton(page, 'Khách An');
  const customerB = userButton(page, 'Khách Bình');
  const customerAPath = `/api/v1/backoffice/customers/${CUSTOMER_A}`;
  const customerBPath = `/api/v1/backoffice/customers/${CUSTOMER_B}`;
  const customerBDetail = probe.holdNextDetail(customerBPath);
  const customerBRequest = waitForDetailRequest(page, customerBPath);
  await customerB.scrollIntoViewIfNeeded();
  const customerScroll = await page.evaluate(() => window.scrollY);
  await customerB.click();
  await customerBRequest;
  await expect.poll(customerBDetail.state).toBe('started');
  try {
    await expect(page.getByLabel('Đang tải chi tiết')).toBeVisible();
    await expect(customerList).toBeVisible();
    const customerARequest = waitForDetailRequest(page, customerAPath);
    await customerA.click();
    await customerARequest;
    await expect(page.locator('#customer-detail')).toContainText('Khách An');
    await expect(page.locator('#customer-detail').getByRole('heading', { level: 2 })).toBeFocused();
    await expect(page.locator('#customer-detail')).not.toContainText('Khách Bình');
    expect(probe.customerListReads).toBe(customerListReads);
    expect(
      Math.abs((await page.evaluate(() => window.scrollY)) - customerScroll),
    ).toBeLessThanOrEqual(2);
  } finally {
    customerBDetail.release();
  }
  await expect.poll(customerBDetail.state).toBe('completed');
  await expect(page.locator('#customer-detail')).toContainText('Khách An');
  await expect(page.locator('#customer-detail')).not.toContainText('Khách Bình');
  expect(probe.customerListReads).toBe(customerListReads);
  expect(
    Math.abs((await page.evaluate(() => window.scrollY)) - customerScroll),
  ).toBeLessThanOrEqual(2);

  const detailReadsBeforeFailure = probe.detailReads.filter(
    (path) => path === customerBPath,
  ).length;
  probe.detailFailures.add(customerBPath);
  const customerFailureDetail = probe.holdNextDetail(customerBPath);
  const customerFailureRequest = waitForDetailRequest(page, customerBPath);
  await customerB.scrollIntoViewIfNeeded();
  const customerErrorScroll = await page.evaluate(() => window.scrollY);
  await customerB.click();
  await customerFailureRequest;
  await expect.poll(customerFailureDetail.state).toBe('started');
  try {
    await expect(page.getByLabel('Đang tải chi tiết')).toBeVisible();
    await expect(customerList).toBeVisible();
    await expect(customerB).toBeFocused();
    expect(probe.customerListReads).toBe(customerListReads);
    expect(
      Math.abs((await page.evaluate(() => window.scrollY)) - customerErrorScroll),
    ).toBeLessThanOrEqual(2);
  } finally {
    customerFailureDetail.release();
  }
  await expect.poll(customerFailureDetail.state).toBe('completed');
  await expect(page.getByText('Lỗi giả lập SERVICE_UNAVAILABLE', { exact: true })).toBeVisible();
  await expect(customerList).toBeVisible();
  await expect(page.locator('#customer-detail')).toContainText('Khách An');
  await expect(customerB).toBeFocused();
  expect(probe.customerListReads).toBe(customerListReads);
  expect(
    Math.abs((await page.evaluate(() => window.scrollY)) - customerErrorScroll),
  ).toBeLessThanOrEqual(2);

  const customerRetryDetail = probe.holdNextDetail(customerBPath);
  const customerRetryRequest = waitForDetailRequest(page, customerBPath);
  await customerB.click();
  await customerRetryRequest;
  await expect.poll(customerRetryDetail.state).toBe('started');
  const customerRetryScroll = await page.evaluate(() => window.scrollY);
  try {
    await expect(page.getByLabel('Đang tải chi tiết')).toBeVisible();
    await expect(customerList).toBeVisible();
    await expect(customerB).toBeFocused();
    expect(probe.customerListReads).toBe(customerListReads);
    expect(
      Math.abs((await page.evaluate(() => window.scrollY)) - customerRetryScroll),
    ).toBeLessThanOrEqual(2);
  } finally {
    customerRetryDetail.release();
  }
  await expect.poll(customerRetryDetail.state).toBe('completed');
  await expect(page.locator('#customer-detail')).toContainText('Khách Bình');
  await expect(page.locator('#customer-detail').getByRole('heading', { level: 2 })).toBeFocused();
  await expect(page.getByText('Lỗi giả lập SERVICE_UNAVAILABLE', { exact: true })).toHaveCount(0);
  expect(probe.detailReads.filter((path) => path === customerBPath)).toHaveLength(
    detailReadsBeforeFailure + 2,
  );
  expect(probe.customerListReads).toBe(customerListReads);
  expect(
    Math.abs((await page.evaluate(() => window.scrollY)) - customerRetryScroll),
  ).toBeLessThanOrEqual(2);
});

test(bt('browser:system-admin-health', 'user-lifecycle-conflict-and-lock'), async ({ page }) => {
  const probe = await userFixture(page, 'ADMIN', { customerConflict: true });

  await page.goto('/backoffice/employees');
  await expect(page.locator('#employee-detail')).toContainText('Nhân viên An');
  await page.getByRole('button', { name: 'Vô hiệu hóa', exact: true }).click();
  const employeeDialog = page.getByRole('dialog', { name: 'Vô hiệu hóa nhân viên?' });
  await employeeDialog.getByLabel('Lý do thay đổi trạng thái').fill('Nhân viên đã nghỉ việc');
  await employeeDialog.getByRole('button', { name: 'Vô hiệu hóa', exact: true }).dblclick();
  await expect(
    page.getByText('Đã vô hiệu hóa nhân viên và thu hồi toàn bộ phiên đăng nhập.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    probe.commands.filter((path) => path === `/api/v1/backoffice/employees/${EMPLOYEE_A}/disable`),
  ).toHaveLength(1);

  await page.goto('/backoffice/customers');
  await expect(page.locator('#customer-detail')).toContainText('Khách An');
  await page.getByRole('button', { name: 'Tạm khóa khách hàng', exact: true }).click();
  const customerDialog = page.getByRole('dialog', { name: 'Tạm khóa khách hàng?' });
  await customerDialog
    .getByLabel('Lý do thay đổi trạng thái')
    .fill('Cần xác minh lại hoạt động tài khoản');
  await customerDialog.getByRole('button', { name: 'Tạm khóa', exact: true }).click();
  await expect(
    page.getByText('Tài khoản đã thay đổi ở nơi khác. Dữ liệu mới nhất đã được tải lại.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('#customer-detail')).toContainText('Tạm khóa');
  expect(
    probe.commands.filter((path) => path === `/api/v1/backoffice/customers/${CUSTOMER_A}/suspend`),
  ).toHaveLength(1);
});

test(bt('browser:system-admin-health', 'customer-staff-role-boundary'), async ({ page }) => {
  const probe = await userFixture(page, 'EMPLOYEE');
  await page.goto('/backoffice/customers');

  await expect(
    page.getByRole('heading', { name: 'Quản lý khách hàng', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#customer-detail')).toContainText('Khách An');
  await expect(
    page.getByText(
      'Bạn có quyền xem hồ sơ. Chỉ quản trị viên được thay đổi trạng thái khách hàng.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tạm khóa khách hàng', exact: true })).toHaveCount(
    0,
  );
  expect(probe.commands).toEqual([]);
});

function userButton(page: Page, name: string) {
  return page.locator('button[aria-controls$="-detail"]').filter({ hasText: name });
}

function waitForDetailRequest(page: Page, path: string) {
  return page.waitForRequest((request) => {
    return request.method() === 'GET' && new URL(request.url()).pathname === path;
  });
}

async function userFixture(
  page: Page,
  role: Role,
  options: Readonly<{ customerConflict?: boolean }> = {},
): Promise<UserProbe> {
  const detailRequests = new Map<string, ControlledDetailRequestFixture[]>();
  const probe: UserProbe = {
    commands: [],
    customerListReads: 0,
    detailFailures: new Set<string>(),
    detailReads: [],
    employeeListReads: 0,
    holdNextDetail: (path) => {
      const request = controlledDetailRequest();
      detailRequests.set(path, [...(detailRequests.get(path) ?? []), request]);
      return request;
    },
  };
  let employeeA = employee(EMPLOYEE_A, 'Nhân viên An', 'an.nv@example.com', 'NV-091');
  const employeeB = employee(EMPLOYEE_B, 'Nhân viên Bình', 'binh.nv@example.com', 'NV-092');
  let customerA = customer(CUSTOMER_A, 'Khách An', 'an.kh@example.com');
  const customerB = customer(CUSTOMER_B, 'Khách Bình', 'binh.kh@example.com');
  let customerConflict = options.customerConflict === true;

  await page.route('**/api/v1/auth/refresh', (route) =>
    json(route, { data: { accessToken: `fe09-${role}`, user: staff(role) } }),
  );
  await page.route('**/api/v1/backoffice/**', async (route) => {
    if (await fulfillPendingTasks(route)) return;
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (method === 'OPTIONS') return preflight(route);

    if (path === '/api/v1/backoffice/employees' && method === 'GET') {
      probe.employeeListReads += 1;
      return json(route, paged([employeeA, employeeB]));
    }
    if (path === '/api/v1/backoffice/customers' && method === 'GET') {
      probe.customerListReads += 1;
      return json(route, paged([customerA, customerB]));
    }
    if (path === `/api/v1/backoffice/employees/${EMPLOYEE_A}` && method === 'GET') {
      probe.detailReads.push(path);
      return controlledDetailResponse(route, detailRequests, path, { data: employeeA });
    }
    if (path === `/api/v1/backoffice/employees/${EMPLOYEE_B}` && method === 'GET') {
      probe.detailReads.push(path);
      return controlledDetailResponse(route, detailRequests, path, { data: employeeB });
    }
    if (path === `/api/v1/backoffice/customers/${CUSTOMER_A}` && method === 'GET') {
      probe.detailReads.push(path);
      return controlledDetailResponse(route, detailRequests, path, { data: customerA });
    }
    if (path === `/api/v1/backoffice/customers/${CUSTOMER_B}` && method === 'GET') {
      probe.detailReads.push(path);
      if (probe.detailFailures.delete(path)) {
        return controlledDetailResponse(
          route,
          detailRequests,
          path,
          errorEnvelope('SERVICE_UNAVAILABLE'),
          503,
        );
      }
      return controlledDetailResponse(route, detailRequests, path, { data: customerB });
    }

    if (method !== 'GET') {
      probe.commands.push(path);
      if (path === `/api/v1/backoffice/employees/${EMPLOYEE_A}/disable`) {
        await delay(260);
        employeeA = {
          ...employeeA,
          disabledAt: '2026-09-02T06:30:00.000Z',
          status: 'DISABLED',
          updatedAt: '2026-09-02T06:30:00.000Z',
        };
        return json(route, { data: employeeA });
      }
      if (path === `/api/v1/backoffice/customers/${CUSTOMER_A}/suspend`) {
        if (customerConflict) {
          customerConflict = false;
          customerA = {
            ...customerA,
            status: 'SUSPENDED',
            suspendedAt: '2026-09-02T06:35:00.000Z',
            updatedAt: '2026-09-02T06:35:00.000Z',
          };
          return json(route, errorEnvelope('INVALID_STATE_TRANSITION'), 409);
        }
        return json(route, { data: customerA });
      }
      return json(route, errorEnvelope('FORBIDDEN'), 403);
    }

    return json(route, errorEnvelope('RESOURCE_NOT_FOUND'), 404);
  });
  return probe;
}

function employee(id: string, fullName: string, email: string, employeeCode: string) {
  return {
    createdAt: '2026-08-01T02:00:00.000Z',
    disabledAt: null,
    email,
    emailVerifiedAt: '2026-08-01T03:00:00.000Z',
    employeeCode,
    fullName,
    hiredAt: '2026-08-01',
    id,
    invitationExpiresAt: null,
    lastLoginAt: '2026-09-01T03:00:00.000Z',
    phone: '0900000909',
    status: 'ACTIVE',
    updatedAt: '2026-09-01T03:00:00.000Z',
  };
}

function customer(id: string, fullName: string, email: string) {
  return {
    createdAt: '2026-08-02T02:00:00.000Z',
    email,
    emailVerifiedAt: '2026-08-02T03:00:00.000Z',
    fullName,
    id,
    lastLoginAt: '2026-09-01T04:00:00.000Z',
    lastOrderAt: '2026-08-31T04:00:00.000Z',
    orderCount: 2,
    phone: '0900000808',
    status: 'ACTIVE',
    suspendedAt: null,
    updatedAt: '2026-09-01T04:00:00.000Z',
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

function paged(data: unknown[]) {
  return {
    data,
    meta: {
      pagination: {
        page: 1,
        pageSize: 8,
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
      requestId: `fe09-${code}`,
    },
  };
}

interface ControlledDetailRequestFixture extends ControlledDetailRequest {
  readonly markCompleted: () => void;
  readonly markStarted: () => void;
  readonly waitForRelease: () => Promise<void>;
}

function controlledDetailRequest(): ControlledDetailRequestFixture {
  let requestState: ControlledRequestState = 'waiting';
  let releaseRequest: (() => void) | undefined;
  const released = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });

  return {
    markCompleted: () => {
      requestState = 'completed';
    },
    markStarted: () => {
      requestState = 'started';
    },
    release: () => releaseRequest?.(),
    state: () => requestState,
    waitForRelease: () => released,
  };
}

async function controlledDetailResponse(
  route: Route,
  requests: Map<string, ControlledDetailRequestFixture[]>,
  path: string,
  body: unknown,
  status = 200,
): Promise<void> {
  const queuedRequests = requests.get(path);
  const request = queuedRequests?.shift();
  if (queuedRequests?.length === 0) requests.delete(path);

  request?.markStarted();
  try {
    await request?.waitForRelease();
    await json(route, body, status);
  } finally {
    request?.markCompleted();
  }
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
      'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
      'access-control-allow-origin': 'http://localhost:3001',
    },
    status: 204,
  });
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
