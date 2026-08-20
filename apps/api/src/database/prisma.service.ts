import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { APP_CONFIG } from '../config/app-config.module.js';
import type { AppConfig } from '../config/app-config.js';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  public constructor(@Inject(APP_CONFIG) config: AppConfig) {
    const adapter = new PrismaPg({
      connectionString: config.database.url,
      max: config.database.poolMax,
      connectionTimeoutMillis: config.database.connectionTimeoutMs,
      idleTimeoutMillis: config.database.idleTimeoutMs,
    });
    super({ adapter });
  }

  public async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
