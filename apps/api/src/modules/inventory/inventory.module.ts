import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { IdentifierProtectionService } from './identifier-protection.service.js';
import { InventoryController, InventoryLocationsController } from './inventory.controller.js';
import { InventoryRepository } from './inventory.repository.js';
import { InventoryService } from './inventory.service.js';
import { InspectionRepository } from './inspection.repository.js';
import { InspectionService } from './inspection.service.js';
import { InspectionsController, UnitInspectionsController } from './inspection.controller.js';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [
    InventoryController,
    InventoryLocationsController,
    UnitInspectionsController,
    InspectionsController,
  ],
  providers: [
    IdentifierProtectionService,
    InventoryRepository,
    InventoryService,
    InspectionRepository,
    InspectionService,
  ],
  exports: [InventoryService],
})
export class InventoryModule {}
