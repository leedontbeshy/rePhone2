import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentOperationsModule } from '../payment-operations/payment-operations.module.js';
import { DepositExpiryScheduler } from './deposit-expiry.scheduler.js';

@Module({
  imports: [ScheduleModule.forRoot(), PaymentOperationsModule],
  providers: [DepositExpiryScheduler],
})
export class SchedulerModule {}
