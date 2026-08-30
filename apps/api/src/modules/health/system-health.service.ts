import { Inject, Injectable } from '@nestjs/common';
import { MAIL_PROVIDER, type MailProvider } from '../../common/providers/mail-provider.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../../common/providers/storage-provider.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  SystemDatabaseHealthDto,
  SystemDependencyHealthDto,
  SystemHealthDetailDto,
  SystemHealthReason,
} from './system-health-response.dto.js';

interface DatabaseProbeRow {
  databaseReady: number;
  appliedMigrationCount: number;
  incompleteMigrationCount: number;
}

export const SYSTEM_DEPENDENCY_TIMEOUT_MS = 2_000;

@Injectable()
export class SystemHealthService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public async inspect(): Promise<SystemHealthDetailDto> {
    const startedAt = Date.now();
    const [database, storage, mail] = await Promise.all([
      this.databaseProbe(),
      this.storageProbe(),
      this.mailProbe(),
    ]);
    const dependencyStates = [database.state, storage.state, mail.state];
    const state =
      database.state === 'unavailable'
        ? 'unavailable'
        : dependencyStates.every((candidate) => candidate === 'healthy')
          ? 'healthy'
          : 'degraded';
    const durationMs = elapsed(startedAt);
    return {
      state,
      checkedAt: new Date().toISOString(),
      durationMs,
      api: {
        state: 'healthy',
        reason: 'ok',
        latencyMs: durationMs,
        uptimeSeconds: Math.max(0, Math.floor(process.uptime())),
        version: safeVersion(this.config.version),
      },
      database,
      storage,
      mail,
    };
  }

  private async databaseProbe(): Promise<SystemDatabaseHealthDto> {
    const startedAt = Date.now();
    try {
      const rows = await bounded(
        this.prisma.$queryRaw<DatabaseProbeRow[]>`
          SELECT
            1::int AS "databaseReady",
            COUNT(*) FILTER (
              WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
            )::int AS "appliedMigrationCount",
            COUNT(*) FILTER (
              WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL
            )::int AS "incompleteMigrationCount"
          FROM "_prisma_migrations"
        `,
      );
      const row = rows[0];
      if (row?.databaseReady !== 1) return unavailableDatabase(startedAt, 'unavailable');
      if (row.incompleteMigrationCount > 0) {
        return {
          state: 'degraded',
          reason: 'incomplete_migration',
          latencyMs: elapsed(startedAt),
          appliedMigrationCount: row.appliedMigrationCount,
          incompleteMigrationCount: row.incompleteMigrationCount,
        };
      }
      if (row.appliedMigrationCount < 1) {
        return {
          state: 'degraded',
          reason: 'no_applied_migration',
          latencyMs: elapsed(startedAt),
          appliedMigrationCount: 0,
          incompleteMigrationCount: 0,
        };
      }
      return {
        state: 'healthy',
        reason: 'ok',
        latencyMs: elapsed(startedAt),
        appliedMigrationCount: row.appliedMigrationCount,
        incompleteMigrationCount: row.incompleteMigrationCount,
      };
    } catch (error) {
      return unavailableDatabase(startedAt, reasonFor(error));
    }
  }

  private async storageProbe(): Promise<SystemDependencyHealthDto> {
    if (this.storage.probe === undefined) return notConfigured();
    return dependencyProbe(() => this.storage.probe?.() ?? Promise.resolve());
  }

  private async mailProbe(): Promise<SystemDependencyHealthDto> {
    if (this.mail.probe === undefined) return notConfigured();
    const startedAt = Date.now();
    try {
      const result = await bounded(this.mail.probe());
      return result === 'not-configured'
        ? { state: 'not_configured', reason: 'not_configured', latencyMs: elapsed(startedAt) }
        : { state: 'healthy', reason: 'ok', latencyMs: elapsed(startedAt) };
    } catch (error) {
      return {
        state: 'unavailable',
        reason: reasonFor(error),
        latencyMs: elapsed(startedAt),
      };
    }
  }
}

async function dependencyProbe(operation: () => Promise<void>): Promise<SystemDependencyHealthDto> {
  const startedAt = Date.now();
  try {
    await bounded(operation());
    return { state: 'healthy', reason: 'ok', latencyMs: elapsed(startedAt) };
  } catch (error) {
    return { state: 'unavailable', reason: reasonFor(error), latencyMs: elapsed(startedAt) };
  }
}

function unavailableDatabase(
  startedAt: number,
  reason: SystemHealthReason,
): SystemDatabaseHealthDto {
  return {
    state: 'unavailable',
    reason,
    latencyMs: elapsed(startedAt),
    appliedMigrationCount: 0,
    incompleteMigrationCount: 0,
  };
}

function notConfigured(): SystemDependencyHealthDto {
  return { state: 'not_configured', reason: 'not_configured', latencyMs: 0 };
}

function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function safeVersion(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(0, 64);
  return normalized.length === 0 ? 'unknown' : normalized;
}

class ProbeTimeoutError extends Error {}

function reasonFor(error: unknown): SystemHealthReason {
  return error instanceof ProbeTimeoutError ? 'timeout' : 'unavailable';
}

function bounded<T>(operation: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new ProbeTimeoutError());
    }, SYSTEM_DEPENDENCY_TIMEOUT_MS);
    timer.unref();
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
