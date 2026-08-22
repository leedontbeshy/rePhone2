import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { DepositExpiryService } from '../payment-operations/deposit-expiry.service.js';

@Injectable()
export class DepositExpiryScheduler {
  public constructor(
    @Inject(DepositExpiryService) private readonly expiry: DepositExpiryService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'expireDepositProofs',
    timeZone: 'UTC',
  })
  public async handleTick(): Promise<void> {
    if (!this.config.scheduler.enabled) return;
    await this.expiry.expireDue();
  }
}
