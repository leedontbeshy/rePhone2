import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BackofficeVouchersController, PublicVouchersController } from './voucher.controller.js';
import { VoucherRepository } from './voucher.repository.js';
import { VoucherService } from './voucher.service.js';
import { CheckoutVoucherGateway } from './checkout-voucher.gateway.js';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [PublicVouchersController, BackofficeVouchersController],
  providers: [VoucherRepository, VoucherService, CheckoutVoucherGateway],
  exports: [VoucherService, CheckoutVoucherGateway],
})
export class VouchersModule {}
