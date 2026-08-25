import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { CheckoutSettingsReader } from './checkout-settings.reader.js';
import { BackofficeSettingsController, PublicStoreController } from './settings.controller.js';
import { SettingsNoStoreMiddleware } from './settings-no-store.middleware.js';
import { SettingsRepository } from './settings.repository.js';
import { SettingsService } from './settings.service.js';
import { StoreQrImageValidator } from './store-qr-image.validator.js';

@Module({
  imports: [AuthModule, AuditModule, StorageModule],
  controllers: [PublicStoreController, BackofficeSettingsController],
  providers: [CheckoutSettingsReader, SettingsRepository, SettingsService, StoreQrImageValidator],
  exports: [CheckoutSettingsReader],
})
export class SettingsModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SettingsNoStoreMiddleware).forRoutes(BackofficeSettingsController);
  }
}
