import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import {
  BackofficeProductsController,
  BackofficeVariantsController,
} from './backoffice-catalog.controller.js';
import { BackofficeCatalogRepository } from './backoffice-catalog.repository.js';
import { BackofficeCatalogService } from './backoffice-catalog.service.js';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [BackofficeProductsController, BackofficeVariantsController],
  providers: [BackofficeCatalogRepository, BackofficeCatalogService],
  exports: [BackofficeCatalogService],
})
export class BackofficeCatalogModule {}
