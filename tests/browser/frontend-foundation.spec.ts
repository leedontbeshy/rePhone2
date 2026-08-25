import { expect, test } from '@playwright/test';
import { installDeterministicPublicMedia } from './support/deterministic-public-media';

const EXACT_UNIT_PATH = '/products/iphone-14-pro/units/IP14P-128-001';

test.describe('FE-0 frontend foundation baseline', () => {
  test('captures the representative exact-unit surface at desktop and mobile', async ({
    context,
    page,
  }) => {
    await installDeterministicPublicMedia(context);

    for (const viewport of [
      { name: 'desktop-1440', width: 1440, height: 900 },
      { name: 'mobile-390', width: 390, height: 844 },
    ] as const) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(EXACT_UNIT_PATH);
      await expect(
        page.getByText('Ảnh thật · Mã máy IP14P-128-001', { exact: true }),
      ).toBeVisible();
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

      await expect(page).toHaveScreenshot(`fe0-exact-unit-${viewport.name}.png`, {
        animations: 'disabled',
        caret: 'hide',
      });
    }
  });

  test('keeps the legacy storefront keyboard reachable during migration', async ({ page }) => {
    await page.goto('/products');
    await expect(page.locator('main')).toHaveCount(1);

    await page.keyboard.press('Tab');

    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
    await expect(focusedElement).toHaveJSProperty('tagName', 'A');

    const focusIndicator = await focusedElement.evaluate((element) => {
      const style = getComputedStyle(element);
      return { boxShadow: style.boxShadow, outlineStyle: style.outlineStyle };
    });
    expect(
      focusIndicator.outlineStyle !== 'none' || focusIndicator.boxShadow !== 'none',
    ).toBeTruthy();
  });
});
