import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { PickupExpiryService } from '../fulfillment/pickup-expiry.service.js';

@Injectable()
export class PickupExpiryScheduler {
  public constructor(
    @Inject(PickupExpiryService) private readonly expiry: PickupExpiryService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'expirePickupHolds',
    timeZone: 'UTC',
  })
  public async handleTick(): Promise<void> {
    if (!this.config.scheduler.enabled) return;
    await this.expiry.expireDue();
  }
}
