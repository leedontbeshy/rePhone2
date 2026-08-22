import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GuestOrderIdentityService } from './guest-order-identity.service.js';
import { OrderOwnershipPolicy } from './order-ownership.policy.js';
import { PaymentOrderGateway } from './payment-order.gateway.js';

@Module({
  imports: [AuthModule],
  providers: [GuestOrderIdentityService, OrderOwnershipPolicy, PaymentOrderGateway],
  exports: [GuestOrderIdentityService, OrderOwnershipPolicy, PaymentOrderGateway],
})
export class OrderTransactionPortsModule {}
