import { mergeConfig } from 'vitest/config';
import { sharedVitestConfig } from '@rephone/test-config';

export default mergeConfig(sharedVitestConfig, {
  test: {
    name: 'unit',
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage/unit',
      exclude: ['src/generated/**', 'src/main.ts', 'src/openapi/**'],
    },
  },
});
