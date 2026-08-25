import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditNoStoreMiddleware } from './audit-no-store.middleware.js';
import { AuditOperationsController } from './audit-operations.controller.js';
import { AuditOperationsRepository } from './audit-operations.repository.js';
import { AuditOperationsService } from './audit-operations.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AuditOperationsController],
  providers: [AuditOperationsRepository, AuditOperationsService],
})
export class AuditOperationsModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuditNoStoreMiddleware).forRoutes(AuditOperationsController);
  }
}
