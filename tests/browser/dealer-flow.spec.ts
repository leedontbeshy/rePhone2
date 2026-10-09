import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';

test.use({ actionTimeout: 15000 });

test(
  bt('browser:dealer-flow', 'purchase-delivery-warranty'),
  async ({ page, browser }, testInfo) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await login(page, 'customer@rephone.local', 'CustomerDemo123', '/dealer');
    await expect(
      page.getByRole('heading', { name: 'Cửa hàng đại lý TEST', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Kho máy', exact: true }).click();
    await expect(page.getByText(/Pin \d+%/).first()).toBeVisible();
    await expect(page.getByLabel('Ngoại hình', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Chọn máy này' }).first().click();
    const externalId = `browser-dealer-${Date.now().toString()}`;
    for (const [label, value] of Object.entries({
      'Mã đơn tại cửa hàng của bạn': externalId,
      'Tên người nhận': 'Khách đại lý Browser',
      'Điện thoại': '0900000000',
      'Email nhận thông báo giao hàng': 'dealer-recipient@example.test',
      'Số nhà, đường': '123 Đường thử nghiệm',
      'Phường / xã': 'Phường 1',
      'Quận / huyện': 'Quận 1',
      'Tỉnh / thành phố': 'TP. Hồ Chí Minh',
    }))
      await page.getByLabel(label, { exact: false }).fill(value, { timeout: 15000 });
    const previewResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/dealer/orders/preview') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Xem lại đơn hàng' }).click();
    const preview = (await (await previewResponse).json()) as { data: { inventoryUnitId: string } };
    await expect(
      page.getByRole('heading', { name: 'Xác nhận thông tin đã xem lại' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Tạo đơn và giữ máy 30 phút' }).click();
    await expect(page.getByRole('heading', { name: 'Thanh toán cho rePhone' })).toBeVisible();
    await expect(
      page.getByText('TEST BANK — KHÔNG CHUYỂN TIỀN', { exact: false }).first(),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('dealer-order-desktop.png'),
      fullPage: true,
    });
    await accessible(page);

    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    admin.on('pageerror', (error) => errors.push(error.message));
    await login(admin, 'admin@rephone.local', 'AdminDemo123', '/backoffice/dealers');
    await admin.getByText('Quản lý trạng thái cổng', { exact: true }).click();
    await admin.getByRole('button', { name: 'Tạm đóng cổng đại lý', exact: true }).click();
    await expect(admin.getByRole('button', { name: 'Mở cổng đại lý', exact: true })).toBeVisible();
    await page.reload();
    await expect(
      page.getByText('Cổng đại lý đang tạm đóng đăng ký và đặt hàng mới.', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Đơn hàng', exact: true }).click();
    await expect(page.getByRole('article').filter({ hasText: externalId })).toBeVisible();
    await admin.getByRole('button', { name: 'Mở cổng đại lý', exact: true }).click();
    await expect(
      admin.getByRole('button', { name: 'Tạm đóng cổng đại lý', exact: true }),
    ).toBeVisible();
    await admin.screenshot({
      path: testInfo.outputPath('dealer-channel-control.png'),
      fullPage: true,
    });
    await admin.goto(`/backoffice/inventory/units/${preview.data.inventoryUnitId}`);
    const pricing = admin.getByRole('region', { name: 'Giá đại lý của máy', exact: true });
    await expect(pricing.getByText('Giá sàn đại lý', { exact: true })).toBeVisible();
    await pricing
      .getByLabel('Lý do cập nhật giá đại lý')
      .fill('Kiểm tra áp dụng chính sách giá chung');
    await pricing.getByRole('button', { name: 'Lưu giá đại lý của máy' }).click();
    await expect(pricing.getByText('Đã lưu giá đại lý của máy.')).toBeVisible();
    await admin.screenshot({
      path: testInfo.outputPath('dealer-unit-pricing.png'),
      fullPage: true,
    });
    await admin.goto('/backoffice/dealers');
    await admin.getByRole('button', { name: 'Đơn đại lý', exact: true }).click();
    await admin
      .getByRole('row')
      .filter({ hasText: externalId })
      .getByRole('button', { name: 'Xem đơn' })
      .click();
    await admin.getByLabel('Tình huống mô phỏng').selectOption('PAYMENT');
    await admin.getByRole('button', { name: 'Chạy tình huống TEST' }).click();
    await expect(admin.getByText('Đã xác nhận', { exact: true }).first()).toBeVisible();
    await admin.getByLabel('Tình huống mô phỏng').selectOption('DELIVER');
    await admin.getByRole('button', { name: 'Chạy tình huống TEST' }).click();
    await expect(admin.getByText('Hoàn tất', { exact: true }).first()).toBeVisible();
    await admin.screenshot({
      path: testInfo.outputPath('dealer-backoffice-desktop.png'),
      fullPage: true,
    });
    await accessible(admin);
    await adminContext.close();

    await page.reload();
    await page.getByRole('button', { name: 'Đơn hàng', exact: true }).click();
    await page
      .getByRole('article')
      .filter({ hasText: externalId })
      .getByRole('button', { name: 'Xem đơn' })
      .click();
    await page.getByRole('button', { name: 'Xem phiếu bảo hành cho khách' }).click();
    const warranty = page.getByRole('article').filter({ hasText: 'Phiếu bảo hành ·' });
    await expect(warranty).toBeVisible();
    await expect(warranty).toContainText('Khách đại lý Browser');
    await expect(warranty).toContainText('Kiểm định và thực hiện bảo hành: rePhone');
    await expect(warranty).not.toContainText('Giá đại lý');
    await page.setViewportSize({ width: 360, height: 800 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('dealer-warranty-mobile.png'),
      fullPage: true,
    });
    await accessible(page);
    expect(errors).toEqual([]);
  },
);

test(bt('browser:dealer-flow', 'public-docs'), async ({ page }) => {
  await page.goto('/dealer/terms');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await accessible(page);
  await page.goto('/dealer/api-guide');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await accessible(page);
});

async function login(page: Page, email: string, password: string, destination: string) {
  await page.goto(`/login?returnTo=${encodeURIComponent(destination)}`);
  await page.getByLabel('Email').fill(email, { timeout: 15000 });
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(destination);
}
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((row) => row.impact === 'serious' || row.impact === 'critical'),
  ).toEqual([]);
}
