import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

interface MigrationCount {
  count: number;
}

@Injectable()
export class HealthService {
  public constructor(private readonly prisma: PrismaService) {}

  public async readiness(): Promise<{ status: 'ok' }> {
    try {
      const check = this.prisma.$queryRaw<MigrationCount[]>`
        SELECT COUNT(*)::int AS count
        FROM "_prisma_migrations"
        WHERE "finished_at" IS NOT NULL
          AND "rolled_back_at" IS NULL
      `;
      const result = await Promise.race([
        check,
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('readiness timeout'));
          }, 2_000).unref();
        }),
      ]);

      if ((result[0]?.count ?? 0) < 1) {
        throw new Error('no deployed migration');
      }
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'error' });
    }
  }
}
