import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BackofficeCatalogModule } from '../backoffice-catalog/backoffice-catalog.module.js';
import { OrderTransactionPortsModule } from '../order-transaction-ports/order-transaction-ports.module.js';
import { WarrantyClock } from './warranty-clock.service.js';
import { WarrantyCommandService } from './warranty-command.service.js';
import { WarrantyNoStoreMiddleware } from './warranty-no-store.middleware.js';
import {
  BackofficeWarrantyPoliciesController,
  BackofficeWarrantiesController,
  CustomerWarrantiesController,
} from './warranty-operations.controller.js';
import { WarrantyOperationsRepository } from './warranty-operations.repository.js';
import { WarrantyQueryService } from './warranty-query.service.js';
import { WarrantyModule } from './warranty.module.js';

@Module({
  imports: [
    AuthModule,
    AuditModule,
    WarrantyModule,
    BackofficeCatalogModule,
    OrderTransactionPortsModule,
  ],
  controllers: [
    CustomerWarrantiesController,
    BackofficeWarrantyPoliciesController,
    BackofficeWarrantiesController,
  ],
  providers: [
    WarrantyClock,
    WarrantyOperationsRepository,
    WarrantyQueryService,
    WarrantyCommandService,
  ],
})
export class WarrantyOperationsModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(WarrantyNoStoreMiddleware)
      .forRoutes(
        CustomerWarrantiesController,
        BackofficeWarrantyPoliciesController,
        BackofficeWarrantiesController,
      );
  }
}
