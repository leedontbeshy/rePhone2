import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';
import { stabilizeVisualPage } from './support/stabilize-visual-page';

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
const GUEST_ORDER_UNIT = {
  code: 'IP15PM-256-001',
  path: '/products/iphone-15-pro-max/units/IP15PM-256-001',
} as const;
const CUSTOMER_UNIT = {
  code: 'IP14P-128-001',
  path: '/products/iphone-14-pro/units/IP14P-128-001',
} as const;
const CUSTOMER_PICKUP_UNIT = {
  code: 'IP13-MID-001',
  path: '/products/iphone-13/units/IP13-MID-001',
} as const;
const COMMERCE_VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 720 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 900 },
  { name: 'laptop-1024', width: 1024, height: 900 },
  { name: 'desktop-1440', width: 1440, height: 1000 },
] as const;

test.describe('FE-03 cart, wishlist and checkout', () => {
  test(bt('browser:cart-checkout', 'guest-shipping-order'), async ({ page }) => {
    await addUnitToCart(page, GUEST_ORDER_UNIT);
    await page.goto('/cart');

    await expect(page.getByRole('heading', { name: 'Kiểm tra sản phẩm đã chọn' })).toBeVisible();
    await expect(page.getByText(`Mã máy: ${GUEST_ORDER_UNIT.code}`, { exact: true })).toBeVisible();
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
    const createResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/checkouts' &&
        response.request().method() === 'POST',
    );

    await page.getByRole('button', { name: 'Đặt hàng', exact: true }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    await page.waitForURL('**/orders/**');
    const orderNumber = orderNumberFrom(page.url());
    await expect(
      page
        .getByRole('heading', { name: 'Nhận hàng', exact: true })
        .locator('..')
        .getByText('Giao tận nơi', { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          (key) => sessionStorage.getItem(key) ?? '',
          `rephone_order_token:${orderNumber}`,
        ),
      )
      .toMatch(/^[A-Za-z0-9_-]{43,}$/);
    expect(new URL(page.url()).hash).toBe('');
  });

  test(bt('browser:cart-checkout', 'customer-pickup-wishlist'), async ({ page }) => {
    await addUnitToCart(page, CUSTOMER_PICKUP_UNIT);
    await login(page, '/cart');

    await expect(
      page.getByText(`Mã máy: ${CUSTOMER_PICKUP_UNIT.code}`, { exact: true }),
    ).toBeVisible();
    await page.goto(CUSTOMER_PICKUP_UNIT.path);
    await page.getByRole('button', { name: 'Lưu máy', exact: true }).click();
    await expect(page.getByText('Đã lưu máy vào danh sách.', { exact: true })).toBeVisible();

    await page.goto('/wishlist');
    const savedCard = page.locator('article').filter({ hasText: CUSTOMER_PICKUP_UNIT.code });
    await expect(savedCard).toBeVisible();
    await expect(
      savedCard.getByRole('button', { name: 'Thêm vào giỏ', exact: true }),
    ).toBeEnabled();
    await savedCard
      .getByRole('button', {
        name: `Xóa iPhone 13 khỏi danh sách ưa thích`,
        exact: true,
      })
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
    const createResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/checkouts' &&
        response.request().method() === 'POST',
    );

    await page.getByRole('button', { name: 'Đặt hàng', exact: true }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    await page.waitForURL('**/orders/**');
    const orderNumber = orderNumberFrom(page.url());
    await expect(page.getByRole('heading', { name: orderNumber, exact: true })).toBeVisible();
    await expect(
      page
        .getByRole('heading', { name: 'Nhận hàng', exact: true })
        .locator('..')
        .getByText('Nhận tại cửa hàng', { exact: true }),
    ).toBeVisible();
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
      .toBeLessThanOrEqual(8);

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
    await page.getByRole('button', { name: 'Lưu phụ kiện', exact: true }).click();
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

  test(bt('browser:cart-checkout', 'checkout-validation-preview-authority'), async ({ page }) => {
    await addUnitToCart(page, GUEST_UNIT);
    await page.goto('/checkout');
    let previewRequests = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/v1/checkouts/preview'
      ) {
        previewRequests += 1;
      }
    });

    await page.getByRole('button', { name: 'Kiểm tra đơn hàng', exact: true }).click();
    await expect(page.locator('#checkout-fullName')).toBeFocused();
    await expect(page.locator('#checkout-fullName')).toHaveAttribute('aria-invalid', 'true');
    expect(previewRequests).toBe(0);

    await fillContact(page, 'Khách xem trước FE-09', 'preview-fe09@rephone.local');
    await page.getByLabel('Nhận tại cửa hàng').check();
    await page.locator('#checkout-voucher').fill('welcome100');
    await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
    await expect(page.getByText('Mã WELCOME100 sẽ được kiểm tra cùng đơn hàng.')).toBeVisible();

    const previewResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v1/checkouts/preview',
    );
    await page.getByRole('button', { name: 'Kiểm tra đơn hàng', exact: true }).click();
    const previewResponse = await previewResponsePromise;
    expect(previewResponse.status()).toBe(200);
    expect(previewRequests).toBe(1);
    const preview = checkoutPreviewEnvelope(await previewResponse.json()).data;
    const pricing = recordProperty(preview, 'pricing');
    const voucher = recordProperty(preview, 'voucher');
    const fulfillment = recordProperty(preview, 'fulfillmentSummary');
    const pickupStore = recordProperty(fulfillment, 'pickupStore');
    expect(fulfillment['type']).toBe('PICKUP');
    expect(voucher['code']).toBe('WELCOME100');

    const summary = page.getByRole('complementary', { name: 'Đơn hàng của bạn' });
    await expect(
      summary.getByText(`${String(voucher['name'])} (WELCOME100)`, { exact: true }),
    ).toBeVisible();
    await expectSummaryPrice(summary, 'Tạm tính', stringProperty(pricing, 'subtotal'));
    await expectSummaryPrice(summary, 'Giảm giá', stringProperty(pricing, 'voucherDiscountAmount'));
    await expectSummaryPrice(summary, 'Phí giao hàng', stringProperty(pricing, 'shippingFee'));
    await expectSummaryPrice(summary, 'Đặt cọc', stringProperty(pricing, 'depositRequired'));
    await expectSummaryPrice(summary, 'Tổng thanh toán', stringProperty(pricing, 'grandTotal'));
    await expect(
      summary.getByText(`Nhận tại ${stringProperty(pickupStore, 'name')}`, { exact: true }),
    ).toBeVisible();
  });

  test(bt('browser:cart-checkout', 'checkout-conflict-recovery'), async ({ page }) => {
    await addUnitToCart(page, GUEST_UNIT);
    await page.goto('/checkout');
    await fillContact(page, 'Khách xung đột FE-09', 'conflict-fe09@rephone.local');
    await page.getByLabel('Nhận tại cửa hàng').check();
    await requestCheckoutPreview(page);

    let createRequests = 0;
    await page.route('**/api/v1/checkouts', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      createRequests += 1;
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'CONCURRENT_MODIFICATION',
            message: 'Checkout authority changed.',
          },
        }),
      });
    });

    await page.getByRole('button', { name: 'Đặt hàng', exact: true }).evaluate((button) => {
      if (!(button instanceof HTMLButtonElement)) throw new Error('Expected checkout button');
      button.click();
      button.click();
    });
    const conflictAlert = page.getByRole('alert').filter({
      hasText: 'Thông tin vừa thay đổi. Hãy tải lại trang rồi thử lại.',
    });
    await expect(conflictAlert).toBeVisible();
    await expect(conflictAlert).toBeFocused();
    await expect(page.getByRole('button', { name: 'Đặt hàng', exact: true })).toHaveCount(0);
    await expect(page.getByText('Tổng thanh toán', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Kiểm tra đơn hàng', exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(250);
    expect(createRequests).toBe(1);

    const nextPreview = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v1/checkouts/preview',
    );
    await page.getByRole('button', { name: 'Kiểm tra đơn hàng', exact: true }).click();
    expect((await nextPreview).status()).toBe(200);
    await expect(page.getByRole('button', { name: 'Đặt hàng', exact: true })).toBeVisible();
  });

  test(bt('browser:cart-checkout', 'checkout-uncertain-manual-replay'), async ({ page }) => {
    await loginAs(page, CUSTOMER, '/wishlist');
    await clearCart(page);
    await addAccessoryToCart(page, 1);
    await page.goto('/checkout');
    await fillContact(page, 'Khách phục hồi FE-09', 'recover-fe09@rephone.local');
    await page.getByLabel('Nhận tại cửa hàng').check();
    await requestCheckoutPreview(page);

    let createRequests = 0;
    let createdOrderNumber = '';
    await page.route('**/api/v1/checkouts', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      createRequests += 1;
      if (createRequests === 1) {
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        const payload = checkoutCreateEnvelope(await response.json());
        createdOrderNumber = stringProperty(recordProperty(payload, 'order'), 'orderNumber');
        await route.abort('failed');
        return;
      }
      await route.continue();
    });

    await page.getByRole('button', { name: 'Đặt hàng', exact: true }).evaluate((button) => {
      if (!(button instanceof HTMLButtonElement)) throw new Error('Expected checkout button');
      button.click();
      button.click();
    });
    await expect(page.getByText('Chưa nhận được xác nhận đơn hàng', { exact: true })).toBeVisible();
    const recoverButton = page.getByRole('button', {
      name: 'Kiểm tra trạng thái đơn hàng',
      exact: true,
    });
    await expect(recoverButton).toBeVisible();
    await page.waitForTimeout(300);
    expect(createRequests).toBe(1);
    expect(createdOrderNumber).not.toBe('');
    await recoverButton.evaluate((button) => {
      if (!(button instanceof HTMLButtonElement)) throw new Error('Expected recovery button');
      button.click();
      button.click();
    });
    await page.waitForURL(`/orders/${createdOrderNumber}`);
    expect(createRequests).toBe(2);
  });

  test(bt('browser:cart-checkout', 'commerce-responsive-visual'), async ({ browser }) => {
    test.setTimeout(240_000);
    const commerceViolations: string[] = [];
    const cartContext = await browser.newContext();
    const cartPage = await cartContext.newPage();
    await addUnitToCart(cartPage, GUEST_UNIT);
    for (const viewport of COMMERCE_VIEWPORTS) {
      await cartPage.setViewportSize(viewport);
      await cartPage.goto('/cart');
      await expect(cartPage.getByText(`Mã máy: ${GUEST_UNIT.code}`, { exact: true })).toBeVisible();
      await expect(cartPage.getByLabel('Giỏ hàng, 1 sản phẩm')).toBeVisible();
      await prepareVisualSnapshot(cartPage);
      commerceViolations.push(
        ...(await inspectCommerceSurface(cartPage, `cart populated ${viewport.name}`)),
      );
      await expect(cartPage).toHaveScreenshot(`fe3-cart-populated-${viewport.name}.png`, {
        animations: 'disabled',
        caret: 'hide',
        fullPage: true,
      });
    }
    await cartContext.close();

    const wishlistContext = await browser.newContext();
    const wishlistPage = await wishlistContext.newPage();
    await loginAs(wishlistPage, CUSTOMER, '/wishlist');
    await clearWishlist(wishlistPage);
    await addUnitToWishlist(wishlistPage, GUEST_UNIT);
    for (const viewport of COMMERCE_VIEWPORTS) {
      await wishlistPage.setViewportSize(viewport);
      await wishlistPage.goto('/wishlist');
      await expect(
        wishlistPage.getByText(`Mã máy: ${GUEST_UNIT.code}`, { exact: true }),
      ).toBeVisible();
      await expect(wishlistPage.getByLabel('Giỏ hàng, 0 sản phẩm')).toBeVisible();
      await prepareVisualSnapshot(wishlistPage);
      commerceViolations.push(
        ...(await inspectCommerceSurface(wishlistPage, `wishlist populated ${viewport.name}`)),
      );
      await expect(wishlistPage).toHaveScreenshot(`fe3-wishlist-populated-${viewport.name}.png`, {
        animations: 'disabled',
        caret: 'hide',
        fullPage: true,
      });
    }
    await clearWishlist(wishlistPage);
    await wishlistContext.close();

    const checkoutContext = await browser.newContext();
    const checkoutPage = await checkoutContext.newPage();
    await addUnitToCart(checkoutPage, GUEST_UNIT);
    await checkoutPage.route('**/api/v1/checkouts', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'CONCURRENT_MODIFICATION',
            message: 'Checkout authority changed.',
          },
        }),
      });
    });
    for (const viewport of COMMERCE_VIEWPORTS) {
      await checkoutPage.setViewportSize(viewport);
      await checkoutPage.goto('/checkout');
      await fillContact(checkoutPage, 'Khách ảnh FE-09', 'visual-fe09@rephone.local');
      await checkoutPage.getByLabel('Nhận tại cửa hàng').check();
      await checkoutPage.locator('#checkout-voucher').fill('WELCOME100');
      await checkoutPage.getByRole('button', { name: 'Áp dụng', exact: true }).click();
      await requestCheckoutPreview(checkoutPage);
      await expect(checkoutPage.getByLabel('Giỏ hàng, 1 sản phẩm')).toBeVisible();
      await prepareVisualSnapshot(checkoutPage);
      commerceViolations.push(
        ...(await inspectCommerceSurface(checkoutPage, `checkout preview ${viewport.name}`)),
      );
      await expect(checkoutPage).toHaveScreenshot(`fe3-checkout-preview-${viewport.name}.png`, {
        animations: 'disabled',
        caret: 'hide',
        fullPage: true,
      });

      await checkoutPage.getByRole('button', { name: 'Đặt hàng', exact: true }).click();
      await expect(
        checkoutPage.getByRole('alert').filter({
          hasText: 'Thông tin vừa thay đổi. Hãy tải lại trang rồi thử lại.',
        }),
      ).toBeVisible();
      await prepareVisualSnapshot(checkoutPage);
      commerceViolations.push(
        ...(await inspectCommerceSurface(checkoutPage, `checkout conflict ${viewport.name}`)),
      );
      await expect(checkoutPage).toHaveScreenshot(`fe3-checkout-conflict-${viewport.name}.png`, {
        animations: 'disabled',
        caret: 'hide',
        fullPage: true,
      });
    }
    await checkoutContext.close();
    expect(commerceViolations, 'commerce surfaces must pass responsive and a11y checks').toEqual(
      [],
    );
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

async function addAccessoryToCart(page: Page, quantity: number): Promise<void> {
  await page.goto('/products/cu-sac-usb-c-20w');
  await page.getByRole('spinbutton', { name: 'Số lượng' }).fill(String(quantity));
  await page.getByRole('button', { name: 'Thêm vào giỏ', exact: true }).click();
  await expect(page.getByText('Đã thêm vào giỏ hàng.', { exact: true })).toBeVisible();
}

async function requestCheckoutPreview(page: Page): Promise<Record<string, unknown>> {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v1/checkouts/preview',
  );
  await page.getByRole('button', { name: 'Kiểm tra đơn hàng', exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Đặt hàng', exact: true })).toBeVisible();
  return checkoutPreviewEnvelope(await response.json()).data;
}

async function expectSummaryPrice(
  summary: ReturnType<Page['getByRole']>,
  label: string,
  value: string,
): Promise<void> {
  await expect(summary.getByText(label, { exact: true }).locator('..')).toContainText(
    formatVnd(value),
  );
}

function checkoutCreateEnvelope(value: unknown): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('data' in value) ||
    typeof value.data !== 'object' ||
    value.data === null ||
    Array.isArray(value.data)
  ) {
    throw new Error('Expected checkout create response data');
  }
  return value.data as Record<string, unknown>;
}

function recordProperty(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const property = value[key];
  if (typeof property !== 'object' || property === null || Array.isArray(property)) {
    throw new Error(`Expected ${key} to be an object`);
  }
  return property as Record<string, unknown>;
}

function stringProperty(value: Record<string, unknown>, key: string): string {
  const property = value[key];
  if (typeof property !== 'string') throw new Error(`Expected ${key} to be a string`);
  return property;
}

function orderNumberFrom(url: string): string {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  const orderNumber = parts[parts.length - 1];
  if (orderNumber === undefined || !orderNumber.startsWith('RPH-')) {
    throw new Error(`Expected order detail URL, received ${url}`);
  }
  return decodeURIComponent(orderNumber);
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

async function inspectCommerceSurface(page: Page, label: string): Promise<string[]> {
  const violations: string[] = [];
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (dimensions.scrollWidth > dimensions.clientWidth) {
    violations.push(
      `${label}: horizontal overflow ${String(dimensions.scrollWidth)} > ${String(dimensions.clientWidth)}`,
    );
  }
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  for (const violation of results.violations) {
    if (violation.impact !== 'serious' && violation.impact !== 'critical') continue;
    const targets = violation.nodes.flatMap(({ target }) => target).join(', ');
    violations.push(`${label}: ${violation.id} (${violation.impact}) at ${targets}`);
  }
  return violations;
}

async function prepareVisualSnapshot(page: Page): Promise<void> {
  await stabilizeVisualPage(page);
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  });
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
