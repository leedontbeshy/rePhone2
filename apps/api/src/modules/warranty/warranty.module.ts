import { Module } from '@nestjs/common';
import { WarrantyIssuanceService } from './warranty-issuance.service.js';

@Module({
  providers: [WarrantyIssuanceService],
  exports: [WarrantyIssuanceService],
})
export class WarrantyModule {}
