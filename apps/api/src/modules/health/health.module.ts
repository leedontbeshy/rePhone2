import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { HealthController, SystemHealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { SystemHealthNoStoreMiddleware } from './system-health-no-store.middleware.js';
import { SystemHealthService } from './system-health.service.js';

@Module({
  imports: [AuthModule, StorageModule, NotificationsModule],
  controllers: [HealthController, SystemHealthController],
  providers: [HealthService, SystemHealthService],
})
export class HealthModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SystemHealthNoStoreMiddleware).forRoutes(SystemHealthController);
  }
}
