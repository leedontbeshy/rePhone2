import { Module } from '@nestjs/common';
import { STORAGE_PROVIDER } from '../../common/providers/storage-provider.js';
import { InMemoryStorageProvider } from '../../common/providers/in-memory-storage.provider.js';
import { SupabaseStorageProvider } from '../../common/providers/supabase-storage.provider.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BackofficeCatalogModule } from '../backoffice-catalog/backoffice-catalog.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { ImageUploadValidator } from './image-upload.validator.js';
import { MediaController } from './media.controller.js';
import { MediaRepository } from './media.repository.js';
import { MediaService } from './media.service.js';

@Module({
  imports: [AuthModule, AuditModule, BackofficeCatalogModule, InventoryModule],
  controllers: [MediaController],
  providers: [
    MediaRepository,
    MediaService,
    ImageUploadValidator,
    SupabaseStorageProvider,
    InMemoryStorageProvider,
    {
      provide: STORAGE_PROVIDER,
      inject: [APP_CONFIG, SupabaseStorageProvider, InMemoryStorageProvider],
      useFactory: (
        config: AppConfig,
        supabase: SupabaseStorageProvider,
        memory: InMemoryStorageProvider,
      ) => (config.environment === 'test' ? memory : supabase),
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class MediaModule {}
