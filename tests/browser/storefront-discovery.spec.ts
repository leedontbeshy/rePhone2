import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { installDeterministicPublicMedia } from './support/deterministic-public-media';

const MODEL_PATH = '/products/iphone-14-pro';
const EXACT_UNIT_PATH = `${MODEL_PATH}/units/IP14P-128-001`;
const SOLD_OUT_MODEL_PATH = '/products/iphone-15-pro';
const HOME_HEADING = 'Chọn iPhone phù hợp với bạn';
const PUBLIC_ROUTES = [
  '/',
  '/products',
  MODEL_PATH,
  EXACT_UNIT_PATH,
  '/store',
  '/vouchers',
] as const;

const FORBIDDEN_PUBLIC_FIELDS =
  /acquisitionCost|additionalCost|serialEncrypted|serialHmac|objectPath|locationId|inspectorId|internalNote|bankAccountNumber|bankQr|updatedBy/i;
const FORBIDDEN_UNVERIFIED_CLAIMS = [
  /20 bước/i,
  /36 bước/i,
  /bao gồm VAT/i,
  /7 ngày đổi trả/i,
  /15 ngày đổi trả/i,
  /\d+ chi nhánh/i,
  /giao hàng toàn quốc/i,
  /giao hàng 1[–-]2 ngày/i,
  /miễn phí đơn từ/i,
] as const;

test.describe('FE-1 storefront discovery', () => {
  test.beforeEach(async ({ page }) => {
    await installDeterministicPublicMedia(page);
  });

  test('browses the six public surfaces using the seeded iPhone 14 dossier', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: HOME_HEADING,
        exact: true,
      }),
    ).toBeVisible();
    const soldOutModelLink = page
      .locator(`main a[href="${SOLD_OUT_MODEL_PATH}"]`)
      .filter({ hasText: 'iPhone 15 Pro' });
    await expect(soldOutModelLink).toHaveCount(1);
    await expect(soldOutModelLink).toBeVisible();
    await expect(soldOutModelLink).toContainText('Tạm hết máy');
    await expect(soldOutModelLink).toHaveAttribute('href', SOLD_OUT_MODEL_PATH);

    await page.goto('/products?q=iPhone+14+Pro');
    await expect(page.getByText('iPhone 14 Pro', { exact: true })).toBeVisible();

    const modelLink = page.locator(`main a[href="${MODEL_PATH}"]`).first();
    await expect(modelLink).toBeVisible();
    await modelLink.click();
    await expect(page).toHaveURL(MODEL_PATH);

    const exactUnitLink = page.locator(`main a[href="${EXACT_UNIT_PATH}"]`).first();
    await expect(exactUnitLink).toBeVisible();
    await exactUnitLink.click();
    await expect(page).toHaveURL(EXACT_UNIT_PATH);
    await expectExactUnitContract(page);

    await page.goto('/store');
    await expectPublicRouteMarker(page, '/store');
    await expect(page.getByText('Cửa hàng Hồ Chí Minh', { exact: true })).toBeVisible();

    await page.goto('/vouchers');
    await expect(page.getByText('WELCOME100', { exact: true })).toBeVisible();
    await expect(page.getByText('IPHONE5', { exact: true })).toHaveCount(0);
    await expect(page.getByText('DEMO-DRAFT', { exact: true })).toHaveCount(0);
    await expect(page.getByText('DEMO-PAUSED', { exact: true })).toHaveCount(0);
  });

  test('keeps URL filters authoritative across pagination and browser history', async ({
    page,
  }) => {
    await page.goto(
      '/products?productType=IPHONE&storageCapacityGb=128&pageSize=1&sortBy=name&sortOrder=asc',
    );

    const filterForm = page.locator('form:has(#desktop-catalog-type)');
    await expect(filterForm).toHaveCount(1);
    await expect(filterForm.locator('select[name="productType"]')).toHaveValue('IPHONE');
    await expect(filterForm.locator('select[name="storageCapacityGb"]')).toHaveValue('128');

    const nextPage = page.locator('nav[aria-label="Phân trang catalog"] a').filter({
      has: page.getByText('Trang sau', { exact: true }),
    });
    await expect(nextPage).toHaveCount(1);
    await nextPage.click();
    await expect(page).toHaveURL(/page=2/);

    await page.goBack();
    await expect(page).not.toHaveURL(/page=2/);
    await expect(filterForm.locator('select[name="productType"]')).toHaveValue('IPHONE');
    await expect(filterForm.locator('select[name="storageCapacityGb"]')).toHaveValue('128');

    await page.goForward();
    await expect(page).toHaveURL(/page=2/);
  });

  test('server-renders the six public contracts without browser JavaScript', async ({
    browser,
  }) => {
    await expectServerRenderedPublicRoutes(browser);
  });

  test('keeps exact-unit facts public-safe and avoids unverified merchandising claims', async ({
    page,
  }) => {
    await page.goto(EXACT_UNIT_PATH);
    await expectExactUnitContract(page);

    const rendered = await page.locator('main').textContent();
    expect(rendered).not.toBeNull();
    expect(rendered).not.toMatch(FORBIDDEN_PUBLIC_FIELDS);
    expect(rendered).not.toContain('RPH14P12801');
    for (const claim of FORBIDDEN_UNVERIFIED_CLAIMS) {
      expect(rendered).not.toMatch(claim);
    }

    const html = await page.content();
    expect(html).not.toMatch(FORBIDDEN_PUBLIC_FIELDS);
    expect(html).not.toContain('RPH14P12801');
  });

  test('shows account-only vouchers only after customer authentication', async ({ browser }) => {
    const guestContext = await browser.newContext();
    const customerContext = await browser.newContext();
    await installDeterministicPublicMedia(guestContext);
    await installDeterministicPublicMedia(customerContext);

    try {
      const guestPage = await guestContext.newPage();
      await guestPage.goto('/vouchers');
      await expect(guestPage.getByText('WELCOME100', { exact: true })).toBeVisible();
      await expect(guestPage.getByText('IPHONE5', { exact: true })).toHaveCount(0);

      const customerPage = await customerContext.newPage();
      await loginCustomer(customerPage);
      await customerPage.goto('/vouchers');
      await expect(customerPage.getByText('WELCOME100', { exact: true })).toBeVisible();
      await expect(customerPage.getByText('IPHONE5', { exact: true })).toBeVisible();
    } finally {
      await guestContext.close();
      await customerContext.close();
    }
  });

  test('passes serious accessibility checks and stays within a 320px viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 });

    for (const path of PUBLIC_ROUTES) {
      await page.goto(path);
      await expectPublicRouteMarker(page, path);
      await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
      await expect(page.locator('main')).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

      await expectNoSeriousAccessibilityViolations(page, path);
    }
  });

  test('keeps generation shelves scrollable without overflowing the mobile document', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');

    const shelf = page.getByLabel('Các model thuộc iPhone 15', { exact: true });
    await expect(shelf).toBeVisible();

    const initialDimensions = await shelf.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(initialDimensions.scrollWidth).toBeGreaterThan(initialDimensions.clientWidth);

    await shelf.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    expect(await shelf.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

    const documentDimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(documentDimensions.scrollWidth).toBeLessThanOrEqual(documentDimensions.clientWidth);
  });

  test('exposes generation and store contact links in the shared footer', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');

    for (const generation of ['X', '11', '12', '13', '14', '15', '16', '17']) {
      const label = `iPhone ${generation}`;
      await expect(footer.getByRole('link', { name: label, exact: true })).toHaveAttribute(
        'href',
        `/products?productType=IPHONE&q=${label.replace(' ', '+')}`,
      );
    }

    await expect(footer.getByRole('link', { name: '0900000000', exact: true })).toHaveAttribute(
      'href',
      'tel:0900000000',
    );
    await expect(
      footer.getByText('123 Đường Demo, TP. Hồ Chí Minh', { exact: true }),
    ).toBeVisible();
  });

  test('keeps skip navigation keyboard-operable on the canonical dossier', async ({ page }) => {
    await page.goto(EXACT_UNIT_PATH);
    await page.keyboard.press('Tab');

    const skipLink = page.getByRole('link', {
      name: 'Bỏ qua đến nội dung chính',
      exact: true,
    });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
  });

  test('recovers an unavailable exact unit back to its model', async ({ page }) => {
    const response = await page.goto(`${MODEL_PATH}/units/UNKNOWN-UNIT`);

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Chiếc máy này hiện không còn bán' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Xem các máy cùng dòng' })).toHaveAttribute(
      'href',
      MODEL_PATH,
    );
  });

  test('hides the mobile purchase bar before it can cover the footer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(EXACT_UNIT_PATH);

    await page.locator('#unit-purchase-actions').scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      window.scrollBy({ top: 900 });
    });
    await expect(page.getByRole('complementary', { name: 'Mua máy này' })).toBeVisible();

    await page.locator('footer').scrollIntoViewIfNeeded();
    await expect(page.getByRole('complementary', { name: 'Mua máy này' })).toHaveCount(0);
  });

  test('captures the canonical model and exact-unit details at desktop and mobile', async ({
    page,
  }) => {
    for (const viewport of [
      { name: 'desktop-1440', width: 1440, height: 900 },
      { name: 'mobile-390', width: 390, height: 844 },
    ] as const) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await page.goto(MODEL_PATH);
      await expect(page.getByRole('heading', { level: 1, name: 'iPhone 14 Pro' })).toBeVisible();
      await expect(page.getByText('Ảnh minh họa model', { exact: true })).toBeVisible();
      await expect(page.locator(`main a[href="${EXACT_UNIT_PATH}"]`).first()).toBeVisible();
      await stabilizeVisualPage(page);
      await expect(page).toHaveScreenshot(`fe1-model-detail-${viewport.name}.png`, {
        animations: 'disabled',
        caret: 'hide',
        fullPage: true,
      });

      await page.goto(EXACT_UNIT_PATH);
      await expectExactUnitContract(page);
      await stabilizeVisualPage(page);

      await expect(page).toHaveScreenshot(`fe1-exact-unit-dossier-${viewport.name}.png`, {
        animations: 'disabled',
        caret: 'hide',
        fullPage: true,
      });
    }
  });
});

async function expectServerRenderedPublicRoutes(browser: Browser): Promise<void> {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await installDeterministicPublicMedia(context);

  try {
    const page = await context.newPage();
    for (const path of PUBLIC_ROUTES) {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.locator('main')).toHaveCount(1);
      await expectPublicRouteMarker(page, path);
    }
  } finally {
    await context.close();
  }
}

async function expectExactUnitContract(page: Page): Promise<void> {
  await expect(page.getByText('Ảnh thật · Mã máy IP14P-128-001', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'iPhone 14 Pro' })).toBeVisible();
  const purchaseRail = page.getByLabel('Tóm tắt mua hàng');
  await expect(page.getByText('128 GB · 6 GB RAM', { exact: true })).toBeVisible();
  await expect(purchaseRail.getByText('Space Black', { exact: true })).toBeVisible();
  await expect(purchaseRail.getByText('16.490.000 ₫', { exact: true })).toBeVisible();
  await expect(purchaseRail.getByText('Grade A', { exact: true })).toBeVisible();
  await expect(page.getByText('Pin 93%', { exact: true })).toBeVisible();
  await expect(
    page.getByText('90 ngày', { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(page.getByText('Dữ kiện của đúng máy này', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Kết quả đầy đủ', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Xem toàn bộ kết quả kiểm tra', { exact: true })).toHaveCount(0);

  const conditionSummary = page.getByLabel('Tình trạng của máy');
  await expect(conditionSummary).toBeVisible();
  await expect(conditionSummary.locator('[data-condition-key]')).toHaveCount(3);
  await expect(conditionSummary.getByText('Ngoại hình', { exact: true })).toBeVisible();
  await expect(conditionSummary.getByText('Lịch sử sửa chữa', { exact: true })).toBeVisible();

  await expect(page.locator('[data-specification-group="configuration"]')).toBeVisible();
  await expect(page.locator('[data-specification-group="unit"]')).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Cấu hình' })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 3, name: 'Thông tin riêng của máy' }),
  ).toBeVisible();

  await expect(page.getByText('Kiểm tra trước khi bán', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Máy đã được kiểm tra kỹ thuật' }),
  ).toBeVisible();
  await expect(
    page.getByText('Các kết quả tiêu biểu dưới đây được ghi nhận riêng cho máy mã IP14P-128-001.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/\b5\/18\b/)).toHaveCount(0);
  await expect(page.getByText(/18 hạng mục/i)).toHaveCount(0);
  await expect(page.locator('[data-inspection-summary-check]')).toHaveCount(5);
  await expect(page.locator('[data-inspection-check]')).toHaveCount(0);
}

async function expectPublicRouteMarker(
  page: Page,
  path: (typeof PUBLIC_ROUTES)[number],
): Promise<void> {
  switch (path) {
    case '/':
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: HOME_HEADING,
          exact: true,
        }),
      ).toBeVisible();
      return;
    case '/products':
      await expect(
        page.getByRole('heading', { level: 1, name: 'Tìm iPhone và phụ kiện' }),
      ).toBeVisible();
      return;
    case MODEL_PATH:
      await expect(page.locator(`main a[href="${EXACT_UNIT_PATH}"]`).first()).toBeVisible();
      return;
    case EXACT_UNIT_PATH:
      await expect(
        page.getByText('Ảnh thật · Mã máy IP14P-128-001', { exact: true }),
      ).toBeVisible();
      return;
    case '/store':
      await expect(
        page.locator('main address').filter({
          hasText: '123 Đường Demo, TP. Hồ Chí Minh',
        }),
      ).toHaveCount(1);
      return;
    case '/vouchers':
      await expect(page.getByText('WELCOME100', { exact: true })).toBeVisible();
  }
}

async function loginCustomer(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('customer@rephone.local');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('CustomerDemo123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL('/');
}

async function expectNoSeriousAccessibilityViolations(page: Page, route: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .exclude('nextjs-portal')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const violations = results.violations
    .filter(({ impact }) => impact === 'serious' || impact === 'critical')
    .map(({ id, impact, nodes }) => ({
      id,
      impact,
      nodes: nodes.length,
      route,
      targets: nodes.map(({ target }) => target),
    }));

  expect(violations).toEqual([]);
}

async function stabilizeVisualPage(page: Page): Promise<void> {
  await page.evaluate(async () => document.fonts.ready);
  await page.addStyleTag({
    content: `
      nextjs-portal,
      [data-shell='storefront'] > a[href^='#'] {
        display: none !important;
      }

      [data-shell='storefront'] > header {
        position: static !important;
      }
    `,
  });
}
