import { expect, test, type Page, type Route } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';

const PRODUCT_ID = '0199c346-f8d2-79d8-b90b-e462bd717fe0';
const VARIANT_ID = '0199c346-f8d2-79d8-b90b-e462bd717fe1';
const POLICY_ID = '0199c346-f8d2-79d8-b90b-e462bd717fe3';
const VOUCHER_ID = '0199c9aa-a258-74c8-a35f-9cd11c562aa1';
const PRODUCT_NAME = 'iPhone 15 Pro FE05';
const VOUCHER_NAME = 'Ưu đãi iPhone tháng 9';

type StaffRole = 'ADMIN' | 'EMPLOYEE';
type RecordStatus = 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
type VoucherStatus = RecordStatus | 'PAUSED';

interface ApiProbe {
  catalogStatus: RecordStatus;
  pauseReason: string | null;
  productCreateBody: Record<string, unknown> | null;
  voucherCreateBody: Record<string, unknown> | null;
  voucherRequests: number;
  voucherStatus: VoucherStatus;
}

test.describe('FE-05 catalog and voucher administration', () => {
  test(bt('browser:catalog-voucher-admin', 'employee-boundary'), async ({ page }) => {
    const probe = await installFe05Api(page, 'EMPLOYEE');

    await page.goto('/backoffice/catalog/products');
    await expect(page.getByRole('heading', { level: 1, name: 'Danh mục sản phẩm' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: PRODUCT_NAME })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Danh mục', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mã ưu đãi', exact: true })).toHaveCount(0);

    await page.goto('/backoffice/catalog/products/new');
    await expect(page.getByRole('heading', { level: 1, name: 'Thêm sản phẩm' })).toBeVisible();
    await expect(page.getByLabel('Chính sách bảo hành')).toContainText('Bảo hành iPhone');

    await page.goto(`/backoffice/catalog/products/${PRODUCT_ID}`);
    await expect(page.getByRole('heading', { level: 1, name: PRODUCT_NAME })).toBeVisible();
    await expect(page.getByText('Theo từng máy', { exact: true })).toBeVisible();

    // The detail workspace runs under React Strict Mode. This conditional dialog mounts open,
    // then unmounts on Escape and must retain its original trigger through effect replay.
    const editTrigger = page.locator('header').getByRole('button', {
      name: 'Lưu thay đổi',
      exact: true,
    });
    await editTrigger.click();
    const editDialog = page.getByRole('dialog', { name: 'Chỉnh sửa thông tin' });
    await expect(editDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(editDialog).toHaveCount(0);
    await expect(editTrigger).toBeFocused();

    // Backoffice action dialogs stay mounted while their controlled `open` state changes.
    const archiveTrigger = page
      .locator('header')
      .getByRole('button', { name: 'Lưu trữ sản phẩm', exact: true });
    await archiveTrigger.click();
    const archiveDialog = page.getByRole('dialog', { name: `Lưu trữ ${PRODUCT_NAME}?` });
    await expect(archiveDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(archiveDialog).toHaveCount(0);
    await expect(archiveTrigger).toBeFocused();

    await page.goto('/backoffice/vouchers');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Không thể mở khu vực này' }),
    ).toBeVisible();
    await expect(page.getByText('Chỉ quản trị viên được quản lý mã ưu đãi.')).toBeVisible();
    expect(probe.voucherRequests).toBe(0);
    await expectSingleMainAndNoOverflow(page);
  });

  test(bt('browser:catalog-voucher-admin', 'catalog-draft-lifecycle'), async ({ page }) => {
    const probe = await installFe05Api(page, 'ADMIN');

    await page.goto('/backoffice/catalog/products');
    await expect(page.getByRole('heading', { level: 1, name: 'Danh mục sản phẩm' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mã ưu đãi', exact: true })).toBeVisible();

    await page.goto('/backoffice/catalog/products/new');
    await expect(page.getByRole('heading', { level: 1, name: 'Thêm sản phẩm' })).toBeVisible();
    await page.getByLabel('Tên sản phẩm').fill(PRODUCT_NAME);
    await page.getByRole('textbox', { name: /^Mô tả \*/ }).fill('Mẫu máy dành cho kiểm thử FE-05.');
    await page.getByLabel('Năm ra mắt').fill('2023');
    await page.getByLabel('Dung lượng RAM').selectOption('8');
    await page.getByLabel('Kích thước màn hình').fill('6.1');
    await page.getByLabel('Bộ xử lý').fill('Apple A17 Pro');
    await page.getByLabel('Chính sách bảo hành').selectOption(POLICY_ID);
    await page.getByLabel('Tiêu đề tìm kiếm').fill('iPhone 15 Pro đang có sẵn');
    await page
      .getByLabel('Mô tả tìm kiếm')
      .fill('Thông tin rõ ràng về các máy iPhone 15 Pro đang có sẵn.');
    await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();

    await page.waitForURL(`/backoffice/catalog/products/${PRODUCT_ID}`);
    await expect(page.getByRole('heading', { level: 1, name: PRODUCT_NAME })).toBeVisible();
    expect(probe.productCreateBody).toMatchObject({
      brand: 'Apple',
      name: PRODUCT_NAME,
      slug: 'iphone-15-pro-fe05',
      type: 'IPHONE',
      warrantyPolicyId: POLICY_ID,
    });

    await page.locator('header').getByRole('button', { name: 'Mở bán', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Mở bán ${PRODUCT_NAME}?` });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Mở bán sản phẩm', exact: true }).click();
    await expect(page.getByText('Sản phẩm đã được mở bán.', { exact: true })).toBeVisible();
    await expect(page.getByText('Đang bán', { exact: true }).first()).toBeVisible();
    expect(probe.catalogStatus).toBe('ACTIVE');
    await expectNaturalVietnameseMain(page);
    await expectSingleMainAndNoOverflow(page);
  });

  test(bt('browser:catalog-voucher-admin', 'voucher-lifecycle'), async ({ page }) => {
    const probe = await installFe05Api(page, 'ADMIN', { catalogStatus: 'ACTIVE' });

    await page.goto('/backoffice/vouchers');
    await expect(page.getByRole('heading', { level: 1, name: 'Mã ưu đãi' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: VOUCHER_NAME })).toBeVisible();

    await page.goto('/backoffice/vouchers/new');
    await expect(page.getByRole('heading', { level: 1, name: 'Tạo mã ưu đãi' })).toBeVisible();
    await page.getByRole('textbox', { name: /^Mã ưu đãi/ }).fill('fe05demo');
    await page.getByLabel('Tên chương trình').fill(VOUCHER_NAME);
    await page.getByLabel('Mô tả').fill('Ưu đãi dành cho sản phẩm đã chọn.');
    await page.getByLabel('Mức giảm (%)').fill('10');
    await page.getByLabel('Giảm tối đa (đ)').fill('1500000');
    await page.getByLabel('Giá trị đơn hàng tối thiểu (đ)').fill('10000000');
    await page.getByLabel('Sản phẩm cụ thể').check();
    await expect(page.getByLabel('Chọn sản phẩm áp dụng')).toBeVisible();
    await page.getByRole('checkbox', { name: new RegExp(PRODUCT_NAME) }).check();
    await page.getByLabel('Bắt đầu').fill('2026-09-01T08:00');
    await page.getByLabel('Kết thúc').fill('2026-09-30T23:00');
    await page.getByLabel('Tổng lượt sử dụng').fill('300');
    await page.getByLabel('Chỉ dành cho tài khoản').check();
    await page.getByLabel('Mỗi khách hàng').fill('1');
    await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();

    await page.waitForURL(`/backoffice/vouchers/${VOUCHER_ID}?created=1`);
    await expect(page.getByRole('heading', { level: 1, name: VOUCHER_NAME })).toBeVisible();
    expect(probe.voucherCreateBody).toMatchObject({
      code: 'FE05DEMO',
      name: VOUCHER_NAME,
      scopeConfig: { productIds: [PRODUCT_ID] },
      scopeType: 'PRODUCTS',
      visibility: 'ACCOUNT_ONLY',
    });

    await page.getByRole('button', { name: 'Mở áp dụng', exact: true }).click();
    const activateDialog = page.getByRole('dialog', { name: 'Mở áp dụng mã ưu đãi?' });
    await expect(activateDialog).toBeVisible();
    await activateDialog.getByRole('button', { name: 'Mở áp dụng', exact: true }).click();
    await expect(page.getByText('Mã ưu đãi đang được áp dụng.', { exact: true })).toBeVisible();
    await expect(page.getByText('Đang áp dụng', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
    const pauseDialog = page.getByRole('dialog', { name: 'Tạm dừng mã ưu đãi?' });
    await pauseDialog.getByLabel('Lý do tạm dừng').fill('Điều chỉnh nội dung chương trình');
    await pauseDialog.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
    await expect(page.getByText('Đã tạm dừng mã ưu đãi.', { exact: true })).toBeVisible();
    await expect(page.getByText('Tạm dừng', { exact: true }).first()).toBeVisible();
    expect(probe.pauseReason).toBe('Điều chỉnh nội dung chương trình');
    expect(probe.voucherStatus).toBe('PAUSED');
    await expectNaturalVietnameseMain(page);
    await expectSingleMainAndNoOverflow(page);
  });

  test(bt('browser:catalog-voucher-admin', 'admin-responsive'), async ({ page }) => {
    await installFe05Api(page, 'ADMIN');
    const screens = [
      { path: '/backoffice/catalog/products', heading: 'Danh mục sản phẩm' },
      { path: '/backoffice/catalog/products/new', heading: 'Thêm sản phẩm' },
      { path: `/backoffice/catalog/products/${PRODUCT_ID}`, heading: PRODUCT_NAME },
      { path: '/backoffice/vouchers', heading: 'Mã ưu đãi' },
      { path: '/backoffice/vouchers/new', heading: 'Tạo mã ưu đãi' },
      { path: `/backoffice/vouchers/${VOUCHER_ID}`, heading: VOUCHER_NAME },
    ] as const;

    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 360, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      for (const screen of screens) {
        await page.goto(screen.path);
        await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible();
        await expectNaturalVietnameseMain(page);
        await expectSingleMainAndNoOverflow(page);
      }
    }
  });
});

async function installFe05Api(
  page: Page,
  role: StaffRole,
  initial: Partial<Pick<ApiProbe, 'catalogStatus' | 'voucherStatus'>> = {},
): Promise<ApiProbe> {
  const probe: ApiProbe = {
    catalogStatus: initial.catalogStatus ?? 'DRAFT',
    pauseReason: null,
    productCreateBody: null,
    voucherCreateBody: null,
    voucherRequests: 0,
    voucherStatus: initial.voucherStatus ?? 'DRAFT',
  };

  await page.route('**/api/v1/auth/refresh', async (route) => {
    await fulfillJson(route, {
      data: {
        accessToken: `fe05-${role.toLowerCase()}-access`,
        user: staffUser(role),
      },
    });
  });

  await page.route('**/api/v1/backoffice/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillPreflight(route);
      return;
    }
    const url = new URL(route.request().url());
    const { pathname } = url;
    const method = route.request().method();

    if (pathname.endsWith('/backoffice/warranty-policies') && method === 'GET') {
      await fulfillJson(route, warrantyPolicyPage());
      return;
    }

    if (pathname.endsWith('/backoffice/products') && method === 'GET') {
      const requestedStatus = url.searchParams.get('status');
      const matches = requestedStatus === null || requestedStatus === probe.catalogStatus;
      const product = catalogProduct(probe.catalogStatus);
      await fulfillJson(
        route,
        paged(matches ? [product] : [], Number(url.searchParams.get('pageSize')) || 12),
      );
      return;
    }

    if (pathname.endsWith('/backoffice/products') && method === 'POST') {
      probe.productCreateBody = requestJson(route);
      probe.catalogStatus = 'DRAFT';
      await fulfillJson(route, { data: catalogProduct(probe.catalogStatus) }, 201);
      return;
    }

    if (pathname.endsWith(`/backoffice/products/${PRODUCT_ID}/publish`) && method === 'POST') {
      probe.catalogStatus = 'ACTIVE';
      await fulfillJson(route, { data: catalogProduct(probe.catalogStatus) });
      return;
    }

    if (pathname.endsWith(`/backoffice/products/${PRODUCT_ID}`) && method === 'GET') {
      await fulfillJson(route, { data: catalogProduct(probe.catalogStatus) });
      return;
    }

    if (pathname.includes('/backoffice/vouchers')) probe.voucherRequests += 1;

    if (pathname.endsWith('/backoffice/vouchers') && method === 'GET') {
      const requestedStatus = url.searchParams.get('status');
      const matches = requestedStatus === null || requestedStatus === probe.voucherStatus;
      await fulfillJson(
        route,
        paged(
          matches ? [voucher(probe.voucherStatus)] : [],
          Number(url.searchParams.get('pageSize')) || 12,
        ),
      );
      return;
    }

    if (pathname.endsWith('/backoffice/vouchers') && method === 'POST') {
      probe.voucherCreateBody = requestJson(route);
      probe.voucherStatus = 'DRAFT';
      await fulfillJson(route, { data: voucher(probe.voucherStatus) }, 201);
      return;
    }

    if (pathname.endsWith(`/backoffice/vouchers/${VOUCHER_ID}/usages`) && method === 'GET') {
      await fulfillJson(route, voucherUsagePage());
      return;
    }

    if (pathname.endsWith(`/backoffice/vouchers/${VOUCHER_ID}/activate`) && method === 'POST') {
      probe.voucherStatus = 'ACTIVE';
      await fulfillJson(route, { data: voucher(probe.voucherStatus) });
      return;
    }

    if (pathname.endsWith(`/backoffice/vouchers/${VOUCHER_ID}/pause`) && method === 'POST') {
      probe.pauseReason = stringField(requestJson(route), 'reason');
      probe.voucherStatus = 'PAUSED';
      await fulfillJson(route, { data: voucher(probe.voucherStatus) });
      return;
    }

    if (pathname.endsWith(`/backoffice/vouchers/${VOUCHER_ID}`) && method === 'GET') {
      await fulfillJson(route, { data: voucher(probe.voucherStatus) });
      return;
    }

    await fulfillJson(
      route,
      { error: { code: 'RESOURCE_NOT_FOUND', message: 'Browser fixture route not found' } },
      404,
    );
  });

  return probe;
}

function staffUser(role: StaffRole) {
  return {
    id:
      role === 'ADMIN'
        ? '0199c346-f8d2-79d8-b90b-e462bd717fa0'
        : '0199c346-f8d2-79d8-b90b-e462bd717fa1',
    email: `${role.toLowerCase()}-fe05@rephone.local`,
    fullName: role === 'ADMIN' ? 'Quản trị viên FE05' : 'Nhân viên FE05',
    phone: '0900000505',
    role,
    status: 'ACTIVE',
  } as const;
}

function catalogProduct(status: RecordStatus) {
  const variant = {
    id: VARIANT_ID,
    productId: PRODUCT_ID,
    sku: 'IP15P-128-BLK-FE05',
    displayName: '128 GB · Đen',
    storageCapacityGb: 128,
    colorName: 'Đen',
    colorHex: '#111111',
    inventoryMode: 'SERIALIZED',
    salePrice: null,
    compareAtPrice: null,
    accessoryAttributes: null,
    warrantyPolicyId: POLICY_ID,
    status: 'ACTIVE',
    media: [],
    createdAt: '2026-08-28T01:00:00.000Z',
    updatedAt: '2026-08-28T02:00:00.000Z',
  };
  return {
    id: PRODUCT_ID,
    type: 'IPHONE',
    brand: 'Apple',
    name: PRODUCT_NAME,
    slug: 'iphone-15-pro-fe05',
    status,
    releaseYear: 2023,
    variantCount: 1,
    primaryMedia: null,
    createdAt: '2026-08-28T01:00:00.000Z',
    updatedAt: '2026-08-28T02:00:00.000Z',
    description: 'Mẫu máy dành cho kiểm thử FE-05.',
    chipset: 'Apple A17 Pro',
    ramGb: 8,
    screenSizeInches: '6.1',
    warrantyPolicyId: POLICY_ID,
    seoTitle: 'iPhone 15 Pro đang có sẵn',
    seoDescription: 'Thông tin rõ ràng về các máy iPhone 15 Pro đang có sẵn.',
    archivedAt: status === 'ARCHIVED' ? '2026-08-28T03:00:00.000Z' : null,
    variants: [variant],
    media: [],
  };
}

function warrantyPolicyPage() {
  return paged(
    [
      {
        id: POLICY_ID,
        code: 'IPHONE-90',
        name: 'Bảo hành iPhone',
        defaultDays: 90,
        terms: 'Bảo hành phần cứng trong 90 ngày.',
        status: 'ACTIVE',
        isArchived: false,
        archivedAt: null,
        createdAt: '2026-08-28T01:00:00.000Z',
        updatedAt: '2026-08-28T01:00:00.000Z',
      },
    ],
    100,
  );
}

function voucher(status: VoucherStatus) {
  return {
    id: VOUCHER_ID,
    code: 'FE05DEMO',
    name: VOUCHER_NAME,
    description: 'Ưu đãi dành cho sản phẩm đã chọn.',
    discountType: 'PERCENT',
    discountValue: '10',
    maxDiscountAmount: '1500000',
    minimumOrderAmount: '10000000',
    startsAt: '2026-09-01T01:00:00.000Z',
    endsAt: '2026-09-30T16:00:00.000Z',
    totalUsageLimit: 300,
    perCustomerLimit: 1,
    visibility: 'ACCOUNT_ONLY',
    scopeType: 'PRODUCTS',
    scopeConfig: { productIds: [PRODUCT_ID] },
    status,
    usageCounts: { reserved: 1, consumed: 12, released: 2 },
    createdAt: '2026-08-28T01:00:00.000Z',
    updatedAt: '2026-08-28T02:00:00.000Z',
  };
}

function voucherUsagePage() {
  return paged(
    [
      {
        id: '0199c9aa-a258-74c8-a35f-9cd11c562aa2',
        orderId: '0199c9aa-a258-74c8-a35f-9cd11c562aa3',
        orderNumber: 'RPH-20260828-FE050001',
        customerId: '0199c9aa-a258-74c8-a35f-9cd11c562aa4',
        customer: { name: 'Nguyễn Hoàng Nam', email: 'nam@example.com' },
        status: 'CONSUMED',
        createdAt: '2026-08-28T07:32:00.000Z',
        consumedAt: '2026-08-28T07:33:00.000Z',
        releasedAt: null,
      },
    ],
    10,
  );
}

function paged(data: readonly unknown[], pageSize: number) {
  return {
    data,
    meta: {
      pagination: {
        page: 1,
        pageSize,
        totalItems: data.length,
        totalPages: data.length === 0 ? 0 : 1,
      },
    },
  };
}

function requestJson(route: Route): Record<string, unknown> {
  const value: unknown = route.request().postDataJSON();
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === 'string' ? value[key] : null;
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
    'Access-Control-Allow-Headers': 'authorization, content-type, x-csrf-token',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
}

async function expectNaturalVietnameseMain(page: Page): Promise<void> {
  const mainText = await page.locator('main').innerText();
  expect(mainText).not.toMatch(
    /\b(?:DRAFT|ACTIVE|PAUSED|ARCHIVED|scopeConfig|localStorage)\b|access token|refresh session|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
}

async function expectSingleMainAndNoOverflow(page: Page): Promise<void> {
  await expect(page.locator('main')).toHaveCount(1);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}
