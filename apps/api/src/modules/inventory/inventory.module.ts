import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { IdentifierProtectionService } from './identifier-protection.service.js';
import { InventoryController, InventoryLocationsController } from './inventory.controller.js';
import { InventoryRepository } from './inventory.repository.js';
import { InventoryService } from './inventory.service.js';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [InventoryController, InventoryLocationsController],
  providers: [IdentifierProtectionService, InventoryRepository, InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
