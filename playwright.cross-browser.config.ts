import { defineConfig, devices } from '@playwright/test';
import baseConfig, { createPlaywrightReporters } from './playwright.config';

export default defineConfig({
  ...baseConfig,
  reporter: createPlaywrightReporters('.local/playwright-cross-browser-report'),
  outputDir: '.local/playwright-cross-browser-results',
  projects: [
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
