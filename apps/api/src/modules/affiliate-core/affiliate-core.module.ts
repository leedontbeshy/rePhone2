import { Module } from '@nestjs/common';
import { AffiliateRuntime } from './affiliate-runtime.service.js';
import { AffiliateLedgerService } from './affiliate-ledger.service.js';
import { AuditModule } from '../audit/audit.module.js';
@Module({
  imports: [AuditModule],
  providers: [AffiliateRuntime, AffiliateLedgerService],
  exports: [AffiliateRuntime, AffiliateLedgerService],
})
export class AffiliateCoreModule {}
