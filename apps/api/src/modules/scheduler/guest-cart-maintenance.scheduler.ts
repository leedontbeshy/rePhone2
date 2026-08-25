import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { GuestCartMaintenanceService } from '../cart/guest-cart-maintenance.service.js';

@Injectable()
export class GuestCartMaintenanceScheduler {
  public constructor(
    @Inject(GuestCartMaintenanceService)
    private readonly maintenance: GuestCartMaintenanceService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Cron('17 * * * *', { name: 'markExpiredGuestCarts', timeZone: 'UTC' })
  public async handleTick(): Promise<void> {
    if (!this.config.scheduler.enabled) return;
    await this.maintenance.markExpired();
  }
}
