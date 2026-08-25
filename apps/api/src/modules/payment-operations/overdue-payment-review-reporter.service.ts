import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { PaymentClock } from './payment-clock.service.js';
import { PaymentOperationsRepository } from './payment-operations.repository.js';

const JOB_NAME = 'reportOverduePaymentReviews';

export interface OverduePaymentReviewRunResult {
  scanned: number;
  reported: number;
  failed: number;
  skippedOverlap: boolean;
}

@Injectable()
export class OverduePaymentReviewReporter {
  private readonly logger = new Logger(OverduePaymentReviewReporter.name);
  private running = false;

  public constructor(
    @Inject(PaymentOperationsRepository)
    private readonly payments: PaymentOperationsRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PaymentClock) private readonly clock: PaymentClock,
  ) {}

  public async report(now = this.clock.now()): Promise<OverduePaymentReviewRunResult> {
    const runId = randomUUID();
    const requestId = `job:${JOB_NAME}:${runId}`;
    const startedAt = Date.now();
    if (this.running) {
      this.logger.warn({ event: 'job.skipped_overlap', job: JOB_NAME, runId, requestId });
      return { scanned: 0, reported: 0, failed: 0, skippedOverlap: true };
    }

    this.running = true;
    this.logger.log({
      event: 'job.started',
      job: JOB_NAME,
      runId,
      requestId,
      batchSize: this.config.scheduler.batchSize,
    });
    try {
      const candidates = await this.payments.findOverdueReviewCandidates(
        now,
        this.config.scheduler.batchSize,
      );
      let reported = 0;
      let failed = 0;
      for (const candidate of candidates) {
        try {
          this.logger.warn({
            event: 'payment.review_overdue',
            job: JOB_NAME,
            runId,
            requestId,
            paymentId: candidate.id,
            orderId: candidate.orderId,
            reviewDueAt: candidate.reviewDueAt.toISOString(),
          });
          reported += 1;
        } catch (error) {
          failed += 1;
          this.logger.error({
            event: 'job.record_failed',
            job: JOB_NAME,
            runId,
            requestId,
            paymentId: candidate.id,
            orderId: candidate.orderId,
            errorCategory: error instanceof Error ? error.name : 'UnknownError',
          });
        }
      }

      this.logger.log({
        event: 'job.completed',
        job: JOB_NAME,
        runId,
        requestId,
        scanned: candidates.length,
        succeeded: reported,
        noop: 0,
        failed,
        durationMs: Date.now() - startedAt,
      });
      return { scanned: candidates.length, reported, failed, skippedOverlap: false };
    } catch (error) {
      this.logger.error({
        event: 'job.failed',
        job: JOB_NAME,
        runId,
        requestId,
        durationMs: Date.now() - startedAt,
        errorCategory: error instanceof Error ? error.name : 'UnknownError',
      });
      throw error;
    } finally {
      this.running = false;
    }
  }
}
