import type { Page } from '@playwright/test';

export const WP11_FIXED_TIME = new Date('2026-09-02T06:30:00.000Z');

export const WP11_RESPONSIVE_VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 844 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'laptop-1024', width: 1024, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 900 },
] as const;

export async function freezeWp11Clock(page: Page): Promise<void> {
  await page.clock.setFixedTime(WP11_FIXED_TIME);
}

export async function installDeterministicWp11CatalogMedia(page: Page): Promise<void> {
  await page.route('https://cdn.example.test/**', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'text/plain',
      body: 'Deterministic unavailable catalog media fixture',
    });
  });
}

export async function stabilizeWp11VisualPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0 });
  });
  await page.evaluate(async () => document.fonts.ready);
  await page.locator('img').evaluateAll((images) => {
    for (const image of images) {
      if (image instanceof HTMLImageElement) image.loading = 'eager';
    }
  });
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete));
  await page.evaluate(async () => {
    await Promise.all(
      Array.from(document.images, async (image) => {
        if (image.naturalWidth > 0) await image.decode();
      }),
    );
  });
  await page.addStyleTag({
    content: `
      nextjs-portal {
        display: none !important;
      }
    `,
  });
}
