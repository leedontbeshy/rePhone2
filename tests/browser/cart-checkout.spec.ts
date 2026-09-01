import { expect, test, type Page } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';

const CUSTOMER = {
  email: 'customer@rephone.local',
  password: 'CustomerDemo123',
} as const;
const GUEST_UNIT = {
  code: 'IP14P-128-001',
  path: '/products/iphone-14-pro/units/IP14P-128-001',
} as const;
const CUSTOMER_UNIT = {
  code: 'IP14P-128-001',
  path: '/products/iphone-14-pro/units/IP14P-128-001',
} as const;

test.describe('FE-03 cart, wishlist and checkout', () => {
  test(bt('browser:cart-checkout', 'guest-shipping-order'), async ({ page }) => {
    await addUnitToCart(page, GUEST_UNIT);
    await page.goto('/cart');

    await expect(page.getByRole('heading', { name: 'Kiểm tra sản phẩm đã chọn' })).toBeVisible();
    await expect(page.getByText(`Mã máy: ${GUEST_UNIT.code}`, { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Tiếp tục đặt hàng', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Hoàn tất đơn hàng' })).toBeVisible();
    await expect(page.getByLabel('Giao tận nơi')).toBeChecked();
    await fillContact(page, 'Khách vãng lai FE-03', 'guest-fe03@rephone.local');
    await page.locator('#checkout-receiverName').fill('Khách nhận FE-03');
    await page.locator('#checkout-receiverPhone').fill('0900000303');
    await page.locator('#checkout-addressLine').fill('27 Đường Kiểm Thử');
    await page.locator('#checkout-ward').fill('Phường Demo');
    await page.locator('#checkout-district').fill('Quận Demo');
    await page.locator('#checkout-province').fill('TP. Hồ Chí Minh');

    const previewResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/checkouts/preview' &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Kiểm tra đơn hàng', exact: true }).click();
    expect((await previewResponse).status()).toBe(200);
    await expect(page.getByText('Đặt cọc', { exact: true })).toBeVisible();
    const orderNumber = 'RPH-20260827-GUEST001';
    const guestToken = 'g'.repeat(43);
    let createRequests = 0;
    await page.route('**/api/v1/checkouts', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      createRequests += 1;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            order: { orderNumber },
            guestAccessToken: guestToken,
          },
        }),
      });
    });

    await page.getByRole('button', { name: 'Đặt hàng', exact: true }).click();
    await page.waitForURL(`/orders/${orderNumber}`);
    await expect
      .poll(() =>
        page.evaluate((key) => sessionStorage.getItem(key), `rephone_order_token:${orderNumber}`),
      )
      .toBe(guestToken);
    expect(new URL(page.url()).hash).toBe('');
    expect(createRequests).toBe(1);
  });

  test(bt('browser:cart-checkout', 'customer-pickup-wishlist'), async ({ page }) => {
    await addUnitToCart(page, CUSTOMER_UNIT);
    await login(page, '/cart');

    await expect(page.getByText(`Mã máy: ${CUSTOMER_UNIT.code}`, { exact: true })).toBeVisible();
    await page.goto(CUSTOMER_UNIT.path);
    await page.getByRole('button', { name: 'Lưu máy', exact: true }).click();
    await expect(page.getByText('Đã lưu máy vào danh sách.', { exact: true })).toBeVisible();

    await page.goto('/wishlist');
    const savedCard = page.locator('article').filter({ hasText: CUSTOMER_UNIT.code });
    await expect(savedCard).toBeVisible();
    await expect(
      savedCard.getByRole('button', { name: 'Thêm vào giỏ', exact: true }),
    ).toBeEnabled();
    await savedCard
      .getByRole('button', { name: `Xóa iPhone 14 Pro khỏi danh sách ưa thích`, exact: true })
      .click();
    await expect(savedCard).toHaveCount(0);

    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: 'Hoàn tất đơn hàng' })).toBeVisible();
    const savedAddress = page.getByLabel('Chọn địa chỉ đã lưu');
    await expect(savedAddress).toContainText('Nhà');
    await savedAddress.selectOption({ index: 1 });
    await expect(page.locator('#checkout-addressLine')).toHaveValue('123 Đường Demo');

    await page.getByLabel('Nhận tại cửa hàng').check();
    await expect(page.locator('#checkout-addressLine')).toHaveCount(0);
    const pickupPreview = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/checkouts/preview' &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Kiểm tra đơn hàng', exact: true }).click();
    expect((await pickupPreview).status()).toBe(200);
    await expect(page.getByText(/^Nhận tại /)).toBeVisible();
    const orderNumber = 'RPH-20260827-PICKUP01';
    let createBody: unknown;
    await page.route('**/api/v1/checkouts', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      createBody = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: { order: { orderNumber } } }),
      });
    });

    await page.getByRole('button', { name: 'Đặt hàng', exact: true }).click();
    await page.waitForURL(`/orders/${orderNumber}`);
    expect(createBody).toMatchObject({ fulfillmentType: 'PICKUP' });
    expect(createBody).not.toHaveProperty('shippingAddress');
    await removeCartUnit(page, CUSTOMER_UNIT.code);
  });

  test(bt('browser:cart-checkout', 'guest-cart-merge-retry'), async ({ page }) => {
    await addUnitToCart(page, CUSTOMER_UNIT);
    let mergeRequests = 0;
    await page.route('**/api/v1/cart/merge', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      mergeRequests += 1;
      if (mergeRequests === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'SERVICE_UNAVAILABLE', message: 'Dịch vụ đang tạm gián đoạn.' },
          }),
        });
        return;
      }
      await route.continue();
    });

    await login(page, '/cart');
    await expect(page.getByText('Chưa thể cập nhật giỏ hàng', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await expect(page.getByText('Chưa thể cập nhật giỏ hàng', { exact: true })).toHaveCount(0);
    await expect(page.getByText(`Mã máy: ${CUSTOMER_UNIT.code}`, { exact: true })).toBeVisible();
    expect(mergeRequests).toBe(2);
    await removeCartUnit(page, CUSTOMER_UNIT.code);
  });

  test(bt('browser:cart-checkout', 'checkout-reconfirmation'), async ({ page }) => {
    await addUnitToCart(page, GUEST_UNIT);
    await page.goto('/checkout');
    await fillShippingCheckout(page);

    const previewResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/checkouts/preview' &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Kiểm tra đơn hàng', exact: true }).click();
    const previewResponse = await previewResponsePromise;
    const previewEnvelope = checkoutPreviewEnvelope(await previewResponse.json());
    const changed = checkoutPreviewWithChangedTotal(previewEnvelope.data);
    const orderNumber = 'RPH-20260827-REVIEW01';
    let createRequests = 0;

    await page.route('**/api/v1/checkouts', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      createRequests += 1;
      if (createRequests === 1) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'CHECKOUT_REVIEW_REQUIRED',
              message: 'Thông tin đơn hàng vừa thay đổi.',
              details: [{ code: 'CHECKOUT_CHANGED', current: changed.preview }],
            },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: { order: { orderNumber } } }),
      });
    });

    await page.getByRole('button', { name: 'Đặt hàng', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Đơn hàng vừa có thay đổi' }),
    ).toBeVisible();
    await expect(page.getByText(formatVnd(changed.grandTotal), { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đặt hàng', exact: true })).toHaveCount(0);
    await page.waitForTimeout(250);
    expect(createRequests).toBe(1);

    await page.getByRole('button', { name: 'Tôi đã xem thay đổi', exact: true }).click();
    await page.getByRole('button', { name: 'Đặt hàng', exact: true }).click();
    await page.waitForURL(`/orders/${orderNumber}`);
    expect(createRequests).toBe(2);
  });
});

async function addUnitToCart(
  page: Page,
  unit: { readonly code: string; readonly path: string },
): Promise<void> {
  await page.goto(unit.path);
  await expect(page.getByText(`Ảnh thật · Mã máy ${unit.code}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Thêm vào giỏ', exact: true }).click();
  await expect(page.getByText('Đã thêm vào giỏ hàng.', { exact: true })).toBeVisible();
}

async function login(page: Page, returnTo: string): Promise<void> {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel('Email').fill(CUSTOMER.email);
  await page.getByLabel('Mật khẩu').fill(CUSTOMER.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(returnTo);
}

async function removeCartUnit(page: Page, inventoryCode: string): Promise<void> {
  await page.goto('/cart');
  const cartRow = page.locator('article').filter({ hasText: inventoryCode });
  await cartRow.getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect(cartRow).toHaveCount(0);
}

async function fillContact(page: Page, fullName: string, email: string): Promise<void> {
  await page.locator('#checkout-fullName').fill(fullName);
  await page.locator('#checkout-phone').fill('0900000303');
  await page.locator('#checkout-email').fill(email);
}

async function fillShippingCheckout(page: Page): Promise<void> {
  await fillContact(page, 'Khách xác nhận FE-03', 'review-fe03@rephone.local');
  await page.locator('#checkout-receiverName').fill('Khách nhận FE-03');
  await page.locator('#checkout-receiverPhone').fill('0900000303');
  await page.locator('#checkout-addressLine').fill('27 Đường Kiểm Thử');
  await page.locator('#checkout-ward').fill('Phường Demo');
  await page.locator('#checkout-district').fill('Quận Demo');
  await page.locator('#checkout-province').fill('TP. Hồ Chí Minh');
}

function checkoutPreviewEnvelope(value: unknown): { data: Record<string, unknown> } {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('data' in value) ||
    typeof value.data !== 'object' ||
    value.data === null ||
    Array.isArray(value.data)
  ) {
    throw new Error('Expected checkout preview response data');
  }
  return { data: value.data as Record<string, unknown> };
}

function checkoutPreviewWithChangedTotal(preview: Record<string, unknown>): {
  preview: Record<string, unknown>;
  grandTotal: string;
} {
  const pricing = preview['pricing'];
  if (
    typeof pricing !== 'object' ||
    pricing === null ||
    Array.isArray(pricing) ||
    !('grandTotal' in pricing) ||
    typeof pricing.grandTotal !== 'string'
  ) {
    throw new Error('Expected checkout pricing data');
  }
  const grandTotal = (BigInt(pricing.grandTotal) + BigInt(100_000)).toString();
  return {
    preview: {
      ...preview,
      pricing: { ...pricing, grandTotal },
    },
    grandTotal,
  };
}

function formatVnd(value: string): string {
  return `${new Intl.NumberFormat('vi-VN').format(BigInt(value))} ₫`;
}
