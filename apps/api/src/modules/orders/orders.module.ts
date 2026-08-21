import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CartModule } from '../cart/cart.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { VouchersModule } from '../vouchers/voucher.module.js';
import { GuestOrderIdentityService } from './guest-order-identity.service.js';
import { OrderRateLimitGuard } from './order-rate-limit.guard.js';
import { OrderRateLimiter } from './order-rate-limiter.service.js';
import { CheckoutsController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [
    AuthModule,
    AuditModule,
    CartModule,
    CatalogModule,
    InventoryModule,
    VouchersModule,
    PaymentsModule,
    SettingsModule,
  ],
  controllers: [CheckoutsController],
  providers: [OrdersService, GuestOrderIdentityService, OrderRateLimiter, OrderRateLimitGuard],
  exports: [OrdersService],
})
export class OrdersModule {}
