import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GuestOrderIdentityService } from './guest-order-identity.service.js';
import { OrderOwnershipPolicy } from './order-ownership.policy.js';
import { PaymentOrderGateway } from './payment-order.gateway.js';
import { FulfillmentOrderGateway } from './fulfillment-order.gateway.js';
import { RefundOrderGateway } from './refund-order.gateway.js';

@Module({
  imports: [AuthModule],
  providers: [
    GuestOrderIdentityService,
    OrderOwnershipPolicy,
    PaymentOrderGateway,
    FulfillmentOrderGateway,
    RefundOrderGateway,
  ],
  exports: [
    GuestOrderIdentityService,
    OrderOwnershipPolicy,
    PaymentOrderGateway,
    FulfillmentOrderGateway,
    RefundOrderGateway,
  ],
})
export class OrderTransactionPortsModule {}
