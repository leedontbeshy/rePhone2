import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CartModule } from '../cart/cart.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OrderTransactionPortsModule } from '../order-transaction-ports/order-transaction-ports.module.js';
import { PaymentCoreModule } from '../payments/payment-core.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { VouchersModule } from '../vouchers/voucher.module.js';
import { OrderRateLimitGuard } from './order-rate-limit.guard.js';
import { OrderRateLimiter } from './order-rate-limiter.service.js';
import { OrderMutationCsrfGuard } from './order-mutation-csrf.guard.js';
import { CheckoutsController, OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [
    AuthModule,
    AuditModule,
    CartModule,
    CatalogModule,
    InventoryModule,
    VouchersModule,
    PaymentCoreModule,
    OrderTransactionPortsModule,
    SettingsModule,
    NotificationsModule,
  ],
  controllers: [CheckoutsController, OrdersController],
  providers: [OrdersService, OrderRateLimiter, OrderRateLimitGuard, OrderMutationCsrfGuard],
  exports: [OrdersService],
})
export class OrdersModule {}
