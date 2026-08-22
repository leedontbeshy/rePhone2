import { Module } from '@nestjs/common';
import { PaymentCoreModule } from './payment-core.module.js';

@Module({
  imports: [PaymentCoreModule],
  exports: [PaymentCoreModule],
})
export class PaymentsModule {}
