import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OperationsOverviewController } from './operations-overview.controller.js';
import { OperationsOverviewNoStoreMiddleware } from './operations-overview-no-store.middleware.js';
import { OperationsOverviewRepository } from './operations-overview.repository.js';
import { OperationsOverviewService } from './operations-overview.service.js';
import { FinancialReportService } from './financial-report.service.js';
import { FinancialReportRepository } from './financial-report.repository.js';
import { PendingTasksService } from './pending-tasks.service.js';
import { DealersModule } from '../dealers/dealers.module.js';
import { AffiliateCoreModule } from '../affiliate-core/affiliate-core.module.js';

@Module({
  imports: [AuthModule, DealersModule, AffiliateCoreModule],
  controllers: [OperationsOverviewController],
  providers: [
    OperationsOverviewRepository,
    OperationsOverviewService,
    FinancialReportRepository,
    FinancialReportService,
    PendingTasksService,
  ],
})
export class OperationsOverviewModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(OperationsOverviewNoStoreMiddleware).forRoutes(OperationsOverviewController);
  }
}
