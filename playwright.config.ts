import { defineConfig, devices } from '@playwright/test';

const webOrigin = 'http://localhost:3001';
const apiBaseUrl = 'http://localhost:4001/api/v1';
const useProductionWebServer = process.env.PLAYWRIGHT_WEB_SERVER === 'production';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: '.local/playwright-report' }]],
  outputDir: '.local/playwright-results',
  use: {
    baseURL: webOrigin,
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'pnpm --filter @rephone/api exec tsx test/browser/test-server.ts',
      url: 'http://localhost:4001/health/ready',
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: useProductionWebServer
        ? 'pnpm --filter @rephone/web exec next start -p 3001'
        : 'pnpm --filter @rephone/web exec next dev -p 3001',
      env: {
        NODE_ENV: useProductionWebServer ? 'production' : 'development',
        NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
        API_INTERNAL_BASE_URL: apiBaseUrl,
        NEXT_PUBLIC_STORE_EMAIL: 'hello@rephone.vn',
        NEXT_PUBLIC_SOCIAL_FACEBOOK_URL: 'https://www.facebook.com/rephone.vn',
        NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL: 'https://www.instagram.com/rephone.vn',
        NEXT_PUBLIC_SOCIAL_TIKTOK_URL: 'https://www.tiktok.com/@rephone.vn',
      },
      url: `${webOrigin}/login`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
