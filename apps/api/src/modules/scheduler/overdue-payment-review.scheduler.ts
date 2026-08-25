import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { OverduePaymentReviewReporter } from '../payment-operations/overdue-payment-review-reporter.service.js';

@Injectable()
export class OverduePaymentReviewScheduler {
  public constructor(
    @Inject(OverduePaymentReviewReporter)
    private readonly reporter: OverduePaymentReviewReporter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Cron('*/15 * * * *', { name: 'reportOverduePaymentReviews', timeZone: 'UTC' })
  public async handleTick(): Promise<void> {
    if (!this.config.scheduler.enabled) return;
    await this.reporter.report();
  }
}
