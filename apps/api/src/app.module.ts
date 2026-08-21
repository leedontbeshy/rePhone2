import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { createLoggerParams } from './common/logging/logger.config.js';
import { APP_CONFIG, AppConfigModule } from './config/app-config.module.js';
import type { AppConfig } from './config/app-config.js';
import { PrismaModule } from './database/prisma.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AccountsModule } from './modules/accounts/accounts.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { BackofficeCatalogModule } from './modules/backoffice-catalog/backoffice-catalog.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createLoggerParams(config),
    }),
    PrismaModule,
    AuthModule,
    AccountsModule,
    CatalogModule,
    BackofficeCatalogModule,
    InventoryModule,
    HealthModule,
  ],
})
export class AppModule {}
