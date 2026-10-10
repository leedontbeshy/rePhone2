import { AffiliateCoreModule } from '../affiliate-core/affiliate-core.module.js';
import { Module } from '@nestjs/common';
import { PaymentCoreModule } from '../payments/payment-core.module.js';
import { RefundCoreGateway } from './refund-core.gateway.js';
import { AfterSalesRefundGateway } from './after-sales-refund.gateway.js';

@Module({
  imports: [PaymentCoreModule, AffiliateCoreModule],
  providers: [RefundCoreGateway, AfterSalesRefundGateway],
  exports: [RefundCoreGateway, AfterSalesRefundGateway],
})
export class RefundCoreModule {}
