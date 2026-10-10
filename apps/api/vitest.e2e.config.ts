import { mergeConfig } from 'vitest/config';
import { sharedVitestConfig } from '@rephone/test-config';

export default mergeConfig(sharedVitestConfig, {
  test: {
    name: 'e2e',
    include: ['test/e2e/**/*.spec.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20_000,
    // Cold application imports include all commerce modules; business tests stay bounded separately.
    hookTimeout: 60_000,
  },
});
