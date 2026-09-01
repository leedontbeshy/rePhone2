import { defineConfig, devices } from '@playwright/test';

const webOrigin = 'http://localhost:3001';

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
      command:
        'pnpm exec cross-env NEXT_PUBLIC_API_BASE_URL=http://localhost:4001/api/v1 API_INTERNAL_BASE_URL=http://localhost:4001/api/v1 pnpm --filter @rephone/web exec next dev -p 3001',
      url: `${webOrigin}/login`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
