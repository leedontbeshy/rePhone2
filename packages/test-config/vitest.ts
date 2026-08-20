import { defineConfig } from 'vitest/config';

export const sharedVitestConfig = defineConfig({
  test: {
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    passWithNoTests: true,
  },
});
