import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BackofficeCatalogModule } from '../backoffice-catalog/backoffice-catalog.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ImageUploadValidator } from './image-upload.validator.js';
import { MediaController } from './media.controller.js';
import { MediaRepository } from './media.repository.js';
import { MediaService } from './media.service.js';

@Module({
  imports: [AuthModule, AuditModule, BackofficeCatalogModule, InventoryModule, StorageModule],
  controllers: [MediaController],
  providers: [MediaRepository, MediaService, ImageUploadValidator],
  exports: [StorageModule],
})
export class MediaModule {}
