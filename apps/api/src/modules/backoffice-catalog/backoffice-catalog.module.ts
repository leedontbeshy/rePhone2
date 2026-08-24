import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { WarrantyModule } from '../warranty/warranty.module.js';
import {
  BackofficeProductsController,
  BackofficeVariantsController,
} from './backoffice-catalog.controller.js';
import { BackofficeCatalogRepository } from './backoffice-catalog.repository.js';
import { BackofficeCatalogService } from './backoffice-catalog.service.js';
import { WarrantyPolicyCatalogReferenceGateway } from './warranty-policy-catalog-reference.gateway.js';

@Module({
  imports: [AuthModule, AuditModule, WarrantyModule],
  controllers: [BackofficeProductsController, BackofficeVariantsController],
  providers: [
    BackofficeCatalogRepository,
    BackofficeCatalogService,
    WarrantyPolicyCatalogReferenceGateway,
  ],
  exports: [BackofficeCatalogService, WarrantyPolicyCatalogReferenceGateway],
})
export class BackofficeCatalogModule {}
