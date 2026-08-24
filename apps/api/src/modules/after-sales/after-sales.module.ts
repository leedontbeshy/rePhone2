import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OrderTransactionPortsModule } from '../order-transaction-ports/order-transaction-ports.module.js';
import { RefundCoreModule } from '../refunds/refund-core.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { WarrantyModule } from '../warranty/warranty.module.js';
import { AfterSalesAttachmentAccessGuard } from './after-sales-attachment-access.guard.js';
import { AfterSalesAttachmentService } from './after-sales-attachment.service.js';
import { AfterSalesClock } from './after-sales-clock.service.js';
import { AfterSalesCommandService } from './after-sales-command.service.js';
import { AfterSalesController } from './after-sales.controller.js';
import { AfterSalesNoStoreMiddleware } from './after-sales-no-store.middleware.js';
import { AfterSalesQueryService } from './after-sales-query.service.js';
import { AfterSalesRateLimitGuard } from './after-sales-rate-limit.guard.js';
import { AfterSalesRateLimiter } from './after-sales-rate-limiter.service.js';
import { AfterSalesRepository } from './after-sales.repository.js';

@Module({
  imports: [
    AuthModule,
    AuditModule,
    OrderTransactionPortsModule,
    InventoryModule,
    RefundCoreModule,
    WarrantyModule,
    StorageModule,
    SettingsModule,
    NotificationsModule,
  ],
  controllers: [AfterSalesController],
  providers: [
    AfterSalesClock,
    AfterSalesRepository,
    AfterSalesQueryService,
    AfterSalesCommandService,
    AfterSalesAttachmentService,
    AfterSalesAttachmentAccessGuard,
    AfterSalesRateLimiter,
    AfterSalesRateLimitGuard,
  ],
})
export class AfterSalesModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AfterSalesNoStoreMiddleware).forRoutes(AfterSalesController);
  }
}
