import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { AuthMaintenanceRepository } from './auth-maintenance.repository.js';

const JOB_NAME = 'purgeExpiredAuthRecords';
const RETENTION_MILLISECONDS = 30 * 86_400_000;

export interface AuthMaintenanceRunResult {
  scanned: number;
  purged: number;
  failed: number;
  skippedOverlap: boolean;
}

@Injectable()
export class AuthMaintenanceService {
  private readonly logger = new Logger(AuthMaintenanceService.name);
  private running = false;

  public constructor(
    @Inject(AuthMaintenanceRepository)
    private readonly records: AuthMaintenanceRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public async purgeExpired(now = new Date()): Promise<AuthMaintenanceRunResult> {
    const runId = randomUUID();
    const requestId = `job:${JOB_NAME}:${runId}`;
    const startedAt = Date.now();
    if (this.running) {
      this.logger.warn({ event: 'job.skipped_overlap', job: JOB_NAME, runId, requestId });
      return { scanned: 0, purged: 0, failed: 0, skippedOverlap: true };
    }

    this.running = true;
    this.logger.log({
      event: 'job.started',
      job: JOB_NAME,
      runId,
      requestId,
      batchSize: this.config.scheduler.authCleanupBatchSize,
    });
    try {
      const cutoff = new Date(now.getTime() - RETENTION_MILLISECONDS);
      const candidates = await this.records.findCleanupCandidates(
        cutoff,
        this.config.scheduler.authCleanupBatchSize,
      );
      let purged = 0;
      let noop = 0;
      let failed = 0;
      for (const candidate of candidates) {
        try {
          if (await this.records.deleteCandidate(candidate, cutoff)) {
            purged += 1;
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
            recordType: candidate.recordType,
            recordId: candidate.id,
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
        succeeded: purged,
        noop,
        failed,
        durationMs: Date.now() - startedAt,
      });
      return { scanned: candidates.length, purged, failed, skippedOverlap: false };
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
