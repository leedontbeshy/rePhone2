import { Module } from '@nestjs/common';
import { WarrantyIssuanceService } from './warranty-issuance.service.js';
import { WarrantyPolicyReader } from './warranty-policy.reader.js';
import { WarrantyTransactionGateway } from './warranty-transaction.gateway.js';

@Module({
  providers: [WarrantyIssuanceService, WarrantyPolicyReader, WarrantyTransactionGateway],
  exports: [WarrantyIssuanceService, WarrantyPolicyReader, WarrantyTransactionGateway],
})
export class WarrantyModule {}
