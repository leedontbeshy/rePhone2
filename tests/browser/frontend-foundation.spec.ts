import { expect, test } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';
import { installDeterministicPublicMedia } from './support/deterministic-public-media';
import { stabilizeVisualPage } from './support/stabilize-visual-page';

const EXACT_UNIT_PATH = '/products/iphone-14-pro/units/IP14P-128-001';

test.describe('FE-0 frontend foundation baseline', () => {
  test(bt('browser:frontend-foundation', 'exact-unit-visual'), async ({ context, page }) => {
    await installDeterministicPublicMedia(context);

    for (const viewport of [
      { name: 'desktop-1440', width: 1440, height: 900 },
      { name: 'mobile-390', width: 390, height: 844 },
    ] as const) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      if (viewport.name === 'desktop-1440') {
        // Exercise cached/SSR media: the image loads before React can attach onLoad.
        let releaseScripts!: () => void;
        const scriptsReady = new Promise<void>((resolve) => {
          releaseScripts = resolve;
        });
        const scriptsPattern = '**/_next/static/**/*.js';
        await page.route(scriptsPattern, async (route) => {
          await scriptsReady;
          await route.continue();
        });
        const mainImage = page
          .getByRole('button', { name: 'Mở ảnh ở kích thước lớn' })
          .locator('img');
        try {
          await page.goto(EXACT_UNIT_PATH, { waitUntil: 'commit' });
          await expect(mainImage).toBeVisible();
          await expect
            .poll(() =>
              mainImage.evaluate(
                (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
              ),
            )
            .toBe(true);
        } finally {
          releaseScripts();
        }
        await page.waitForLoadState('networkidle');
        await page.unroute(scriptsPattern);
        // Deliberately cross the media fallback's 4-second deadline after hydration.
        await page.waitForTimeout(4_500);
        await expect(mainImage).toBeVisible();
      } else {
        await page.goto(EXACT_UNIT_PATH);
      }
      await expect(
        page.getByText('Ảnh thật · Mã máy IP14P-128-001', { exact: true }),
      ).toBeVisible();
      await stabilizeVisualPage(page);

      await expect(page).toHaveScreenshot(`fe0-exact-unit-${viewport.name}.png`, {
        animations: 'disabled',
        caret: 'hide',
      });
    }
  });

  test(bt('browser:frontend-foundation', 'legacy-keyboard'), async ({ page }) => {
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
