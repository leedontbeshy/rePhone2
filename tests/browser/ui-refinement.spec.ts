import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';
import { installDeterministicPublicMedia } from './support/deterministic-public-media';

test(
  bt('browser:storefront-discovery', 'homepage-and-toolbar-refinement'),
  async ({ page }, testInfo) => {
    await installDeterministicPublicMedia(page.context());
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    const campaigns = page.getByRole('region', { name: 'Dòng iPhone nổi bật' });
    await expect(campaigns.getByRole('heading')).toHaveText([
      'iPhone 18',
      'iPhone 17',
      'iPhone 16',
    ]);
    const navigation = page.getByRole('navigation', { name: 'Chọn thế hệ iPhone' });
    await expect(navigation.getByRole('link')).toHaveCount(8);
    const stock = page.getByRole('region', { name: 'iPhone đang bán', exact: true });
    expect(await stock.getByRole('article').count()).toBeGreaterThan(0);
    expect(await stock.getByRole('article').count()).toBeLessThanOrEqual(24);
    const featured = page.getByRole('region', { name: 'Máy nổi bật', exact: true });
    expect(await featured.getByRole('article').count()).toBeLessThanOrEqual(10);
    const track = featured.locator('[aria-label$="máy nổi bật"]');
    if ((await featured.getByRole('article').count()) > 5) {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.mouse.move(0, 0);
      await expect
        .poll(() => track.evaluate((element) => element.scrollLeft), { timeout: 7000 })
        .toBeGreaterThan(0);
      await featured.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
      await expect(
        featured.getByRole('button', { name: 'Tự chuyển', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
    }
    const ids = await page
      .locator('[id]')
      .evaluateAll((elements) => elements.map((element) => element.id));
    expect(new Set(ids).size).toBe(ids.length);
    await checkLayout(page);
    await page.screenshot({ path: testInfo.outputPath('home-desktop.png') });
    await featured.screenshot({ path: testInfo.outputPath('featured-desktop.png') });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.mouse.move(0, 0);
    if ((await featured.getByRole('article').count()) > 1) {
      await expect
        .poll(() => track.evaluate((element) => element.scrollLeft), { timeout: 7000 })
        .toBeGreaterThan(0);
      await featured.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
      await expect(
        featured.getByRole('button', { name: 'Tự chuyển', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
    }
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    for (const item of await navigation.getByRole('link').all()) await expect(item).toBeVisible();
    await checkLayout(page);
    await page.screenshot({ path: testInfo.outputPath('home-mobile.png') });
    await page.goto('/products');
    await page.getByRole('button', { name: 'Sẵn hàng', exact: true }).click();
    await expect(page).toHaveURL(/inStock=true/);
    const ram = page.getByRole('button', { name: /^RAM/ });
    await ram.click();
    await page
      .getByRole('group', { name: 'Lọc RAM' })
      .getByRole('button', { name: '6 GB', exact: true })
      .click();
    await expect(page).toHaveURL(/ramGb=6/);
    const storage = page.getByRole('button', { name: /^Bộ nhớ trong/ });
    await storage.click();
    await page
      .getByRole('group', { name: 'Lọc Bộ nhớ trong' })
      .getByRole('button', { name: '128 GB', exact: true })
      .click();
    await expect(page).toHaveURL(/storageCapacityGb=128/);
    await page.getByRole('button', { name: /^Khóa mạng/ }).click();
    await page.getByRole('button', { name: 'Quốc tế', exact: true }).click();
    await expect(page).toHaveURL(/simLockStatus=UNLOCKED/);
    const price = page.getByRole('button', { name: 'Giá', exact: true });
    await price.focus();
    await page.keyboard.press('Enter');
    await page.getByLabel('Giá thấp nhất', { exact: true }).fill('5000000');
    await page.getByLabel('Giá cao nhất', { exact: true }).fill('20000000');
    await checkLayout(page);
    await page.screenshot({ path: testInfo.outputPath('filters-mobile.png') });
    await page.getByRole('button', { name: 'Áp dụng khoảng giá' }).click();
    await expect(price).toBeFocused();
    await expect(page).toHaveURL(/minPrice=5000000/);
    await page.getByRole('button', { name: 'Giá tăng dần' }).click();
    await expect(page).toHaveURL(/sortOrder=asc/);
    await page.getByLabel('Tìm máy', { exact: true }).fill('iPhone 14');
    await page.getByRole('button', { name: 'Tìm', exact: true }).click();
    await expect(page).toHaveURL(/q=iPhone\+14/);
    await page.goBack();
    await expect(page.getByLabel('Tìm máy', { exact: true })).toHaveValue('');
    await page.goto('/products/iphone-14-pro');
    await expect(page.getByText('Camera chính', { exact: true })).toBeVisible();
    await expect(page.getByText('ProMotion đến 120 Hz', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Giá, pin và tình trạng thuộc riêng từng mã máy.', { exact: true }),
    ).toHaveCount(0);
    await checkLayout(page);
  },
);

test(bt('browser:inventory-stock', 'featured-and-code-lookup'), async ({ page }) => {
  const response = await page.request.get('http://localhost:4001/api/v1/products/units?limit=30');
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { data: { unit: { inventoryCode: string } }[] };
  const code = body.data[body.data.length - 1]?.unit.inventoryCode;
  if (code === undefined) throw new Error('Expected a public inventory unit');
  await login(page, 'EMPLOYEE', `/backoffice/inventory/units?q=${encodeURIComponent(code)}`);
  await page.getByRole('button', { name: `Chọn nổi bật ${code}`, exact: true }).click();
  await expect(
    page.getByRole('button', { name: `Bỏ nổi bật ${code}`, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: `Bỏ nổi bật ${code}`, exact: true })).toBeVisible();
  await page.goto('/');
  await expect(
    page.getByRole('region', { name: 'Máy nổi bật', exact: true }).getByRole('article').first(),
  ).toContainText(code);
  await page.goto('/backoffice/inventory/lookup');
  await page.getByLabel('Loại mã', { exact: true }).selectOption('INVENTORY_CODE');
  await page.getByLabel('Mã máy').fill(code.toLowerCase());
  await page.getByRole('button', { name: 'Tra cứu', exact: true }).click();
  await expect(page.locator('section[aria-live="polite"]')).toContainText(code);
  await expect(page.getByRole('link', { name: 'Mở hồ sơ máy' })).toBeVisible();
  await page.goto(`/backoffice/inventory/units?q=${encodeURIComponent(code)}`);
  await page.getByRole('button', { name: `Bỏ nổi bật ${code}`, exact: true }).click();
  await expect(
    page.getByRole('button', { name: `Chọn nổi bật ${code}`, exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
});

test(
  bt('browser:system-admin-health', 'financial-and-partner-settings'),
  async ({ page, browser }, testInfo) => {
    await login(page, 'ADMIN', '/backoffice');
    await expect(
      page.getByRole('heading', { name: 'Báo cáo tài chính', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Vốn tồn kho hiện tại', exact: true }),
    ).toBeVisible();
    await page.getByLabel('Tháng báo cáo', { exact: true }).fill('2026-08');
    await expect(page.getByText('Tháng 08/2026 · VND', { exact: true })).toBeVisible();
    await checkLayout(page);
    await page.screenshot({ path: testInfo.outputPath('financial-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await checkLayout(page);
    await page.screenshot({ path: testInfo.outputPath('financial-mobile.png') });
    const employee = await browser.newPage();
    try {
      await login(employee, 'EMPLOYEE', '/backoffice');
      await expect(
        employee.getByRole('heading', { name: 'Doanh thu sau hoàn', exact: true }),
      ).toBeVisible();
      await expect(
        employee.getByRole('heading', { name: 'Vốn tồn kho hiện tại', exact: true }),
      ).toHaveCount(0);
      await expect(
        employee.getByRole('heading', { name: 'Lãi gộp tạm tính', exact: true }),
      ).toHaveCount(0);
    } finally {
      await employee.close();
    }
    let affiliateEnabled = false;
    let policyWrite: unknown;
    await page.route('**/api/v1/backoffice/affiliates/policy', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fallback();
      if (route.request().method() === 'POST') {
        policyWrite = route.request().postDataJSON() as unknown;
        affiliateEnabled = true;
      }
      await route.fulfill({
        json: {
          data: {
            ready: true,
            enabled: affiliateEnabled,
            rateBps: 200,
            reserveAmount: '100000',
            minimumProfit: '200000',
            version: affiliateEnabled ? 8 : 7,
          },
        },
        headers: {
          'access-control-allow-origin': 'http://localhost:3001',
          'access-control-allow-credentials': 'true',
        },
      });
    });
    await page.goto('/backoffice/settings');
    await expect(
      page.getByRole('heading', { name: 'Kênh bán hàng & đối tác', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Bật cộng tác viên', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Tạm tắt cộng tác viên', exact: true }),
    ).toBeVisible();
    expect(policyWrite).toEqual({
      enabled: true,
      rateBps: 200,
      reserveAmount: '100000',
      minimumProfit: '200000',
      expectedVersion: 7,
    });
    await checkLayout(page);
    await page.screenshot({ path: testInfo.outputPath('partner-settings-mobile.png') });
    await page.goto('/backoffice/dealers');
    await expect(
      page.getByRole('button', { name: /^(Mở cổng|Tạm đóng cổng) đại lý$/ }),
    ).toHaveCount(0);
    await page.goto('/backoffice/affiliates');
    await expect(page.getByRole('checkbox', { name: /Bật chương trình/ })).toHaveCount(0);
  },
);

async function login(page: Page, role: 'ADMIN' | 'EMPLOYEE', destination: string) {
  await page.goto(`/login?returnTo=${encodeURIComponent(destination)}`);
  await page.getByLabel('Email').fill(`${role.toLowerCase()}@rephone.local`);
  await page.locator('#password').fill(role === 'ADMIN' ? 'AdminDemo123' : 'EmployeeDemo123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(destination);
}
async function checkLayout(page: Page) {
  const width = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(width.content).toBeLessThanOrEqual(width.viewport);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(
    axe.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'),
  ).toEqual([]);
}
