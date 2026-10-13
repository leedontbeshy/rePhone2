import { defineConfig } from 'vitest/config';

export const sharedVitestConfig = defineConfig({
  test: {
    maxWorkers: 2,
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    passWithNoTests: true,
  },
});
