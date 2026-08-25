import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { CartRepository } from './cart.repository.js';

const JOB_NAME = 'markExpiredGuestCarts';

export interface GuestCartMaintenanceRunResult {
  scanned: number;
  expired: number;
  failed: number;
  skippedOverlap: boolean;
}

@Injectable()
export class GuestCartMaintenanceService {
  private readonly logger = new Logger(GuestCartMaintenanceService.name);
  private running = false;

  public constructor(
    @Inject(CartRepository) private readonly carts: CartRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public async markExpired(now = new Date()): Promise<GuestCartMaintenanceRunResult> {
    const runId = randomUUID();
    const requestId = `job:${JOB_NAME}:${runId}`;
    const startedAt = Date.now();
    if (this.running) {
      this.logger.warn({ event: 'job.skipped_overlap', job: JOB_NAME, runId, requestId });
      return { scanned: 0, expired: 0, failed: 0, skippedOverlap: true };
    }

    this.running = true;
    this.logger.log({
      event: 'job.started',
      job: JOB_NAME,
      runId,
      requestId,
      batchSize: this.config.scheduler.guestCartBatchSize,
    });
    try {
      const candidates = await this.carts.findExpiredGuestCartCandidates(
        now,
        this.config.scheduler.guestCartBatchSize,
      );
      let expired = 0;
      let noop = 0;
      let failed = 0;
      for (const candidate of candidates) {
        try {
          if (await this.carts.markExpiredGuestCart(candidate.id, now)) {
            expired += 1;
          } else {
            noop += 1;
          }
        } catch (error) {
          failed += 1;
          this.logger.error({
            event: 'job.record_failed',
            job: JOB_NAME,
            runId,
            requestId,
            cartId: candidate.id,
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
        succeeded: expired,
        noop,
        failed,
        durationMs: Date.now() - startedAt,
      });
      return { scanned: candidates.length, expired, failed, skippedOverlap: false };
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
