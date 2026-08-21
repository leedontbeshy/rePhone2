import { Module } from '@nestjs/common';
import { AuditWriter } from './audit-writer.service.js';

@Module({
  providers: [AuditWriter],
  exports: [AuditWriter],
})
export class AuditModule {}
