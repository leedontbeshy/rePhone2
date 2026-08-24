import { Module } from '@nestjs/common';
import { InMemoryStorageProvider } from '../../common/providers/in-memory-storage.provider.js';
import { STORAGE_PROVIDER } from '../../common/providers/storage-provider.js';
import { SupabaseStorageProvider } from '../../common/providers/supabase-storage.provider.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { PrivateEvidenceValidator } from './private-evidence.validator.js';

@Module({
  providers: [
    PrivateEvidenceValidator,
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
  exports: [STORAGE_PROVIDER, PrivateEvidenceValidator],
})
export class StorageModule {}
