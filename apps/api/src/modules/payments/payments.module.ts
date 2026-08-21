import { Module } from '@nestjs/common';
import { CheckoutPaymentGateway } from './checkout-payment.gateway.js';

@Module({
  providers: [CheckoutPaymentGateway],
  exports: [CheckoutPaymentGateway],
})
export class PaymentsModule {}
