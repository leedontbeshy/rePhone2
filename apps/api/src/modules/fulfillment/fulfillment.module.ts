import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { OrderTransactionPortsModule } from '../order-transaction-ports/order-transaction-ports.module.js';
import { BackofficeOrderController } from './backoffice-order.controller.js';
import { BackofficeOrderService } from './backoffice-order.service.js';
import { FulfillmentClock } from './fulfillment-clock.service.js';
import { FulfillmentNoStoreMiddleware } from './fulfillment-no-store.middleware.js';
import { FulfillmentQueryService } from './fulfillment-query.service.js';

@Module({
  imports: [AuthModule, AuditModule, OrderTransactionPortsModule],
  controllers: [BackofficeOrderController],
  providers: [FulfillmentClock, FulfillmentQueryService, BackofficeOrderService],
  exports: [FulfillmentClock],
})
export class FulfillmentModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(FulfillmentNoStoreMiddleware).forRoutes(BackofficeOrderController);
  }
}
