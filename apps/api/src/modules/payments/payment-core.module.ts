import { Module } from '@nestjs/common';
import { CheckoutPaymentGateway } from './checkout-payment.gateway.js';
import { FulfillmentPaymentGateway } from './fulfillment-payment.gateway.js';
import { RefundPaymentGateway } from './refund-payment.gateway.js';

@Module({
  providers: [CheckoutPaymentGateway, FulfillmentPaymentGateway, RefundPaymentGateway],
  exports: [CheckoutPaymentGateway, FulfillmentPaymentGateway, RefundPaymentGateway],
})
export class PaymentCoreModule {}
