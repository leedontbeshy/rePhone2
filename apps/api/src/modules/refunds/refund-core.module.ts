import { Module } from '@nestjs/common';
import { RefundCoreGateway } from './refund-core.gateway.js';

@Module({
  providers: [RefundCoreGateway],
  exports: [RefundCoreGateway],
})
export class RefundCoreModule {}
