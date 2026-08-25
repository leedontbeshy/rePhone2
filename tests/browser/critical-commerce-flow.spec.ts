import { expect, test, type Page } from '@playwright/test';

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

test('catalog to completed shipping order through customer and staff portals', async ({
  browser,
}) => {
  const customerContext = await browser.newContext();
  const staffContext = await browser.newContext();

  try {
    const customerPage = await customerContext.newPage();
    await login(customerPage, CUSTOMER);

    await customerPage.goto('/products');
    await expect(
      customerPage.getByRole('heading', { name: 'Chọn đúng chiếc iPhone dành cho bạn.' }),
    ).toBeVisible();
    await customerPage.getByRole('link', { name: 'Xem iPhone 13', exact: true }).click();
    await expect(
      customerPage.getByRole('heading', { name: 'iPhone 13', exact: true }),
    ).toBeVisible();
    await customerPage.locator(`a[href="/products/iphone-13/units/${INVENTORY_CODE}"]`).click();
    await expect(
      customerPage.getByText(`Máy thật · ${INVENTORY_CODE}`, { exact: true }),
    ).toBeVisible();

    await customerPage.getByRole('button', { name: 'Thêm vào giỏ', exact: true }).click();
    await expect(customerPage.getByText('Đã thêm vào giỏ hàng.', { exact: true })).toBeVisible();
    await customerPage.goto('/cart');
    await expect(customerPage.getByText(INVENTORY_CODE, { exact: true })).toBeVisible();
    await customerPage.getByRole('link', { name: 'Tiến hành checkout', exact: true }).click();

    await fillShippingCheckout(customerPage);
    await customerPage.getByRole('button', { name: 'Tính lại', exact: true }).click();
    const depositLine = customerPage.getByText('Cọc cần chuyển', { exact: true }).locator('..');
    await expect(depositLine).toBeVisible();
    const expectedDeposit = moneyDigits(await depositLine.locator('strong').innerText());
    expect(Number(expectedDeposit)).toBeGreaterThan(0);

    await customerPage.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true }).click();
    await customerPage.waitForURL('**/orders/**');
    const orderNumber = orderNumberFrom(customerPage.url());
    await expect(
      customerPage.getByRole('heading', { name: orderNumber, exact: true }),
    ).toBeVisible();

    await customerPage.getByLabel('Minh chứng chuyển khoản', { exact: true }).setInputFiles({
      name: 'deposit-proof.png',
      mimeType: 'image/png',
      buffer: ONE_PIXEL_PNG,
    });
    await customerPage.getByRole('button', { name: 'Nộp minh chứng', exact: true }).click();
    await expect(
      customerPage.getByText('Đã nộp minh chứng. Thanh toán đang chờ nhân viên kiểm tra.', {
        exact: true,
      }),
    ).toBeVisible();

    const staffPage = await staffContext.newPage();
    await login(staffPage, EMPLOYEE);
    await staffPage.goto('/backoffice/payments');
    const paymentCard = staffPage.locator('a.payment-queue-card', { hasText: orderNumber });
    await expect(paymentCard).toBeVisible();
    await paymentCard.click();
    await staffPage.getByLabel('Số tiền đã nhận (VND)', { exact: true }).fill(expectedDeposit);
    await staffPage.getByRole('button', { name: 'Xác minh thanh toán', exact: true }).click();
    await expect(staffPage.getByText('Đã xác minh thanh toán.', { exact: false })).toBeVisible();

    await staffPage.goto('/backoffice/orders');
    const orderCard = staffPage.locator('a.fulfillment-order-card', { hasText: orderNumber });
    await expect(orderCard).toBeVisible();
    await orderCard.click();
    await staffPage.getByRole('button', { name: 'Bắt đầu chuẩn bị', exact: true }).click();
    await expect(staffPage.getByText('Đã bắt đầu chuẩn bị hàng.', { exact: true })).toBeVisible();

    await staffPage.getByLabel('Đơn vị vận chuyển', { exact: true }).fill('rePhone Browser');
    await staffPage.getByLabel('Mã vận đơn', { exact: true }).fill('PW-SLICE12-001');
    await staffPage
      .getByLabel('URL tra cứu HTTPS (không bắt buộc)', { exact: true })
      .fill('https://carrier.example/track/PW-SLICE12-001');
    await staffPage.getByRole('button', { name: 'Tạo vận đơn', exact: true }).click();
    await expect(
      staffPage.getByText('Đã tạo vận đơn và mã tra cứu.', { exact: true }),
    ).toBeVisible();

    await staffPage.getByRole('button', { name: 'Bàn giao vận chuyển', exact: true }).click();
    await expect(
      staffPage.getByText('Đã bàn giao kiện hàng cho đơn vị vận chuyển.', { exact: true }),
    ).toBeVisible();

    await staffPage.getByLabel('Đơn vị giao hàng đã thu đủ', { exact: false }).check();
    await staffPage.getByRole('button', { name: 'Đã giao thành công', exact: true }).click();
    await expect(
      staffPage.getByText('Đã giao hàng, quyết toán COD và phát hành bảo hành.', { exact: true }),
    ).toBeVisible();
    await expect(staffPage.getByText('COMPLETED', { exact: true }).first()).toBeVisible();

    await customerPage.reload();
    await expect(
      customerPage.getByRole('heading', { name: orderNumber, exact: true }),
    ).toBeVisible();
    await expect(
      customerPage.locator('.order-status').getByText('COMPLETED', { exact: true }),
    ).toBeVisible();
    await expect(
      customerPage.getByRole('heading', { name: 'Thanh toán COD', exact: true }),
    ).toBeVisible();
    await expect(customerPage.getByText('Thu hộ khi giao hàng', { exact: true })).toBeVisible();
    await expect(customerPage.locator('.order-warranty-summary strong')).toContainText('ACTIVE');
  } finally {
    await staffContext.close();
    await customerContext.close();
  }
});

async function login(page: Page, credentials: { email: string; password: string }): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(credentials.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL('/');
}

async function fillShippingCheckout(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible();
  await page.getByLabel('Họ tên', { exact: true }).fill('Khách hàng Browser');
  await page.getByLabel('Email', { exact: true }).fill(CUSTOMER.email);
  await page.getByLabel('Điện thoại', { exact: true }).fill('0900000000');
  await page.getByLabel('Người nhận', { exact: true }).fill('Khách hàng Browser');
  await page.getByLabel('SĐT người nhận', { exact: true }).fill('0900000000');
  await page.getByLabel('Địa chỉ', { exact: true }).fill('123 Đường Browser');
  await page.getByLabel('Phường/xã', { exact: true }).fill('Phường Demo');
  await page.getByLabel('Quận/huyện', { exact: true }).fill('Quận Demo');
  await page.getByLabel('Tỉnh/thành', { exact: true }).fill('TP. Hồ Chí Minh');
}

function moneyDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) throw new Error(`Expected money text, received ${value}`);
  return digits;
}

function orderNumberFrom(url: string): string {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  const orderNumber = parts[parts.length - 1];
  if (orderNumber === undefined || !orderNumber.startsWith('RPH-')) {
    throw new Error(`Expected order detail URL, received ${url}`);
  }
  return decodeURIComponent(orderNumber);
}
