import { Module } from '@nestjs/common';
import { PaymentCoreModule } from '../payments/payment-core.module.js';
import { RefundCoreGateway } from './refund-core.gateway.js';

@Module({
  imports: [PaymentCoreModule],
  providers: [RefundCoreGateway],
  exports: [RefundCoreGateway],
})
export class RefundCoreModule {}
