import type { Page } from '@playwright/test';

export async function stabilizeVisualPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0 });
  });
  await page.evaluate(async () => document.fonts.ready);
  await page.locator('img').evaluateAll((images) => {
    for (const image of images) image.loading = 'eager';
  });
  await page.waitForFunction(() =>
    Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0),
  );
  await page.evaluate(async () => {
    await Promise.all(Array.from(document.images, (image) => image.decode()));
  });
  await page.addStyleTag({
    content: `
      nextjs-portal,
      [data-shell] > a[href^='#'] {
        display: none !important;
      }
    `,
  });
}
