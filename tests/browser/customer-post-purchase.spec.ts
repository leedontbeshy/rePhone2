import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';
import { orderTokenStorageKey } from '../../apps/web/lib/order-access';

const ORDER_NUMBER = 'RPH-20260828-POST0001';
const CANCELLED_ORDER_NUMBER = 'RPH-20260827-POST0002';
const CONFIRMED_ORDER_NUMBER = 'RPH-20260826-POST0003';
const ORDER_ITEM_ID = '0199b354-d818-7f7c-b966-3932599978d0';
const WARRANTY_CODE = 'RPH-W-20260828-POST0001';
const REQUEST_NUMBER = 'RPH-AS-20260828-POST01';
const ATTACHMENT_ID = '0199b354-d818-7f7c-b966-3932599978ef';
const ACTIVE_PAYMENT_EXPIRES_AT = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();

const customer = {
  id: '0199b354-d818-7f7c-b966-3932599978aa',
  email: 'customer-post-purchase@rephone.local',
  fullName: 'Khách hàng Sau mua',
  phone: '0900000404',
  role: 'CUSTOMER',
  status: 'ACTIVE',
} as const;

const orderItem = {
  id: ORDER_ITEM_ID,
  sku: 'IP15-128-BLK',
  productName: 'iPhone 15',
  productType: 'IPHONE',
  variantName: '128GB · Đen',
  inventoryCode: 'IP15-128-POST-001',
  quantity: 1,
  unitPrice: '15000000',
  lineSubtotal: '15000000',
  discountAmount: '0',
  lineTotal: '15000000',
  warrantyDays: 90,
  warrantyTerms: 'Bảo hành phần cứng trong 90 ngày.',
  warranty: {
    warrantyCode: WARRANTY_CODE,
    status: 'ACTIVE',
    startAt: '2026-08-01T00:00:00.000Z',
    endAt: '2099-10-30T00:00:00.000Z',
    isValid: true,
    isExpired: false,
  },
};

const paymentAttempt = {
  id: '5ce2cbde-68b8-44cf-b979-125415f2fb76',
  orderNumber: ORDER_NUMBER,
  purpose: 'DEPOSIT',
  method: 'BANK_TRANSFER',
  status: 'AWAITING_PROOF',
  expectedAmount: '1500000',
  receivedAmount: null,
  transferContent: 'RPH20260828POST0001',
  bankTransferInstructions: {
    bankName: 'DEMO BANK',
    accountNumber: '0000000000',
    accountHolder: 'REPHONE DEMO',
    qrUrl: null,
    transferContent: 'RPH20260828POST0001',
  },
  expiresAt: ACTIVE_PAYMENT_EXPIRES_AT,
  submittedAt: null,
  reviewSlaDueAt: null,
  reviewOverdue: false,
  rejectionReason: null,
};

const orderDetail = {
  id: '0199b354-d818-7f7c-b966-3932599978bb',
  orderNumber: ORDER_NUMBER,
  status: 'PLACED',
  fulfillmentType: 'PICKUP',
  fulfillmentStatus: 'PENDING',
  paymentStatus: 'UNPAID',
  contact: customer,
  items: [orderItem],
  paymentAttempts: [paymentAttempt],
  refunds: [],
  pickupStore: { code: 'HCM-01', name: 'rePhone Hồ Chí Minh' },
  shipment: null,
  pricing: {
    subtotal: '15000000',
    itemDiscountAmount: '0',
    voucherDiscountAmount: '0',
    shippingFee: '0',
    grandTotal: '15000000',
    depositRequired: '1500000',
    paidAmount: '0',
    refundedAmount: '0',
    balanceDue: '15000000',
  },
  placedAt: '2026-08-28T01:00:00.000Z',
  availableActions: ['CANCEL', 'SUBMIT_PAYMENT_PROOF'],
};

const completedOrderDetail = {
  ...orderDetail,
  status: 'COMPLETED',
  fulfillmentStatus: 'COMPLETED',
  paymentStatus: 'PAID',
  confirmedAt: '2026-08-28T01:30:00.000Z',
  pickupReadyAt: '2026-08-28T02:00:00.000Z',
  pickedUpAt: '2026-08-28T03:00:00.000Z',
  completedAt: '2026-08-28T03:05:00.000Z',
  availableActions: [],
};

const cancelledOrderDetail = {
  ...orderDetail,
  status: 'CANCELLED',
  availableActions: [],
  cancelReason: 'Tôi không còn nhu cầu mua sản phẩm này',
  cancelledAt: '2026-08-28T01:05:00.000Z',
} as const;

const warranty = {
  warrantyCode: WARRANTY_CODE,
  orderNumber: ORDER_NUMBER,
  orderItemId: ORDER_ITEM_ID,
  productName: 'iPhone 15',
  variantName: '128GB · Đen',
  inventoryCode: 'IP15-128-POST-001',
  daysSnapshot: 90,
  status: 'ACTIVE',
  startAt: '2026-08-01T00:00:00.000Z',
  endAt: '2099-10-30T00:00:00.000Z',
  isValid: true,
  isExpired: false,
};

const afterSales = {
  requestNumber: REQUEST_NUMBER,
  type: 'WARRANTY',
  status: 'REQUESTED',
  issueDescription: 'Màn hình xuất hiện sọc khi sử dụng trong thời gian dài.',
  requestedResolution: 'Kiểm tra giúp tôi.',
  requestedAt: '2026-08-28T02:00:00.000Z',
  updatedAt: '2026-08-28T02:00:00.000Z',
  orderItem: {
    id: ORDER_ITEM_ID,
    orderNumber: ORDER_NUMBER,
    productName: 'iPhone 15',
    variantName: '128GB · Đen',
    inventoryCode: 'IP15-128-POST-001',
    quantity: 1,
  },
  warranty: { ...warranty, maskedIdentifierSuffix: '1234' },
  attachments: [
    {
      id: ATTACHMENT_ID,
      mimeType: 'image/jpeg',
      fileSize: 3456,
      uploadedAt: '2026-08-28T02:05:00.000Z',
    },
  ],
  timeline: { requestedAt: '2026-08-28T02:00:00.000Z' },
  availableActions: ['UPLOAD_ATTACHMENT', 'CANCEL'],
};

test.describe('FE-04 customer post-purchase', () => {
  test.beforeEach(async ({ page }) => {
    await installCustomerApi(page);
  });

  test(bt('browser:customer-post-purchase', 'customer-order-lifecycle'), async ({ page }) => {
    await page.goto('/orders?status=PROCESSING&page=2&token=must-not-survive');
    await expect(page.getByRole('heading', { level: 1, name: 'Đơn hàng của bạn' })).toBeVisible();
    const orderList = page.getByRole('region', { name: 'Danh sách đơn hàng' });
    await expect(orderList.getByText('iPhone 15', { exact: true })).toBeVisible();

    let releaseList: (() => void) | undefined;
    let markListStarted: (() => void) | undefined;
    const listStarted = new Promise<void>((resolve) => {
      markListStarted = resolve;
    });
    const listRelease = new Promise<void>((resolve) => {
      releaseList = resolve;
    });
    await page.route('**/api/v1/orders**', async (route) => {
      const url = new URL(route.request().url());
      if (
        route.request().method() !== 'GET' ||
        url.pathname !== '/api/v1/orders' ||
        url.searchParams.has('status')
      ) {
        await route.fallback();
        return;
      }
      markListStarted?.();
      await listRelease;
      await fulfillJson(route, {
        data: [
          {
            ...orderDetail,
            firstItemName: 'iPhone 15',
            totalItemQuantity: 1,
            grandTotal: orderDetail.pricing.grandTotal,
          },
        ],
        meta: { pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 } },
      });
    });
    const orderFilter = page.getByRole('combobox', { name: /^Trạng thái/ });
    await orderFilter.selectOption('');
    await listStarted;
    await expect(orderFilter).toBeVisible();
    await expect(orderList.getByText('iPhone 15', { exact: true })).toBeVisible();
    await expect(orderList).toHaveAttribute('aria-busy', 'true');
    releaseList?.();
    await expect(page).toHaveURL('/orders');
    await expect(orderList).not.toHaveAttribute('aria-busy', 'true');

    await page.goto(`/orders/${ORDER_NUMBER}`);
    await expect(page.getByRole('heading', { level: 1, name: ORDER_NUMBER })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Tiến độ đơn hàng' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Xem bảo hành' })).toBeVisible();
    await page.getByRole('button', { name: 'Hủy đơn hàng' }).click();
    const dialog = page.getByRole('dialog', { name: 'Hủy đơn hàng?' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Lý do hủy').fill('Tôi không còn nhu cầu mua sản phẩm này');
    await dialog.getByRole('button', { name: 'Xác nhận hủy đơn' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Đơn hàng đã được hủy.')).toBeVisible();
    await expect(page.getByText('Đã hủy', { exact: true }).first()).toBeVisible();

    await expectSingleMainAndNoOverflow(page);
    await expectAccessible(page);
  });

  test(bt('browser:customer-post-purchase', 'guest-order-privacy'), async ({ page }) => {
    let detailRequests = 0;
    let guestHeader: string | undefined;
    let warrantyRequests = 0;
    let afterSalesRequests = 0;
    await page.route(`**/api/v1/orders/${ORDER_NUMBER}`, async (route) => {
      detailRequests += 1;
      guestHeader = route.request().headers()['x-guest-order-token'];
      await fulfillJson(route, { error: { code: 'ORDER_NOT_FOUND', message: 'not found' } }, 404);
    });
    await page.route('**/api/v1/auth/refresh', async (route) => {
      await fulfillJson(route, { error: { code: 'AUTH_REQUIRED', message: 'anonymous' } }, 401);
    });
    await page.route(`**/api/v1/warranties/${WARRANTY_CODE}`, async (route) => {
      warrantyRequests += 1;
      await fulfillJson(
        route,
        { error: { code: 'RESOURCE_NOT_FOUND', message: 'not found' } },
        404,
      );
    });
    await page.route(`**/api/v1/after-sales/${REQUEST_NUMBER}`, async (route) => {
      afterSalesRequests += 1;
      await fulfillJson(
        route,
        { error: { code: 'RESOURCE_NOT_FOUND', message: 'not found' } },
        404,
      );
    });

    await page.goto(`/orders/${ORDER_NUMBER}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Chi tiết đơn hàng' })).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Không mở được đơn hàng' }),
    ).toBeVisible();
    expect(detailRequests).toBe(1);
    expect(guestHeader).toBeUndefined();

    const guestToken = 'G'.repeat(43);
    await page.evaluate(
      ({ key, token }) => {
        sessionStorage.setItem(key, token);
      },
      { key: orderTokenStorageKey(ORDER_NUMBER), token: guestToken },
    );
    await page.goto(`/warranties/${WARRANTY_CODE}?orderNumber=${ORDER_NUMBER}`);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Không mở được thông tin này' }),
    ).toBeVisible();
    expect(warrantyRequests).toBe(1);
    await expect
      .poll(() =>
        page.evaluate((key) => sessionStorage.getItem(key), orderTokenStorageKey(ORDER_NUMBER)),
      )
      .toBe(guestToken);

    await page.goto(`/after-sales/${REQUEST_NUMBER}?orderNumber=${ORDER_NUMBER}`);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Không mở được thông tin này' }),
    ).toBeVisible();
    expect(afterSalesRequests).toBe(1);
    await expect(page.locator('body')).not.toContainText('Màn hình xuất hiện sọc');
    expect(page.url()).not.toContain('token=');
    expect(new URL(page.url()).hash).toBe('');
  });

  test(bt('browser:customer-post-purchase', 'warranty-list-detail'), async ({ page }) => {
    await page.goto('/warranties');
    await expect(page.getByRole('heading', { level: 1, name: 'Bảo hành của bạn' })).toBeVisible();
    await expect(page.getByText('iPhone 15', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Xem chi tiết' }).click();
    await expect(page).toHaveURL(new RegExp(`/warranties/${WARRANTY_CODE}`));
    await expect(page.getByRole('heading', { level: 1, name: 'iPhone 15' })).toBeVisible();
    await expect(page.getByText('Bảo hành phần cứng trong 90 ngày.')).toBeVisible();
    await expectSingleMainAndNoOverflow(page);
    await expectAccessible(page);
  });

  test(bt('browser:customer-post-purchase', 'after-sales-journey'), async ({ page }) => {
    await page.goto('/after-sales?type=WARRANTY&unknown=drop-me');
    await expect(page.getByRole('heading', { level: 1, name: 'Hỗ trợ sau mua' })).toBeVisible();
    await expect(page.getByText(REQUEST_NUMBER, { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Chọn sản phẩm từ đơn hàng' })).toHaveAttribute(
      'href',
      '/after-sales/new',
    );
    await page.getByLabel('Loại yêu cầu').selectOption('');
    await expect(page).toHaveURL('/after-sales');
    await page.getByRole('link', { name: 'Xem tiến độ' }).click();
    await expect(
      page.getByText('Màn hình xuất hiện sọc khi sử dụng trong thời gian dài.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hủy yêu cầu' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Danh sách hỗ trợ' })).toBeVisible();

    await page.route(
      `**/api/v1/after-sales/${REQUEST_NUMBER}/attachments/${ATTACHMENT_ID}/url`,
      async (route) => {
        await fulfillJson(
          route,
          { error: { code: 'STORAGE_UNAVAILABLE', message: 'private provider detail' } },
          503,
        );
      },
    );
    page.once('popup', (popup) => {
      void popup.close();
    });
    await page.getByRole('button', { name: 'Mở tệp' }).click();
    await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible();

    await page.route(`**/api/v1/after-sales/${REQUEST_NUMBER}/attachments`, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      await fulfillJson(
        route,
        { error: { code: 'STORAGE_UNAVAILABLE', message: 'private provider detail' } },
        503,
      );
    });
    await page.locator('#after-sales-attachment').setInputFiles({
      name: 'man-hinh-loi.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('safe-image-bytes'),
    });
    await page.getByRole('button', { name: 'Thêm tệp' }).click();
    await expect(page.getByText('Hiện chưa thể lưu tệp. Vui lòng thử lại sau.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thử lại' })).toHaveCount(0);

    await page.goto(
      `/after-sales/new?orderNumber=${CANCELLED_ORDER_NUMBER}&orderItemId=${ORDER_ITEM_ID}`,
    );
    await expect(
      page.getByText('Chỉ có thể gửi yêu cầu hỗ trợ cho đơn hàng đã hoàn tất.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gửi yêu cầu hỗ trợ' })).toHaveCount(0);

    await page.goto('/after-sales');
    await page.getByRole('link', { name: 'Chọn sản phẩm từ đơn hàng' }).click();
    await expect(page).toHaveURL('/after-sales/new');
    const completedOrderSelect = page.getByLabel('Đơn hàng đã hoàn tất');
    await expect(
      completedOrderSelect.locator('option').filter({ hasText: ORDER_NUMBER }),
    ).toHaveCount(1);
    const orderOptions = await completedOrderSelect.locator('option').allTextContents();
    expect(orderOptions.join(' ')).toContain(ORDER_NUMBER);
    expect(orderOptions.join(' ')).not.toContain(CANCELLED_ORDER_NUMBER);
    expect(orderOptions.join(' ')).not.toContain(CONFIRMED_ORDER_NUMBER);
    await completedOrderSelect.selectOption(ORDER_NUMBER);
    await page.getByText('Chọn sản phẩm', { exact: true }).click();
    await expect(page).toHaveURL(
      `/after-sales/new?orderNumber=${ORDER_NUMBER}&orderItemId=${ORDER_ITEM_ID}`,
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Tạo yêu cầu hỗ trợ' })).toBeVisible();
    await expect(page.getByText(`Đơn hàng ${ORDER_NUMBER}`, { exact: true })).toBeVisible();
    const issue = page.getByLabel('Sản phẩm đang gặp vấn đề gì?');
    await page
      .locator('form')
      .filter({ has: issue })
      .evaluate((form: HTMLFormElement) => {
        form.requestSubmit();
      });
    await expect(issue).toBeFocused();
    await expect(issue).toHaveAttribute('aria-invalid', 'true');
    await issue.fill('Màn hình chớp tắt liên tục khi sử dụng.');

    let createRequests = 0;
    let markStarted: (() => void) | undefined;
    let releaseCreate: (() => void) | undefined;
    const createStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const createRelease = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    await page.route('**/api/v1/after-sales', async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() !== 'POST' || url.pathname !== '/api/v1/after-sales') {
        await route.fallback();
        return;
      }
      createRequests += 1;
      markStarted?.();
      await createRelease;
      await fulfillJson(route, { data: afterSales }, 201);
    });
    const createForm = page.locator('form').filter({ has: issue });
    await createForm.evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await createStarted;
    await expect(page.getByRole('button', { name: 'Đang gửi yêu cầu' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(createRequests).toBe(1);
    releaseCreate?.();
    await expect(page).toHaveURL(`/after-sales/${REQUEST_NUMBER}?orderNumber=${ORDER_NUMBER}`);
    await expect(page.getByText(REQUEST_NUMBER, { exact: true })).toBeVisible();
    await expectSingleMainAndNoOverflow(page);
    await expectAccessible(page);
  });

  test(bt('browser:customer-post-purchase', 'post-purchase-mobile'), async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/orders');
    await expect(page.getByRole('heading', { level: 1, name: 'Đơn hàng của bạn' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Xem chi tiết' }).first()).toBeVisible();
    await expectSingleMainAndNoOverflow(page);

    await page.goto(`/orders/${ORDER_NUMBER}`);
    await expect(page.getByText('Minh chứng thanh toán', { exact: true })).toBeVisible();
    await expect(page.getByText('Chưa chọn tệp', { exact: true })).toBeVisible();
    await expectSingleMainAndNoOverflow(page);
    await expectAccessible(page);

    await page.goto('/warranties');
    await expect(page.getByRole('heading', { level: 1, name: 'Bảo hành của bạn' })).toBeVisible();
    await expectSingleMainAndNoOverflow(page);

    await page.goto(`/warranties/${WARRANTY_CODE}`);
    await expect(page.getByRole('heading', { level: 1, name: 'iPhone 15' })).toBeVisible();
    await expectSingleMainAndNoOverflow(page);
    await expectAccessible(page);

    await page.goto('/after-sales');
    await expect(page.getByRole('heading', { level: 1, name: 'Hỗ trợ sau mua' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Chọn sản phẩm từ đơn hàng' })).toBeVisible();
    await expectSingleMainAndNoOverflow(page);

    await page.goto(`/after-sales/new?orderNumber=${ORDER_NUMBER}&orderItemId=${ORDER_ITEM_ID}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Tạo yêu cầu hỗ trợ' })).toBeVisible();
    await expectSingleMainAndNoOverflow(page);
    await expectAccessible(page);

    await page.goto(`/after-sales/${REQUEST_NUMBER}?orderNumber=${ORDER_NUMBER}`);
    await expect(page.getByText(REQUEST_NUMBER, { exact: true })).toBeVisible();
    await expectSingleMainAndNoOverflow(page);
    await expectAccessible(page);
  });
});

async function installCustomerApi(page: Page): Promise<void> {
  let currentOrderDetail: typeof orderDetail | typeof cancelledOrderDetail = orderDetail;
  await page.route('**/api/v1/auth/refresh', async (route) => {
    await fulfillJson(route, { data: { accessToken: 'browser-access-token', user: customer } });
  });
  await page.route('**/api/v1/cart**', async (route) => {
    await fulfillJson(route, {
      data: {
        estimatedSubtotal: '0',
        items: [],
        status: 'ACTIVE',
        warnings: [],
      },
    });
  });
  await page.route('**/api/v1/orders**', async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST') {
      currentOrderDetail = cancelledOrderDetail;
      await fulfillJson(route, {
        data: currentOrderDetail,
      });
      return;
    }
    if (url.pathname.endsWith(`/${CANCELLED_ORDER_NUMBER}`)) {
      await fulfillJson(route, {
        data: {
          ...orderDetail,
          orderNumber: CANCELLED_ORDER_NUMBER,
          status: 'CANCELLED',
          completedAt: null,
          availableActions: [],
        },
      });
      return;
    }
    if (url.pathname.endsWith(`/${CONFIRMED_ORDER_NUMBER}`)) {
      await fulfillJson(route, {
        data: {
          ...orderDetail,
          orderNumber: CONFIRMED_ORDER_NUMBER,
          status: 'CONFIRMED',
          completedAt: null,
          availableActions: [],
        },
      });
      return;
    }
    if (url.pathname.endsWith(`/${ORDER_NUMBER}`)) {
      await fulfillJson(route, {
        data: page.url().includes('/after-sales/new') ? completedOrderDetail : currentOrderDetail,
      });
      return;
    }
    const listedOrder =
      url.searchParams.get('status') === 'COMPLETED' ? completedOrderDetail : currentOrderDetail;
    await fulfillJson(route, {
      data: [
        {
          ...listedOrder,
          firstItemName: 'iPhone 15',
          totalItemQuantity: 1,
          grandTotal: listedOrder.pricing.grandTotal,
        },
        ...(url.searchParams.get('status') === 'COMPLETED'
          ? [
              {
                ...listedOrder,
                orderNumber: CANCELLED_ORDER_NUMBER,
                status: 'CANCELLED',
                firstItemName: 'iPhone 14',
                totalItemQuantity: 1,
                grandTotal: listedOrder.pricing.grandTotal,
              },
              {
                ...listedOrder,
                orderNumber: CONFIRMED_ORDER_NUMBER,
                status: 'CONFIRMED',
                firstItemName: 'iPhone 13',
                totalItemQuantity: 1,
                grandTotal: listedOrder.pricing.grandTotal,
              },
            ]
          : []),
      ],
      meta: { pagination: { page: 1, pageSize: 20, totalItems: 3, totalPages: 1 } },
    });
  });
  await page.route('**/api/v1/warranties**', async (route) => {
    const url = new URL(route.request().url());
    await fulfillJson(
      route,
      url.pathname.endsWith(`/${WARRANTY_CODE}`)
        ? {
            data: {
              ...warranty,
              sku: 'IP15-128-BLK',
              termsSnapshot: 'Bảo hành phần cứng trong 90 ngày.',
              maskedIdentifierSuffix: '1234',
            },
          }
        : {
            data: [warranty],
            meta: { pagination: { page: 1, pageSize: 12, totalItems: 1, totalPages: 1 } },
          },
    );
  });
  await page.route('**/api/v1/after-sales**', async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST') {
      await fulfillJson(route, { data: afterSales }, 201);
      return;
    }
    await fulfillJson(
      route,
      url.pathname.endsWith(`/${REQUEST_NUMBER}`)
        ? { data: afterSales }
        : {
            data: [afterSales],
            meta: { pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 } },
          },
    );
  });
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  const origin = route.request().headers()['origin'];
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      ...(origin
        ? {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Credentials': 'true',
          }
        : {}),
    },
    body: JSON.stringify(body),
  });
}

async function expectSingleMainAndNoOverflow(page: Page): Promise<void> {
  await expect(page.locator('main')).toHaveCount(1);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectAccessible(page: Page): Promise<void> {
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
        nodes: nodes.map(({ target, html, failureSummary }) => ({
          target,
          html,
          failureSummary,
        })),
      })),
  ).toEqual([]);
}
