import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../common/errors/api-error.js';
import { PrismaService } from './prisma.service.js';

const RETRY_DELAYS_MS = [25, 75] as const;

@Injectable()
export class SerializableTransactionRunner {
  private readonly logger = new Logger(SerializableTransactionRunner.name);

  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async run<T>(
    operation: string,
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: 'Serializable',
          maxWait: 2_000,
          timeout: 5_000,
        });
      } catch (error) {
        if (!isRetryableTransactionError(error)) {
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
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown; meta?: { code?: unknown } };
  return (
    candidate.code === 'P2034' ||
    candidate.code === '40001' ||
    candidate.code === '40P01' ||
    candidate.meta?.code === '40001' ||
    candidate.meta?.code === '40P01'
  );
}
