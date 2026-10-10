import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';
import { installDeterministicPublicMedia } from './support/deterministic-public-media';
import { stabilizeVisualPage } from './support/stabilize-visual-page';

const MODEL_PATH = '/products/iphone-14-pro';
const EXACT_UNIT_PATH = `${MODEL_PATH}/units/IP14P-128-001`;
const SOLD_OUT_MODEL_PATH = '/products/iphone-15-pro';
const UNAVAILABLE_MODEL_PATH = '/products/iphone-13';
const UNAVAILABLE_UNIT_PATH = `${UNAVAILABLE_MODEL_PATH}/units/IP13-NOT-FOUND`;
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
  test.beforeEach(async ({ context }) => {
    await installDeterministicPublicMedia(context);
  });

  test(bt('browser:storefront-discovery', 'public-six-surfaces'), async ({ page }) => {
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

  test(bt('browser:storefront-discovery', 'header-balance'), async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/store');
    await expectPublicRouteMarker(page, '/store');

    const header = page.locator("[data-shell='storefront'] > header");
    const primaryRow = header.locator(':scope > div').first();
    const desktopNavigation = header.getByRole('navigation', { name: 'Điều hướng chính' });
    const navigationList = desktopNavigation.locator('ul');
    const currentStoreLink = desktopNavigation.getByRole('link', {
      name: 'Liên hệ',
      exact: true,
    });

    await expect(currentStoreLink).toHaveAttribute('aria-current', 'page');
    await expect(desktopNavigation.getByRole('link').first()).toHaveCSS('font-size', '18px');

    const [primaryRowBox, navigationBox, navigationListBox] = await Promise.all([
      primaryRow.boundingBox(),
      desktopNavigation.boundingBox(),
      navigationList.boundingBox(),
    ]);
    expect(primaryRowBox?.height).toBeGreaterThanOrEqual(80);
    expect(navigationBox?.height).toBeGreaterThanOrEqual(56);
    expect(navigationBox).not.toBeNull();
    expect(navigationListBox).not.toBeNull();
    if (navigationBox === null || navigationListBox === null) {
      throw new Error('Desktop storefront navigation was not measurable.');
    }
    expect(
      Math.abs(
        navigationBox.x +
          navigationBox.width / 2 -
          (navigationListBox.x + navigationListBox.width / 2),
      ),
    ).toBeLessThanOrEqual(1);

    const itemGaps = await navigationList.locator('li').evaluateAll((items) =>
      items.slice(1).map((item, index) => {
        const previous = items[index]?.getBoundingClientRect();
        const current = item.getBoundingClientRect();
        return previous === undefined ? 0 : current.left - previous.right;
      }),
    );
    expect(Math.max(...itemGaps) - Math.min(...itemGaps)).toBeLessThanOrEqual(1);

    const callAction = page.getByRole('link', { name: 'Gọi cửa hàng', exact: true });
    const mapAction = page.getByRole('link', { name: 'Mở bản đồ', exact: true });
    await expect(callAction).toHaveAttribute('href', 'tel:0900000000');
    await expect(callAction).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(callAction).toHaveCSS('background-color', 'rgb(0, 124, 159)');
    await expect(mapAction).toHaveAttribute('href', /google\.com\/maps\/search/);
    await expect(mapAction).toHaveAttribute('target', '_blank');
    await expect(mapAction).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.locator('main')).not.toContainText(/\b(?:pickup|checkout|catalog)\b/i);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileMenuTrigger = page.getByRole('button', { name: 'Mở danh mục', exact: true });
    await expect(mobileMenuTrigger).toBeVisible();
    await mobileMenuTrigger.click();

    const mobileNavigation = page.getByRole('navigation', { name: 'Danh mục sản phẩm' });
    await expect(mobileNavigation).toBeVisible();
    await expect(
      mobileNavigation.getByRole('link', { name: 'Liên hệ', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(mobileNavigation.getByRole('link', { name: 'Ưu đãi', exact: true })).toBeVisible();
  });

  test(bt('browser:storefront-discovery', 'search-suggestions-keyboard'), async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const search = page.getByRole('combobox', { name: 'Tìm iPhone hoặc phụ kiện', exact: true });
    await search.fill('iPhone 17');

    const listbox = page.getByRole('listbox', { name: 'Gợi ý sản phẩm', exact: true });
    const suggestions = listbox.locator('a[role="option"]');
    await expect(listbox).toBeVisible();
    await expect(suggestions.first()).toContainText('iPhone 17');

    await search.press('Escape');
    await expect(search).toHaveAttribute('aria-expanded', 'false');
    await expect(listbox).toHaveCount(0);

    const firstSuggestion = suggestions.first();
    await search.press('ArrowDown');
    await expect(listbox).toBeVisible();
    const [suggestionId, suggestionHref] = await Promise.all([
      firstSuggestion.getAttribute('id'),
      firstSuggestion.getAttribute('href'),
    ]);
    expect(suggestionId).not.toBeNull();
    expect(suggestionHref).toMatch(/^\/products\/iphone-17/);
    await expect(search).toHaveAttribute('aria-activedescendant', suggestionId ?? '');

    await search.press('Enter');
    await expect(page).toHaveURL(suggestionHref ?? '/products');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('iPhone 17');
  });

  test(bt('browser:storefront-discovery', 'keyboard-interactions'), async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const menuTrigger = page.getByRole('button', { name: 'Mở danh mục', exact: true });
    await menuTrigger.focus();
    await page.keyboard.press('Enter');

    const mobileDialog = page.getByRole('dialog', { name: 'Danh mục', exact: true });
    const closeMenu = mobileDialog.getByRole('button', { name: 'Đóng', exact: true });
    await expect(mobileDialog).toBeVisible();
    await expect(closeMenu).toBeFocused();

    const overlayBox = await mobileDialog.locator('..').boundingBox();
    expect(overlayBox).not.toBeNull();
    expect(overlayBox?.x).toBe(0);
    expect(overlayBox?.y).toBe(0);
    expect(overlayBox?.width).toBe(390);
    expect(overlayBox?.height).toBe(844);

    await page.keyboard.press('Shift+Tab');
    expect(await mobileDialog.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(
      true,
    );
    await page.keyboard.press('Tab');
    await expect(closeMenu).toBeFocused();

    const mobileSearch = mobileDialog.getByRole('combobox', {
      name: 'Tìm iPhone hoặc phụ kiện',
      exact: true,
    });
    await mobileSearch.fill('iPhone 17');
    const mobileSuggestions = mobileDialog.getByRole('listbox', {
      name: 'Gợi ý sản phẩm',
      exact: true,
    });
    await expect(mobileSuggestions).toBeVisible();
    const suggestionBox = await mobileSuggestions.boundingBox();
    expect(suggestionBox).not.toBeNull();
    expect(suggestionBox?.height).toBeGreaterThan(0);
    expect((suggestionBox?.y ?? 844) + (suggestionBox?.height ?? 0)).toBeLessThanOrEqual(844);

    await page.keyboard.press('Escape');
    await expect(mobileDialog).toHaveCount(0);
    await expect(menuTrigger).toBeFocused();

    await page.goto('/products');
    const filterTrigger = page.getByRole('button', {
      name: 'Bộ lọc và sắp xếp',
      exact: true,
    });
    await filterTrigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(filterTrigger).toBeFocused();

    await page.goto(EXACT_UNIT_PATH);
    const galleryTrigger = page.getByRole('button', {
      name: 'Mở ảnh ở kích thước lớn',
      exact: true,
    });
    await galleryTrigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(galleryTrigger).toBeFocused();
  });

  test(bt('browser:storefront-discovery', 'accessory-card-alignment'), async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/products?productType=ACCESSORY&inStock=true');

    const accessoryActions = page.getByRole('link', { name: 'Xem phụ kiện', exact: true });
    expect(await accessoryActions.count()).toBeGreaterThanOrEqual(3);
    await expect(accessoryActions.first()).toBeVisible();

    type AccessoryCardPosition = {
      actionBottom: number;
      cardBottom: number;
      cardTop: number;
    };
    const positions: AccessoryCardPosition[] = await accessoryActions.evaluateAll((actions) =>
      actions.map((action) => {
        const card = action.closest('article');
        if (card === null) throw new Error('Accessory action is not inside a product card.');
        return {
          actionBottom: action.getBoundingClientRect().bottom,
          cardBottom: card.getBoundingClientRect().bottom,
          cardTop: card.getBoundingClientRect().top,
        };
      }),
    );
    const rows: AccessoryCardPosition[][] = [];
    for (const position of positions) {
      const matchingRow = rows.find((row) =>
        row.some(({ cardTop }) => Math.abs(cardTop - position.cardTop) <= 1),
      );
      if (matchingRow === undefined) rows.push([position]);
      else matchingRow.push(position);
    }
    expect(rows.some((row) => row.length >= 3)).toBe(true);

    for (const row of rows) {
      if (row.length < 2) continue;
      const actionBottoms = row.map(({ actionBottom }) => actionBottom);
      const cardBottoms = row.map(({ cardBottom }) => cardBottom);
      expect(Math.max(...actionBottoms) - Math.min(...actionBottoms)).toBeLessThanOrEqual(1);
      expect(Math.max(...cardBottoms) - Math.min(...cardBottoms)).toBeLessThanOrEqual(1);
    }
  });

  test(bt('browser:storefront-discovery', 'url-filter-history'), async ({ page }) => {
    await page.goto(
      '/products?productType=IPHONE&storageCapacityGb=128&pageSize=1&sortBy=name&sortOrder=asc',
    );

    const filterForm = page.locator('form:has(#desktop-catalog-type)');
    await expect(filterForm).toHaveCount(1);
    await expect(filterForm.locator('select[name="productType"]')).toHaveValue('IPHONE');
    await expect(filterForm.locator('select[name="storageCapacityGb"]')).toHaveValue('128');

    const nextPage = page.locator('nav[aria-label="Phân trang danh mục sản phẩm"] a').filter({
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

  test(bt('browser:storefront-discovery', 'ssr-contracts'), async ({ browser }) => {
    await expectServerRenderedPublicRoutes(browser);
  });

  test(bt('browser:storefront-discovery', 'public-unit-safety'), async ({ page }) => {
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

  test(bt('browser:storefront-discovery', 'account-voucher'), async ({ browser }) => {
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

  test(bt('browser:storefront-discovery', 'a11y-mobile'), async ({ page }) => {
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

    await page.goto('/products');
    const filterTrigger = page.getByRole('button', { name: 'Bộ lọc và sắp xếp', exact: true });
    await filterTrigger.click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(filterTrigger).toBeFocused();

    await page.goto(EXACT_UNIT_PATH);
    const galleryTrigger = page.getByRole('button', {
      name: 'Mở ảnh ở kích thước lớn',
      exact: true,
    });
    await galleryTrigger.click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.getByRole('button', { name: 'Đóng ảnh phóng lớn', exact: true }).click();
    await expect(galleryTrigger).toBeFocused();
  });

  test(bt('browser:storefront-discovery', 'responsive-route-matrix'), async ({ context }) => {
    test.setTimeout(180_000);
    for (const viewport of [
      { width: 320, height: 900 },
      { width: 768, height: 1024 },
      { width: 1024, height: 900 },
      { width: 1440, height: 900 },
    ] as const) {
      const page = await context.newPage();
      try {
        await page.setViewportSize(viewport);

        for (const path of PUBLIC_ROUTES) {
          await test.step(`${String(viewport.width)}px · ${path}`, async () => {
            await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 30_000 });
            await expectPublicRouteMarker(page, path);
            await expect(page.locator('main')).toHaveCount(1);
            await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
            await expectPublicPrimaryAction(page, path);

            const dimensions = await page.evaluate(() => ({
              clientWidth: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
            }));
            expect(
              dimensions.scrollWidth,
              `${path} overflows the ${String(viewport.width)}px viewport`,
            ).toBeLessThanOrEqual(dimensions.clientWidth);
          });
        }
      } finally {
        await page.close();
      }
    }
  });

  test(bt('browser:storefront-discovery', 'mobile-generation-shelf'), async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');

    const shelf = page.getByLabel('Các dòng máy thuộc iPhone 15', { exact: true });
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

  test(bt('browser:storefront-discovery', 'footer-links'), async ({ page }) => {
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

  test(bt('browser:storefront-discovery', 'skip-navigation'), async ({ page }) => {
    await page.goto(EXACT_UNIT_PATH);
    await page.keyboard.press('Tab');

    const skipLink = page.getByRole('link', {
      name: 'Chuyển đến nội dung chính',
      exact: true,
    });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
  });

  test(bt('browser:storefront-discovery', 'unavailable-unit-recovery'), async ({ page }) => {
    const response = await page.goto(UNAVAILABLE_UNIT_PATH);

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Chiếc máy này hiện không còn bán' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Xem các máy cùng dòng' })).toHaveAttribute(
      'href',
      UNAVAILABLE_MODEL_PATH,
    );
  });

  test(bt('browser:storefront-discovery', 'mobile-purchase-footer'), async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(EXACT_UNIT_PATH);

    const purchaseActions = page.locator('#unit-purchase-actions');
    await purchaseActions.scrollIntoViewIfNeeded();
    await expect(purchaseActions).toBeInViewport();
    await page.getByRole('region', { name: 'Thông tin chi tiết' }).scrollIntoViewIfNeeded();
    await expect(purchaseActions).not.toBeInViewport();
    await expect(page.locator('footer')).not.toBeInViewport();
    await expect(page.getByRole('complementary', { name: 'Mua máy này' })).toBeVisible();

    await page.locator('footer').scrollIntoViewIfNeeded();
    await expect(page.getByRole('complementary', { name: 'Mua máy này' })).toHaveCount(0);
  });

  test(bt('browser:storefront-discovery', 'model-unit-visual'), async ({ page }) => {
    for (const viewport of [
      { name: 'desktop-1440', width: 1440, height: 900 },
      { name: 'mobile-390', width: 390, height: 844 },
    ] as const) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await page.goto(MODEL_PATH);
      await expect(page.getByRole('heading', { level: 1, name: 'iPhone 14 Pro' })).toBeVisible();
      await expect(page.getByText('Ảnh minh họa dòng máy', { exact: true })).toBeVisible();
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
  await expect(page.getByText('Ngoại hình loại A', { exact: true }).first()).toBeVisible();
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

async function expectPublicPrimaryAction(
  page: Page,
  path: (typeof PUBLIC_ROUTES)[number],
): Promise<void> {
  switch (path) {
    case '/':
      await expect(page.locator(`main a[href="${SOLD_OUT_MODEL_PATH}"]`).first()).toBeVisible();
      return;
    case '/products':
      await expect(page.locator('main article a[href^="/products/"]').first()).toBeVisible();
      return;
    case MODEL_PATH:
      await expect(page.locator(`main a[href="${EXACT_UNIT_PATH}"]`).first()).toBeVisible();
      return;
    case EXACT_UNIT_PATH:
      await expect(
        page.locator('main').getByRole('button', { name: 'Thêm vào giỏ', exact: true }).first(),
      ).toBeVisible();
      return;
    case '/store':
      await expect(
        page.locator('main').getByRole('link', { name: 'Gọi cửa hàng', exact: true }),
      ).toBeVisible();
      return;
    case '/vouchers':
      await expect(
        page.locator('main').getByRole('link', { name: 'Đăng nhập', exact: true }),
      ).toBeVisible();
  }
}

async function loginCustomer(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill('customer@rephone.local');
  await page.locator('#password').fill('CustomerDemo123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL('/account');
}

async function expectNoSeriousAccessibilityViolations(page: Page, route: string): Promise<void> {
  await expect(page).toHaveTitle(/rePhone/);
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
