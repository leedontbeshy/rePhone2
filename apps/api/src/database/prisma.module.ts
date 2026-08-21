import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { SerializableTransactionRunner } from './serializable-transaction.runner.js';

@Global()
@Module({
  providers: [PrismaService, SerializableTransactionRunner],
  exports: [PrismaService, SerializableTransactionRunner],
})
export class PrismaModule {}
