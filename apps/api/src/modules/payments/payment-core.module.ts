import { Module } from '@nestjs/common';
import { CheckoutPaymentGateway } from './checkout-payment.gateway.js';
import { FulfillmentPaymentGateway } from './fulfillment-payment.gateway.js';

@Module({
  providers: [CheckoutPaymentGateway, FulfillmentPaymentGateway],
  exports: [CheckoutPaymentGateway, FulfillmentPaymentGateway],
})
export class PaymentCoreModule {}
