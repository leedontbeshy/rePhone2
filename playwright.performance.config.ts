import { defineConfig, devices } from '@playwright/test';

const webOrigin = 'http://127.0.0.1:3001';
const apiBaseUrl = 'http://127.0.0.1:4001/api/v1';

export default defineConfig({
  testDir: './tests/performance',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  outputDir: '.local/performance-results',
  use: {
    baseURL: webOrigin,
    ...devices['Desktop Chrome'],
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium-performance', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'pnpm --filter @rephone/api exec tsx test/browser/test-server.ts',
      url: 'http://127.0.0.1:4001/health/ready',
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @rephone/web exec next start -p 3001',
      env: {
        NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
        API_INTERNAL_BASE_URL: apiBaseUrl,
      },
      url: `${webOrigin}/products/iphone-14-pro`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
