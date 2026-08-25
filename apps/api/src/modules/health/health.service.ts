import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

interface ReadinessProbe {
  databaseReady: number;
  appliedMigrationCount: number;
  incompleteMigrationCount: number;
}

export const READINESS_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthService {
  public constructor(private readonly prisma: PrismaService) {}

  public async readiness(): Promise<{ status: 'ok' }> {
    try {
      const check = this.prisma.$queryRaw<ReadinessProbe[]>`
        SELECT
          1::int AS "databaseReady",
          COUNT(*) FILTER (
            WHERE "finished_at" IS NOT NULL
              AND "rolled_back_at" IS NULL
          )::int AS "appliedMigrationCount",
          COUNT(*) FILTER (
            WHERE "finished_at" IS NULL
              AND "rolled_back_at" IS NULL
          )::int AS "incompleteMigrationCount"
        FROM "_prisma_migrations"
      `;
      const result = await withTimeout(check, READINESS_TIMEOUT_MS);
      const probe = result[0];

      if (
        probe?.databaseReady !== 1 ||
        probe.appliedMigrationCount < 1 ||
        probe.incompleteMigrationCount > 0
      ) {
        throw new Error('database or migration state is not ready');
      }
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'error' });
    }
  }
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('readiness timeout'));
    }, timeoutMs);
    timer.unref();
  });

  return Promise.race([operation, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
