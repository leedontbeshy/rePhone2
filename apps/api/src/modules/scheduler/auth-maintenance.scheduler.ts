import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { AuthMaintenanceService } from '../auth/auth-maintenance.service.js';

@Injectable()
export class AuthMaintenanceScheduler {
  public constructor(
    @Inject(AuthMaintenanceService) private readonly maintenance: AuthMaintenanceService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Cron('15 2 * * *', { name: 'purgeExpiredAuthRecords', timeZone: 'UTC' })
  public async handleTick(): Promise<void> {
    if (!this.config.scheduler.enabled) return;
    await this.maintenance.purgeExpired();
  }
}
