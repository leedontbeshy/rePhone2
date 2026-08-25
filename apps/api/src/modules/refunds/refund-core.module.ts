import { Module } from '@nestjs/common';
import { PaymentCoreModule } from '../payments/payment-core.module.js';
import { RefundCoreGateway } from './refund-core.gateway.js';
import { AfterSalesRefundGateway } from './after-sales-refund.gateway.js';

@Module({
  imports: [PaymentCoreModule],
  providers: [RefundCoreGateway, AfterSalesRefundGateway],
  exports: [RefundCoreGateway, AfterSalesRefundGateway],
})
export class RefundCoreModule {}
