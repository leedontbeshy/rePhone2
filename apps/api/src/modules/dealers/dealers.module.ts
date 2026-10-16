import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { DealerAccessGuard } from './dealer-access.guard.js';
import { DealerRuntime } from './dealer-runtime.service.js';
import { DealerConfigurationController } from './dealer-configuration.controller.js';
import { DealerProfileService } from './dealer-profile.service.js';
import { DealerCatalogService } from './dealer-catalog.service.js';
import { DealerCatalogReader } from './dealer-catalog.reader.js';
import { DealerOrderService } from './dealer-order.service.js';
import { DealerPaymentService } from './dealer-payment.service.js';
import { DealerRefundService } from './dealer-refund.service.js';
import { DealerWebhookService } from './dealer-webhook.service.js';
import { DealerController } from './dealer.controller.js';
import { DealerPortalController } from './dealer-portal.controller.js';
import { DealerBackofficeController } from './dealer-backoffice.controller.js';
import { DealerAfterSalesController } from './dealer-after-sales.controller.js';
import { DealerAfterSalesService } from './dealer-after-sales.service.js';
import { AfterSalesRepository } from '../after-sales/after-sales.repository.js';
import { DealerReconciliationService } from './dealer-reconciliation.service.js';
import { DealerEnabledGuard } from './dealer-enabled.guard.js';

const controllers = [
  DealerConfigurationController,
  DealerController,
  DealerPortalController,
  DealerBackofficeController,
  DealerAfterSalesController,
];
@Module({
  imports: [
    AuthModule,
    AuditModule,
    CatalogModule,
    InventoryModule,
    SettingsModule,
    NotificationsModule,
    StorageModule,
  ],
  controllers,
  providers: [
    DealerEnabledGuard,
    DealerReconciliationService,
    DealerAfterSalesService,
    AfterSalesRepository,
    DealerRuntime,
    DealerAccessGuard,
    DealerProfileService,
    DealerCatalogService,
    DealerCatalogReader,
    DealerOrderService,
    DealerPaymentService,
    DealerRefundService,
    DealerWebhookService,
  ],
  exports: [DealerRuntime, DealerPaymentService, DealerRefundService],
})
export class DealersModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply((_req: Request, res: Response, next: NextFunction) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Pragma', 'no-cache');
        next();
      })
      .forRoutes(...controllers);
  }
}
