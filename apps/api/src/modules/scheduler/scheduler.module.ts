import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentOperationsModule } from '../payment-operations/payment-operations.module.js';
import { DepositExpiryScheduler } from './deposit-expiry.scheduler.js';
import { FulfillmentModule } from '../fulfillment/fulfillment.module.js';
import { PickupExpiryScheduler } from './pickup-expiry.scheduler.js';

@Module({
  imports: [ScheduleModule.forRoot(), PaymentOperationsModule, FulfillmentModule],
  providers: [DepositExpiryScheduler, PickupExpiryScheduler],
})
export class SchedulerModule {}
