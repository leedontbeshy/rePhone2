import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OperationsOverviewController } from './operations-overview.controller.js';
import { OperationsOverviewRepository } from './operations-overview.repository.js';
import { OperationsOverviewService } from './operations-overview.service.js';

@Module({
  imports: [AuthModule],
  controllers: [OperationsOverviewController],
  providers: [OperationsOverviewRepository, OperationsOverviewService],
})
export class OperationsOverviewModule {}
