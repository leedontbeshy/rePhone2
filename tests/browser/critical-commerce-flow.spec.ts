import { expect, test, type Locator, type Page } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';

const CUSTOMER = {
  email: 'customer@rephone.local',
  password: 'CustomerDemo123',
};
const EMPLOYEE = {
  email: 'employee@rephone.local',
  password: 'EmployeeDemo123',
};
const INVENTORY_CODE = 'IP13-BLU-001';
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z6kAAAAAASUVORK5CYII=',
  'base64',
);

test(bt('browser:critical-commerce-flow', 'catalog-to-completed-shipping'), async ({ browser }) => {
  test.setTimeout(180_000);
  const customerContext = await browser.newContext();
  const staffContext = await browser.newContext();

  try {
    const customerPage = await customerContext.newPage();
    await login(customerPage, CUSTOMER, '/account');

    await customerPage.goto('/products?q=iPhone+13');
    await expect(
      customerPage.getByRole('heading', {
        name: 'Tìm iPhone và phụ kiện',
        exact: true,
      }),
    ).toBeVisible();
    await customerPage.locator('a[href="/products/iphone-13"]').first().click();
    await expect(
      customerPage.getByRole('heading', { name: 'iPhone 13', exact: true }),
    ).toBeVisible();
    await customerPage
      .locator(`a[href="/products/iphone-13/units/${INVENTORY_CODE}"]`)
      .first()
      .click();
    await expect(
      customerPage.getByText(`Ảnh thật · Mã máy ${INVENTORY_CODE}`, { exact: true }),
    ).toBeVisible();

    await customerPage.getByRole('button', { name: 'Thêm vào giỏ', exact: true }).click();
    await expect(customerPage.getByText('Đã thêm vào giỏ hàng.', { exact: true })).toBeVisible();
    await customerPage.goto('/cart');
    await expect(
      customerPage.getByText(`Mã máy: ${INVENTORY_CODE}`, { exact: true }),
    ).toBeVisible();
    await customerPage.getByRole('link', { name: 'Tiếp tục đặt hàng', exact: true }).click();

    await fillShippingCheckout(customerPage);
    await customerPage.getByRole('button', { name: 'Kiểm tra đơn hàng', exact: true }).click();
    const depositLine = customerPage.getByText('Đặt cọc', { exact: true }).locator('..');
    await expect(depositLine).toBeVisible();
    const expectedDeposit = moneyDigits(await depositLine.locator('strong').innerText());
    expect(Number(expectedDeposit)).toBeGreaterThan(0);

    let createResponsePromise = checkoutCreateResponse(customerPage);
    await customerPage.getByRole('button', { name: 'Đặt hàng', exact: true }).click();
    let createResponse = await createResponsePromise;
    if (createResponse.status() >= 500) {
      const recovery = customerPage.getByRole('button', {
        name: 'Kiểm tra trạng thái đơn hàng',
        exact: true,
      });
      await expect(recovery).toBeVisible();
      createResponsePromise = checkoutCreateResponse(customerPage);
      await recovery.click();
      createResponse = await createResponsePromise;
    }
    expect(createResponse.status()).toBe(201);
    await customerPage.waitForURL('**/orders/**');
    const orderNumber = orderNumberFrom(customerPage.url());
    await expect(
      customerPage.getByRole('heading', { name: orderNumber, exact: true }),
    ).toBeVisible();

    await customerPage.getByLabel('Chọn minh chứng thanh toán', { exact: true }).setInputFiles({
      name: 'deposit-proof.png',
      mimeType: 'image/png',
      buffer: ONE_PIXEL_PNG,
    });
    await customerPage.getByRole('button', { name: 'Gửi minh chứng', exact: true }).click();
    await expect(
      customerPage.getByText('Đã gửi minh chứng. Thanh toán đang được kiểm tra.', {
        exact: true,
      }),
    ).toBeVisible();

    const staffPage = await staffContext.newPage();
    await login(staffPage, EMPLOYEE, '/backoffice/orders');
    await staffPage.goto('/backoffice/payments');
    const paymentRow = staffPage.getByRole('row').filter({ hasText: orderNumber });
    await expect(paymentRow).toBeVisible();
    await paymentRow.getByRole('link', { name: 'Mở hồ sơ', exact: true }).click();
    await staffPage.getByRole('button', { name: 'Xác nhận thanh toán', exact: true }).click();
    const paymentDialog = staffPage.getByRole('dialog', { name: 'Xác nhận thanh toán' });
    await paymentDialog.locator('#received-amount').fill(expectedDeposit);
    await paymentDialog.getByRole('button', { name: 'Xác nhận thanh toán', exact: true }).click();
    await expect(
      staffPage.getByText('Đã xác nhận khoản thanh toán.', { exact: false }),
    ).toBeVisible();

    await staffPage.goto('/backoffice/orders');
    const orderLink = staffPage
      .getByRole('region', { name: 'Danh sách đơn hàng' })
      .getByRole('link')
      .filter({ hasText: orderNumber });
    await expect(orderLink).toBeVisible();
    await orderLink.click();
    const prepareAction = await openOrderAction(staffPage, 'Bắt đầu chuẩn bị hàng');
    await prepareAction.locator('button[type="submit"]').click();
    await expect(staffPage.getByText('Đã bắt đầu chuẩn bị hàng.', { exact: true })).toBeVisible();

    const shipmentAction = await openOrderAction(staffPage, 'Tạo vận đơn');
    await shipmentAction.locator('#carrier-name').fill('rePhone Browser');
    await shipmentAction.locator('#tracking-code').fill('PW-SLICE12-001');
    await shipmentAction
      .locator('#tracking-url')
      .fill('https://carrier.example/track/PW-SLICE12-001');
    await shipmentAction.locator('button[type="submit"]').click();
    await expect(staffPage.getByText('Đã tạo vận đơn.', { exact: true })).toBeVisible();

    const handoffAction = await openOrderAction(staffPage, 'Bàn giao cho đơn vị vận chuyển');
    await handoffAction.locator('button[type="submit"]').click();
    await expect(
      staffPage.getByText('Đã bàn giao kiện hàng cho đơn vị vận chuyển.', { exact: true }),
    ).toBeVisible();

    const deliveredAction = await openOrderAction(staffPage, 'Xác nhận giao thành công');
    await deliveredAction.getByLabel('Đơn vị giao hàng đã thu đủ', { exact: false }).check();
    await deliveredAction.locator('button[type="submit"]').click();
    await expect(
      staffPage.getByText('Đã xác nhận giao hàng thành công.', { exact: true }),
    ).toBeVisible();
    await expect(staffPage.getByText('Đã hoàn tất', { exact: true }).first()).toBeVisible();

    await customerPage.reload();
    await expect(
      customerPage.getByRole('heading', { name: orderNumber, exact: true }),
    ).toBeVisible();
    await expect(customerPage.getByText('Đã hoàn tất', { exact: true }).first()).toBeVisible();
    await expect(customerPage.getByText('Đã giao hàng', { exact: true }).first()).toBeVisible();
    await expect(customerPage.getByText('Thanh toán khi nhận hàng', { exact: true })).toBeVisible();
    await expect(customerPage.getByText('Đã thanh toán', { exact: true }).first()).toBeVisible();
    await expect(customerPage.getByText(/Còn hiệu lực/).first()).toBeVisible();
    await expect(customerPage.getByRole('link', { name: 'Xem bảo hành' })).toBeVisible();
  } finally {
    await staffContext.close();
    await customerContext.close();
  }
});

async function openOrderAction(page: Page, label: string): Promise<Locator> {
  await page
    .getByRole('group', { name: 'Thao tác đang được phép' })
    .getByRole('button', { name: label, exact: true })
    .click();
  const details = page.locator('details').filter({ hasText: label });
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  return details;
}

async function login(
  page: Page,
  credentials: { email: string; password: string },
  destination: '/account' | '/backoffice/orders',
): Promise<void> {
  await page.goto(`/login?returnTo=${encodeURIComponent(destination)}`);
  await page.getByLabel('Email').fill(credentials.email);
  await page.locator('#password').fill(credentials.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(destination);
}

async function fillShippingCheckout(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Hoàn tất đơn hàng', exact: true })).toBeVisible();
  await page.locator('#checkout-fullName').fill('Khách hàng Browser');
  await page.locator('#checkout-email').fill(CUSTOMER.email);
  await page.locator('#checkout-phone').fill('0900000000');
  await page.locator('#checkout-receiverName').fill('Khách hàng Browser');
  await page.locator('#checkout-receiverPhone').fill('0900000000');
  await page.locator('#checkout-addressLine').fill('123 Đường Browser');
  await page.locator('#checkout-ward').fill('Phường Demo');
  await page.locator('#checkout-district').fill('Quận Demo');
  await page.locator('#checkout-province').fill('TP. Hồ Chí Minh');
}

function moneyDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) throw new Error(`Expected money text, received ${value}`);
  return digits;
}

function checkoutCreateResponse(page: Page) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/checkouts' &&
      response.request().method() === 'POST',
  );
}

function orderNumberFrom(url: string): string {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  const orderNumber = parts[parts.length - 1];
  if (orderNumber === undefined || !orderNumber.startsWith('RPH-')) {
    throw new Error(`Expected order detail URL, received ${url}`);
  }
  return decodeURIComponent(orderNumber);
}
