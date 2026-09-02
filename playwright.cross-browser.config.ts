import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: '.local/playwright-cross-browser-report' }],
  ],
  outputDir: '.local/playwright-cross-browser-results',
  projects: [
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
