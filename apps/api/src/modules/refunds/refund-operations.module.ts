import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OrderTransactionPortsModule } from '../order-transaction-ports/order-transaction-ports.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { RefundClock } from './refund-clock.service.js';
import { RefundBankCompletionGuard } from './refund-bank-completion.guard.js';
import { RefundCommandService } from './refund-command.service.js';
import { RefundCoreModule } from './refund-core.module.js';
import { RefundNoStoreMiddleware } from './refund-no-store.middleware.js';
import {
  BackofficeOrderRefundController,
  BackofficeRefundController,
} from './refund-operations.controller.js';
import { RefundOperationsRepository } from './refund-operations.repository.js';
import { RefundQueryService } from './refund-query.service.js';

@Module({
  imports: [
    AuthModule,
    AuditModule,
    RefundCoreModule,
    OrderTransactionPortsModule,
    StorageModule,
    NotificationsModule,
  ],
  controllers: [BackofficeRefundController, BackofficeOrderRefundController],
  providers: [
    RefundClock,
    RefundOperationsRepository,
    RefundQueryService,
    RefundCommandService,
    RefundBankCompletionGuard,
  ],
})
export class RefundOperationsModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RefundNoStoreMiddleware)
      .forRoutes(BackofficeRefundController, BackofficeOrderRefundController);
  }
}
