import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CustomerController } from './customer.controller.js';
import { EmployeeController } from './employee.controller.js';
import { UserOperationsNoStoreMiddleware } from './user-operations-no-store.middleware.js';
import { UserOperationsRepository } from './user-operations.repository.js';
import { UserOperationsService } from './user-operations.service.js';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [EmployeeController, CustomerController],
  providers: [UserOperationsRepository, UserOperationsService],
})
export class UserOperationsModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(UserOperationsNoStoreMiddleware)
      .forRoutes(EmployeeController, CustomerController);
  }
}
