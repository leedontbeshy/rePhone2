import AxeBuilder from '@axe-core/playwright';
import { stabilizeWp11VisualPage } from './support/wp11-visual';
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
    await page.getByLabel('Tìm máy', { exact: true }).fill('DEALER-BROWSER-001');
    await page.getByRole('button', { name: 'Tìm máy', exact: true }).click();
    const fixture = page.getByRole('article').filter({ hasText: 'DEALER-BROWSER-001' });
    await fixture.getByRole('button', { name: 'Chọn máy này' }).click();
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
    await captureStablePage(page, {
      path: testInfo.outputPath('dealer-order-desktop.png'),
      fullPage: true,
    });
    await accessible(page);

    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    admin.on('pageerror', (error) => errors.push(error.message));
    await login(admin, 'admin@rephone.local', 'AdminDemo123', '/backoffice/settings');
    await expect(
      admin.getByRole('heading', { name: 'Kênh bán hàng & đối tác', exact: true }),
    ).toBeVisible();
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
    await captureStablePage(admin, {
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
    await captureStablePage(admin, {
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
    await captureStablePage(admin, {
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
    await captureStablePage(page, {
      path: testInfo.outputPath('dealer-warranty-mobile.png'),
      fullPage: true,
    });
    await accessible(page);
    expect(errors).toEqual([]);
  },
);

test(bt('browser:dealer-flow', 'public-docs'), async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const headers = {
      'Access-Control-Allow-Origin': request.headers()['origin'] ?? '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers':
        request.headers()['access-control-request-headers'] ?? 'Content-Type, Authorization',
      Vary: 'Origin',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      headers,
      body: JSON.stringify({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Public documentation does not require a session.',
        },
      }),
    });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/dealer');
  await expect(
    page.getByRole('heading', { name: 'Chương trình đại lý rePhone.', exact: true }),
  ).toBeVisible();
  await captureStablePage(page, {
    path: testInfo.outputPath('dealer-public-desktop.png'),
    fullPage: true,
  });
  await page.goto('/dealer/terms');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await accessible(page);
  await page.goto('/dealer/api-guide');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Gọi API đầu tiên trong 4 bước', exact: true }),
  ).toBeVisible();
  const firstRequest = page.getByLabel('Bash / WSL · Kết nối đầu tiên bằng cURL', { exact: true });
  await expect(firstRequest).toContainText('X-Dealer-Api-Key');
  await expect(firstRequest).toContainText('/dealer/catalog?page=1&pageSize=1');
  await expect(page.getByLabel('HTTP 200 · Ví dụ kho chưa có máy phù hợp')).toContainText(
    '"items": []',
  );
  const overview = page.getByRole('table', { name: 'Danh sách API đại lý', exact: true });
  await expect(overview.locator('tbody tr')).toHaveCount(16);
  await expect(page.locator('#reference details')).toHaveCount(16);
  await expect(overview).toContainText('catalog:read');
  await expect(overview).toContainText('after-sales:write');

  await page.getByRole('button', { name: 'Sandbox · TEST', exact: true }).click();
  const testConfiguration = await page
    .getByLabel('Cấu hình trên máy chủ website của bạn · TEST', { exact: true })
    .innerText();
  await expect(firstRequest).toContainText('rp_test_');
  const testBase = testConfiguration.match(/^REPHONE_API_BASE_URL=(.+)$/m)?.[1];
  expect(testBase).toBeTruthy();
  if (testBase && !testBase.startsWith('<')) await expect(firstRequest).toContainText(testBase);
  await page.getByRole('button', { name: 'Thực tế · LIVE', exact: true }).click();
  const liveConfiguration = await page
    .getByLabel('Cấu hình trên máy chủ website của bạn · LIVE', { exact: true })
    .innerText();
  await expect(firstRequest).toContainText('rp_live_');
  await expect(firstRequest).not.toContainText('rp_test_');
  const liveBase = liveConfiguration.match(/^REPHONE_API_BASE_URL=(.+)$/m)?.[1];
  expect(liveBase).toBeTruthy();
  if (liveBase && !liveBase.startsWith('<')) {
    await expect(firstRequest).toContainText(liveBase);
  } else {
    await expect(page.locator('#connect').getByRole('status')).toContainText(
      'Chưa có địa chỉ API Live',
    );
  }
  await page.getByRole('button', { name: 'Sandbox · TEST', exact: true }).click();

  // Keep the test independent of clipboard permissions and the user's system clipboard.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (value: string) => {
          document.documentElement.setAttribute('data-dealer-copied-code', value);
          return Promise.resolve();
        },
      },
    });
  });
  const firstRequestText = await firstRequest.innerText();
  await firstRequest.locator('..').getByRole('button', { name: 'Sao chép', exact: true }).click();
  await expect(
    firstRequest.locator('..').getByRole('button', { name: 'Đã chép', exact: true }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-dealer-copied-code', firstRequestText);

  await overview.locator('a[href="#endpoint-orders-create"]').click();
  const createOrder = page.locator('#endpoint-orders-create');
  await expect(createOrder).toHaveAttribute('open', '');
  await expect(createOrder.locator('summary')).toBeFocused();
  await expect(createOrder.getByLabel('JSON body minh họa · Tạo đơn và giữ một máy')).toContainText(
    'previewFingerprint',
  );
  await expect(
    createOrder.getByLabel('cURL · Bash/WSL · POST /dealer/orders', { exact: true }),
  ).toContainText('Idempotency-Key');
  await expect(
    createOrder.getByLabel('Phản hồi minh họa · HTTP 201 · Tạo đơn và giữ một máy'),
  ).toContainText('"order"');

  const search = page.getByLabel('Tìm API', { exact: true });
  const group = page.getByLabel('Nhóm API', { exact: true });
  await group.selectOption('payments');
  await expect(overview.locator('tbody tr')).toHaveCount(3);
  await expect(page.locator('#reference details')).toHaveCount(3);
  await search.fill('/payment-requests/{id}/proofs');
  await expect(overview.locator('tbody tr')).toHaveCount(1);
  await overview
    .getByRole('link', { name: '/dealer/payment-requests/{id}/proofs', exact: true })
    .click();
  const proofUpload = page.locator('#endpoint-payments-proof');
  await expect(proofUpload).toHaveAttribute('open', '');
  await expect(proofUpload.getByRole('table')).toContainText('Tệp multipart');
  await expect(
    proofUpload.getByLabel('cURL · Bash/WSL · POST /dealer/payment-requests/{id}/proofs'),
  ).toContainText('--form');
  await search.fill('khong-co-api-nay-12345');
  await expect(page.locator('#reference').getByRole('status')).toHaveText('Hiển thị 0/16 endpoint');
  await expect(page.getByText('Không tìm thấy API phù hợp.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Hiển thị tất cả API', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(group).toHaveValue('');
  await expect(overview.locator('tbody tr')).toHaveCount(16);
  await search.fill('lay danh sach may va gia dai ly');
  await expect(overview.locator('tbody tr')).toHaveCount(1);
  await expect(overview).toContainText('/dealer/catalog');
  await page.getByRole('button', { name: 'Xóa bộ lọc API', exact: true }).click();
  await overview.locator('a[href="#endpoint-orders-create"]').click();
  await overview.locator('a[href="#endpoint-payments-proof"]').click();
  await captureStablePage(page, {
    path: testInfo.outputPath('dealer-guide-desktop.png'),
    fullPage: true,
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    for (const name of [
      'Danh sách API đại lý',
      'Tham số POST /dealer/orders',
      'Tham số POST /dealer/payment-requests/{id}/proofs',
      'Quyền truy cập API',
      'Tình huống đặt hàng',
      'Thanh toán và hậu mãi',
      'Xử lý lỗi kết nối',
    ]) {
      const region = page.getByRole('region', { name, exact: true });
      await expect(region).toHaveAttribute('tabindex', '0');
      await expect(region.getByRole('table', { name, exact: true })).toBeVisible();
      await region.focus();
      await expect(region).toBeFocused();
      await expect(region.locator('thead th:not([scope="col"])')).toHaveCount(0);
    }
    await captureStablePage(page, {
      path: testInfo.outputPath(`dealer-guide-${String(width)}.png`),
      fullPage: true,
    });
  }
  await accessible(page);
});

async function captureStablePage(page: Page, options: Parameters<Page['screenshot']>[0]) {
  await stabilizeWp11VisualPage(page);
  await page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.mouse.move(0, 0);
  await page.screenshot(options);
}

async function login(page: Page, email: string, password: string, destination: string) {
  await page.goto(`/login?returnTo=${encodeURIComponent(destination)}`);
  await page.getByLabel('Email').fill(email, { timeout: 15000 });
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(destination);
}
async function accessible(page: Page) {
  await expect(page).toHaveTitle(/rePhone/);
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((row) => row.impact === 'serious' || row.impact === 'critical'),
  ).toEqual([]);
}
