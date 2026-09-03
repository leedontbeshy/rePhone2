import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../common/errors/api-error.js';
import { PrismaService } from './prisma.service.js';

const RETRY_DELAYS_MS = [25, 75] as const;
const DEFAULT_MAX_WAIT_MS = 2_000;
const DEFAULT_TIMEOUT_MS = 5_000;

export interface SerializableTransactionOptions {
  maxWaitMs?: number;
  timeoutMs?: number;
}

@Injectable()
export class SerializableTransactionRunner {
  private readonly logger = new Logger(SerializableTransactionRunner.name);

  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async run<T>(
    operation: string,
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
    retryableDomainError?: (error: unknown) => boolean,
    options: SerializableTransactionOptions = {},
  ): Promise<T> {
    for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: 'Serializable',
          maxWait: options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS,
          timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });
      } catch (error) {
        if (!isRetryableTransactionError(error) && !(retryableDomainError?.(error) ?? false)) {
          throw error;
        }
        const retryDelay = RETRY_DELAYS_MS[attempt - 1];
        if (retryDelay === undefined) {
          this.logger.warn({ event: 'transaction.retry.exhausted', operation, attempt });
          throw new ApiError('CONCURRENT_MODIFICATION');
        }
        const jitter = Math.floor(Math.random() * 16);
        this.logger.warn({ event: 'transaction.retry', operation, attempt });
        await new Promise<void>((resolve) => setTimeout(resolve, retryDelay + jitter));
      }
    }
    throw new ApiError('CONCURRENT_MODIFICATION');
  }
}

export function isRetryableTransactionError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  if (error['code'] === 'P2034' || isPostgresRetryCode(error['code'])) return true;
  const meta = error['meta'];
  if (!isRecord(meta)) return false;
  if (isPostgresRetryCode(meta['code'])) return true;
  const adapter = meta['driverAdapterError'];
  if (!isRecord(adapter)) return false;
  const cause = adapter['cause'];
  return isRecord(cause) && isPostgresRetryCode(cause['originalCode']);
}

function isPostgresRetryCode(value: unknown): boolean {
  return value === '40001' || value === '40P01';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
