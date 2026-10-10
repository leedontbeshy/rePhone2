import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';

test.use({ actionTimeout: 15_000 });

test(bt('browser:affiliate-flow', 'public-program-and-terms'), async ({ page }) => {
  await page.goto('/affiliate');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Giới thiệu iPhone và nhận hoa hồng cùng rePhone.',
  );
  await accessible(page);
  await page.getByRole('link', { name: 'Đăng ký cộng tác viên', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Faffiliate$/);
  await page.goto('/affiliate/terms');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await accessible(page);
});

test(bt('browser:affiliate-flow', 'direct-referral-navigation'), async ({ page }) => {
  const destination = '/products/iphone-13/units/IP13-MID-001';
  await page.route('**/api/v1/affiliate-program/referrals', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Attribution unavailable' },
      }),
    }),
  );
  await page.goto(`/r/0123456789abcdef?to=${encodeURIComponent(destination)}`);
  await expect(page).toHaveURL(new RegExp(`${destination}$`));
  await expect(page.getByRole('main')).toBeVisible();
});

test(bt('browser:affiliate-flow', 'admin-readiness'), async ({ page }) => {
  await page.goto('/login?returnTo=%2Fbackoffice%2Faffiliates');
  await page.getByLabel('Email').fill('admin@rephone.local');
  await page.locator('#password').fill('AdminDemo123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL('/backoffice/affiliates');
  await expect(
    page.getByRole('heading', { name: 'Quản lý cộng tác viên', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chương trình chưa sẵn sàng' })).toBeVisible();
  await accessible(page);
});

async function accessible(page: Page) {
  await expect(page).toHaveTitle(/rePhone/);
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((row) => row.impact === 'serious' || row.impact === 'critical'),
  ).toEqual([]);
}
