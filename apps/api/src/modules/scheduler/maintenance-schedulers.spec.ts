import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import type { AuthMaintenanceService } from '../auth/auth-maintenance.service.js';
import type { GuestCartMaintenanceService } from '../cart/guest-cart-maintenance.service.js';
import type { OverduePaymentReviewReporter } from '../payment-operations/overdue-payment-review-reporter.service.js';
import { AuthMaintenanceScheduler } from './auth-maintenance.scheduler.js';
import { GuestCartMaintenanceScheduler } from './guest-cart-maintenance.scheduler.js';
import { OverduePaymentReviewScheduler } from './overdue-payment-review.scheduler.js';

describe('Slice 12 maintenance schedulers', () => {
  it('does not invoke handlers when scheduling is disabled', async () => {
    const markExpired = vi.fn();
    const purgeExpired = vi.fn();
    const report = vi.fn();

    await new GuestCartMaintenanceScheduler(
      { markExpired } as unknown as GuestCartMaintenanceService,
      config(false),
    ).handleTick();
    await new AuthMaintenanceScheduler(
      { purgeExpired } as unknown as AuthMaintenanceService,
      config(false),
    ).handleTick();
    await new OverduePaymentReviewScheduler(
      { report } as unknown as OverduePaymentReviewReporter,
      config(false),
    ).handleTick();

    expect(markExpired).not.toHaveBeenCalled();
    expect(purgeExpired).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it('delegates exactly once when scheduling is enabled', async () => {
    const markExpired = vi.fn().mockResolvedValue(undefined);
    const purgeExpired = vi.fn().mockResolvedValue(undefined);
    const report = vi.fn().mockResolvedValue(undefined);

    await new GuestCartMaintenanceScheduler(
      { markExpired } as unknown as GuestCartMaintenanceService,
      config(true),
    ).handleTick();
    await new AuthMaintenanceScheduler(
      { purgeExpired } as unknown as AuthMaintenanceService,
      config(true),
    ).handleTick();
    await new OverduePaymentReviewScheduler(
      { report } as unknown as OverduePaymentReviewReporter,
      config(true),
    ).handleTick();

    expect(markExpired).toHaveBeenCalledOnce();
    expect(purgeExpired).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledOnce();
  });
});

function config(enabled: boolean): AppConfig {
  return { scheduler: { enabled } } as AppConfig;
}
