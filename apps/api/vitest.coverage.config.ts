import { mergeConfig } from 'vitest/config';
import { sharedVitestConfig } from '@rephone/test-config';

export default mergeConfig(sharedVitestConfig, {
  test: {
    name: 'coverage',
    include: ['src/**/*.spec.ts', 'test/integration/**/*.spec.ts', 'test/e2e/**/*.spec.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage/release',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/main.ts', 'src/openapi/**', '**/*.spec.ts'],
      thresholds: {
        statements: 75,
        branches: 75,
        functions: 75,
        lines: 75,
        'src/modules/audit/audit-sanitizer.ts': { branches: 90 },
        'src/modules/auth/auth-maintenance.service.ts': { branches: 90 },
        'src/modules/cart/guest-cart-maintenance.service.ts': { branches: 90 },
        'src/modules/notifications/notification-delivery.service.ts': { branches: 90 },
        'src/modules/payment-operations/overdue-payment-review-reporter.service.ts': {
          branches: 90,
        },
        'src/modules/settings/settings.service.ts': { branches: 90 },
        'src/modules/user-operations/user-operations.service.ts': { branches: 90 },
      },
    },
  },
});
