import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentOperationsModule } from '../payment-operations/payment-operations.module.js';
import { DepositExpiryScheduler } from './deposit-expiry.scheduler.js';
import { FulfillmentModule } from '../fulfillment/fulfillment.module.js';
import { PickupExpiryScheduler } from './pickup-expiry.scheduler.js';
import { CartModule } from '../cart/cart.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { GuestCartMaintenanceScheduler } from './guest-cart-maintenance.scheduler.js';
import { AuthMaintenanceScheduler } from './auth-maintenance.scheduler.js';
import { OverduePaymentReviewScheduler } from './overdue-payment-review.scheduler.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PaymentOperationsModule,
    FulfillmentModule,
    CartModule,
    AuthModule,
  ],
  providers: [
    DepositExpiryScheduler,
    PickupExpiryScheduler,
    GuestCartMaintenanceScheduler,
    AuthMaintenanceScheduler,
    OverduePaymentReviewScheduler,
  ],
})
export class SchedulerModule {}
