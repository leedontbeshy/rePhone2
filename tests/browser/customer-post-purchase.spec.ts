import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';

const ORDER_NUMBER = 'RPH-20260828-POST0001';
const ORDER_ITEM_ID = '0199b354-d818-7f7c-b966-3932599978d0';
const WARRANTY_CODE = 'RPH-W-20260828-POST0001';
const REQUEST_NUMBER = 'RPH-AS-20260828-POST01';
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
  attachments: [],
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
    await page.getByRole('combobox', { name: /^Trạng thái/ }).selectOption('');
    await expect(page).toHaveURL('/orders');

    await page.goto(`/orders/${ORDER_NUMBER}`);
    await expect(page.getByRole('heading', { level: 1, name: ORDER_NUMBER })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Tiến độ đơn hàng' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Xem bảo hành' })).toBeVisible();
    await page.getByRole('button', { name: 'Hủy đơn hàng' }).click();
    const dialog = page.getByRole('dialog', { name: 'Hủy đơn hàng?' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Lý do hủy').fill('Tôi không còn nhu cầu mua sản phẩm này');
    await dialog.getByRole('button', { name: 'Quay lại' }).click();
    await expect(dialog).toHaveCount(0);

    await expectSingleMainAndNoOverflow(page);
    await expectAccessible(page);
  });

  test(bt('browser:customer-post-purchase', 'guest-order-privacy'), async ({ page }) => {
    let detailRequests = 0;
    let guestHeader: string | undefined;
    await page.route(`**/api/v1/orders/${ORDER_NUMBER}`, async (route) => {
      detailRequests += 1;
      guestHeader = route.request().headers()['x-guest-order-token'];
      await fulfillJson(route, { error: { code: 'ORDER_NOT_FOUND', message: 'not found' } }, 404);
    });
    await page.route('**/api/v1/auth/refresh', async (route) => {
      await fulfillJson(route, { error: { code: 'AUTH_REQUIRED', message: 'anonymous' } }, 401);
    });

    await page.goto(`/orders/${ORDER_NUMBER}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Chi tiết đơn hàng' })).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Không mở được đơn hàng' }),
    ).toBeVisible();
    expect(detailRequests).toBe(1);
    expect(guestHeader).toBeUndefined();
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

    await page.goto('/after-sales');
    await page.getByRole('link', { name: 'Chọn sản phẩm từ đơn hàng' }).click();
    await expect(page).toHaveURL('/after-sales/new');
    await page.getByLabel('Đơn hàng đã hoàn tất').selectOption(ORDER_NUMBER);
    await page.getByText('Chọn sản phẩm', { exact: true }).click();
    await expect(page).toHaveURL(
      `/after-sales/new?orderNumber=${ORDER_NUMBER}&orderItemId=${ORDER_ITEM_ID}`,
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Tạo yêu cầu hỗ trợ' })).toBeVisible();
    await expect(page.getByText(`Đơn hàng ${ORDER_NUMBER}`, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gửi yêu cầu hỗ trợ' })).toBeVisible();
    await expectSingleMainAndNoOverflow(page);
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

    await page.goto('/after-sales');
    await expect(page.getByRole('heading', { level: 1, name: 'Hỗ trợ sau mua' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Chọn sản phẩm từ đơn hàng' })).toBeVisible();
    await expectSingleMainAndNoOverflow(page);
  });
});

async function installCustomerApi(page: Page): Promise<void> {
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
      await fulfillJson(route, {
        data: { ...orderDetail, status: 'CANCELLED', availableActions: [] },
      });
      return;
    }
    if (url.pathname.endsWith(`/${ORDER_NUMBER}`)) {
      await fulfillJson(route, {
        data: page.url().includes('/after-sales/new') ? completedOrderDetail : orderDetail,
      });
      return;
    }
    const listedOrder =
      url.searchParams.get('status') === 'COMPLETED' ? completedOrderDetail : orderDetail;
    await fulfillJson(route, {
      data: [
        {
          ...listedOrder,
          firstItemName: 'iPhone 15',
          totalItemQuantity: 1,
          grandTotal: listedOrder.pricing.grandTotal,
        },
      ],
      meta: { pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 } },
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
