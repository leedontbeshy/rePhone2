import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OperationsOverviewController } from './operations-overview.controller.js';
import { OperationsOverviewNoStoreMiddleware } from './operations-overview-no-store.middleware.js';
import { OperationsOverviewRepository } from './operations-overview.repository.js';
import { OperationsOverviewService } from './operations-overview.service.js';

@Module({
  imports: [AuthModule],
  controllers: [OperationsOverviewController],
  providers: [OperationsOverviewRepository, OperationsOverviewService],
})
export class OperationsOverviewModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(OperationsOverviewNoStoreMiddleware).forRoutes(OperationsOverviewController);
  }
}
