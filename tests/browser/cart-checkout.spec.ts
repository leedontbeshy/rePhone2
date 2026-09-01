import { expect, test, type Page } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';

const CUSTOMER = {
  email: 'customer@rephone.local',
  password: 'CustomerDemo123',
} as const;
const EMPLOYEE = {
  email: 'employee@rephone.local',
  password: 'EmployeeDemo123',
} as const;
const ADMIN = {
  email: 'admin@rephone.local',
  password: 'AdminDemo123',
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

  test(bt('browser:cart-checkout', 'checkout-entry-scroll'), async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    await addUnitToCart(page, GUEST_UNIT);
    await page.goto('/cart');

    await expect(page.getByRole('heading', { name: 'Kiểm tra sản phẩm đã chọn' })).toBeVisible();
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await page.getByRole('link', { name: 'Tiếp tục đặt hàng', exact: true }).click();
    await page.waitForURL('/checkout');

    const checkoutHeading = page.getByRole('heading', { level: 1, name: 'Hoàn tất đơn hàng' });
    await expect(checkoutHeading).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => Math.max(document.documentElement.scrollTop, document.body.scrollTop)),
      )
      .toBeLessThanOrEqual(1);

    const [headerBox, headingBox] = await Promise.all([
      requiredBox(page.getByRole('banner')),
      requiredBox(checkoutHeading),
    ]);
    expect(headingBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);
  });

  test(bt('browser:cart-checkout', 'checkout-summary-fallback-layout'), async ({ page }) => {
    await addUnitToCart(page, GUEST_UNIT);
    await page.route('**/api/v1/cart', async (route) => {
      const requestUrl = new URL(route.request().url());
      if (route.request().method() !== 'GET' || requestUrl.pathname !== '/api/v1/cart') {
        await route.continue();
        return;
      }

      const response = await route.fetch();
      await route.fulfill({ response, json: cartEnvelopeWithoutMedia(await response.json()) });
    });

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 720 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/checkout');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Hoàn tất đơn hàng' }),
      ).toBeVisible();

      const summary = page.getByRole('complementary', { name: 'Đơn hàng của bạn' });
      const summaryItem = summary.locator('article').filter({ hasText: GUEST_UNIT.code });
      const fallback = summaryItem.getByRole('img', { name: 'Ảnh iPhone 14 Pro', exact: true });
      await expect(fallback).toBeVisible();
      await fallback.scrollIntoViewIfNeeded();

      const layout = await fallback.evaluate((element) => {
        const article = element.closest('article');
        const copy = element.nextElementSibling;
        const label = element.querySelector('span');
        if (article === null || copy === null || label === null) {
          throw new Error('Expected the checkout fallback, copy and article layout');
        }
        const fallbackBox = element.getBoundingClientRect();
        const articleBox = article.getBoundingClientRect();
        const copyBox = copy.getBoundingClientRect();
        return {
          articleBottom: articleBox.bottom,
          articleRight: articleBox.right,
          copyLeft: copyBox.left,
          documentClientWidth: document.documentElement.clientWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          fallbackBottom: fallbackBox.bottom,
          fallbackClientHeight: element.clientHeight,
          fallbackClientWidth: element.clientWidth,
          fallbackRight: fallbackBox.right,
          fallbackScrollHeight: element.scrollHeight,
          fallbackScrollWidth: element.scrollWidth,
          labelDisplay: window.getComputedStyle(label).display,
          viewportWidth: window.innerWidth,
        };
      });

      expect(layout.viewportWidth, `${String(viewport.width)}px viewport`).toBe(viewport.width);
      expect(
        layout.documentScrollWidth,
        `${String(viewport.width)}px document overflow`,
      ).toBeLessThanOrEqual(layout.documentClientWidth);
      expect(
        layout.fallbackScrollWidth,
        `${String(viewport.width)}px fallback width`,
      ).toBeLessThanOrEqual(layout.fallbackClientWidth);
      expect(
        layout.fallbackScrollHeight,
        `${String(viewport.width)}px fallback height`,
      ).toBeLessThanOrEqual(layout.fallbackClientHeight);
      expect(layout.fallbackRight).toBeLessThanOrEqual(layout.articleRight + 1);
      expect(layout.fallbackBottom).toBeLessThanOrEqual(layout.articleBottom + 1);
      expect(layout.copyLeft).toBeGreaterThanOrEqual(layout.fallbackRight - 1);
      expect(layout.labelDisplay).toBe('none');
    }
  });

  test(bt('browser:cart-checkout', 'cart-local-loading'), async ({ page }) => {
    await addUnitToCart(page, GUEST_UNIT);
    await page.goto('/cart');

    const cartRow = page.locator('article').filter({ hasText: GUEST_UNIT.code });
    const cartSummary = page.getByRole('complementary', { name: 'Tóm tắt giỏ hàng' });
    await expect(cartRow).toBeVisible();
    await expect(cartSummary).toBeVisible();

    const retryStarted = deferred();
    const releaseRetry = deferred();
    let cartRefreshes = 0;
    await page.route('**/api/v1/cart/items/*', async (route) => {
      if (route.request().method() !== 'DELETE') {
        await route.continue();
        return;
      }
      await route.fulfill({ status: 204, body: '' });
    });
    await page.route('**/api/v1/cart', async (route) => {
      const requestUrl = new URL(route.request().url());
      if (route.request().method() !== 'GET' || requestUrl.pathname !== '/api/v1/cart') {
        await route.continue();
        return;
      }
      cartRefreshes += 1;
      if (cartRefreshes === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'SERVICE_UNAVAILABLE', message: 'Dịch vụ đang tạm gián đoạn.' },
          }),
        });
        return;
      }
      retryStarted.resolve();
      await releaseRetry.promise;
      await route.continue();
    });

    await cartRow.getByRole('button', { name: 'Xóa', exact: true }).click();
    await expect(page.getByText('Chưa thể tải giỏ hàng', { exact: true })).toBeVisible();
    await expect(cartRow).toBeVisible();
    await expect(cartSummary).toBeVisible();

    await page.getByRole('button', { name: 'Tải lại', exact: true }).click();
    await retryStarted.promise;

    const busyCartRegion = page.locator('[aria-busy="true"]:not(button)');
    await expect(busyCartRegion).toHaveCount(1);
    await expect(busyCartRegion).toContainText(GUEST_UNIT.code);
    await expect(busyCartRegion).toContainText('Tóm tắt giỏ hàng');
    await expect(cartRow).toBeVisible();
    await expect(cartSummary).toBeVisible();
    await expect(page.getByLabel('Đang tải giỏ hàng')).toHaveCount(0);

    releaseRetry.resolve();
    await expect(page.getByText('Chưa thể tải giỏ hàng', { exact: true })).toHaveCount(0);
    await expect(busyCartRegion).toHaveCount(0);
    await expect(cartRow).toBeVisible();
    await expect(cartSummary).toBeVisible();
    expect(cartRefreshes).toBe(2);
  });

  test(bt('browser:cart-checkout', 'wishlist-role-state-matrix'), async ({ browser, page }) => {
    const anonymousWishlistRequests = collectWishlistRequests(page);
    await page.goto('/wishlist');
    await expect(
      page.getByRole('heading', { name: 'Đăng nhập để xem sản phẩm ưa thích' }),
    ).toBeVisible();
    expect(anonymousWishlistRequests).toEqual([]);

    for (const account of [EMPLOYEE, ADMIN]) {
      const context = await browser.newContext();
      const staffPage = await context.newPage();
      const staffWishlistRequests = collectWishlistRequests(staffPage);
      await loginAs(staffPage, account, '/backoffice');
      await staffPage.goto('/wishlist');
      await expect(
        staffPage.getByRole('heading', { name: 'Mục này dành cho khách hàng' }),
      ).toBeVisible();
      expect(staffWishlistRequests).toEqual([]);
      await context.close();
    }

    await loginAs(page, CUSTOMER, '/wishlist');
    await clearWishlist(page);
    await expect(page.getByRole('heading', { name: 'Chưa có sản phẩm ưa thích' })).toBeVisible();

    await addUnitToWishlist(page, GUEST_UNIT);
    await page.goto('/wishlist');
    const savedCard = page.locator('article').filter({ hasText: GUEST_UNIT.code });
    await expect(savedCard).toBeVisible();
    await savedCard
      .getByRole('button', { name: `Xóa iPhone 14 Pro khỏi danh sách ưa thích`, exact: true })
      .click();
    await expect(savedCard).toHaveCount(0);

    await page.route('**/api/v1/wishlist', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Dịch vụ đang tạm gián đoạn.' },
        }),
      });
    });
    await page.goto('/wishlist');
    await expect(page.getByText('Chưa thể tải sản phẩm ưa thích', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tải lại', exact: true })).toBeVisible();
    await page.unroute('**/api/v1/wishlist');
    await page.getByRole('button', { name: 'Tải lại', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Chưa có sản phẩm ưa thích' })).toBeVisible();
  });

  test(bt('browser:cart-checkout', 'wishlist-mutation-lifecycle'), async ({ page }) => {
    await loginAs(page, CUSTOMER, '/wishlist');
    await clearWishlist(page);
    await clearCart(page);
    await addUnitToWishlist(page, GUEST_UNIT);
    await page.goto('/wishlist');

    const iphoneCard = page.locator('article').filter({ hasText: GUEST_UNIT.code });
    await expect(iphoneCard).toBeVisible();
    const addStarted = deferred();
    const releaseAdd = deferred();
    await page.route('**/api/v1/cart/items', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      addStarted.resolve();
      await releaseAdd.promise;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Chưa thể thêm sản phẩm lúc này.' },
        }),
      });
    });
    await iphoneCard.getByRole('button', { name: 'Thêm vào giỏ', exact: true }).click();
    await addStarted.promise;
    await expect(
      iphoneCard.getByRole('button', { name: 'Đang thêm vào giỏ hàng', exact: true }),
    ).toHaveAttribute('aria-busy', 'true');
    releaseAdd.resolve();
    await expect(iphoneCard.getByRole('alert')).toContainText(
      'Dịch vụ đang tạm gián đoạn. Vui lòng thử lại sau.',
    );
    await page.unroute('**/api/v1/cart/items');
    await iphoneCard.getByRole('button', { name: 'Thêm vào giỏ', exact: true }).click();
    await expect(iphoneCard.getByText('Đã thêm vào giỏ hàng.', { exact: true })).toBeVisible();

    const removeStarted = deferred();
    const releaseRemove = deferred();
    await page.route('**/api/v1/wishlist/items/*', async (route) => {
      if (route.request().method() !== 'DELETE') {
        await route.continue();
        return;
      }
      removeStarted.resolve();
      await releaseRemove.promise;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Dịch vụ đang tạm gián đoạn.' },
        }),
      });
    });
    await iphoneCard
      .getByRole('button', { name: `Xóa iPhone 14 Pro khỏi danh sách ưa thích`, exact: true })
      .click();
    await removeStarted.promise;
    await expect(
      iphoneCard.getByRole('button', { name: 'Đang xóa sản phẩm', exact: true }),
    ).toHaveAttribute('aria-busy', 'true');
    releaseRemove.resolve();
    await expect(iphoneCard.getByRole('alert')).toContainText(
      'Chưa thể xóa sản phẩm khỏi danh sách.',
    );
    await page.unroute('**/api/v1/wishlist/items/*');
    await iphoneCard
      .getByRole('button', { name: `Xóa iPhone 14 Pro khỏi danh sách ưa thích`, exact: true })
      .click();
    await expect(iphoneCard).toHaveCount(0);

    await page.goto('/products/cu-sac-usb-c-20w');
    await page.getByRole('spinbutton', { name: 'Số lượng' }).fill('3');
    await page.getByRole('button', { name: 'Thêm vào giỏ', exact: true }).click();
    await expect(page.getByText('Đã thêm vào giỏ hàng.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Lưu máy', exact: true }).click();
    await expect(page.getByText('Đã lưu phụ kiện vào danh sách.', { exact: true })).toBeVisible();

    await page.goto('/wishlist');
    const accessoryCard = page.locator('article').filter({ hasText: 'Củ sạc USB-C 20W' });
    const accessoryAddButton = accessoryCard.getByRole('button', {
      name: 'Thêm vào giỏ',
      exact: true,
    });
    await expect(accessoryAddButton).toBeEnabled();
    await accessoryAddButton.click();
    await expect(accessoryCard.getByText('Đã thêm vào giỏ hàng.', { exact: true })).toBeVisible();

    await page.goto('/cart');
    const accessoryRow = page.locator('article').filter({ hasText: 'Củ sạc USB-C 20W' });
    await expect(accessoryRow.getByRole('spinbutton', { name: 'Số lượng phụ kiện' })).toHaveValue(
      '3',
    );
    await clearWishlist(page);
    await clearCart(page);
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
  await loginAs(page, CUSTOMER, returnTo);
}

async function loginAs(
  page: Page,
  credentials: { readonly email: string; readonly password: string },
  returnTo: string,
): Promise<void> {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel('Email').fill(credentials.email);
  await page.locator('#password').fill(credentials.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(returnTo);
}

async function addUnitToWishlist(
  page: Page,
  unit: { readonly code: string; readonly path: string },
): Promise<void> {
  await page.goto(unit.path);
  await expect(page.getByText(`Ảnh thật · Mã máy ${unit.code}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Lưu máy', exact: true }).click();
  await expect(page.getByText('Đã lưu máy vào danh sách.', { exact: true })).toBeVisible();
}

async function clearWishlist(page: Page): Promise<void> {
  await page.goto('/wishlist');
  await expect(page.getByLabel('Đang tải sản phẩm ưa thích')).toHaveCount(0);
  const removeButtons = page.getByRole('button', {
    name: /^Xóa .+ khỏi danh sách ưa thích$/,
  });
  while ((await removeButtons.count()) > 0) {
    const previousCount = await removeButtons.count();
    await removeButtons.first().click();
    await expect(removeButtons).toHaveCount(previousCount - 1);
  }
  await expect(page.getByRole('heading', { name: 'Chưa có sản phẩm ưa thích' })).toBeVisible();
}

async function clearCart(page: Page): Promise<void> {
  await page.goto('/cart');
  await expect(page.getByLabel('Đang tải giỏ hàng')).toHaveCount(0);
  const removeButtons = page.getByRole('button', { name: 'Xóa', exact: true });
  while ((await removeButtons.count()) > 0) {
    const previousCount = await removeButtons.count();
    await removeButtons.first().click();
    await expect(removeButtons).toHaveCount(previousCount - 1);
  }
}

function collectWishlistRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/api/v1/wishlist') && request.method() !== 'OPTIONS') {
      requests.push(`${request.method()} ${pathname}`);
    }
  });
  return requests;
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

async function requiredBox(locator: ReturnType<Page['getByRole']>) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) throw new Error('Expected a rendered element box');
  return box;
}

function cartEnvelopeWithoutMedia(value: unknown): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('data' in value) ||
    typeof value.data !== 'object' ||
    value.data === null ||
    !('items' in value.data) ||
    !Array.isArray(value.data.items)
  ) {
    throw new Error('Expected a cart response envelope');
  }
  return {
    ...value,
    data: {
      ...value.data,
      items: (value.data.items as unknown[]).map((item) =>
        typeof item === 'object' && item !== null ? { ...item, media: null } : item,
      ),
    },
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
