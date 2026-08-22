import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OrderTransactionPortsModule } from '../order-transaction-ports/order-transaction-ports.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { VouchersModule } from '../vouchers/voucher.module.js';
import { PaymentClock } from './payment-clock.service.js';
import { PaymentEvidenceValidator } from './payment-evidence.validator.js';
import {
  BackofficePaymentOperationsController,
  PaymentOperationsController,
} from './payment-operations.controller.js';
import { PaymentOperationsRepository } from './payment-operations.repository.js';
import { PaymentProofAccessGuard } from './payment-proof-access.guard.js';
import { PaymentProofCsrfGuard } from './payment-proof-csrf.guard.js';
import { PaymentProofSubmissionService } from './payment-proof-submission.service.js';
import { PaymentRateLimitGuard } from './payment-rate-limit.guard.js';
import { PaymentRateLimiter } from './payment-rate-limiter.service.js';
import { PaymentReviewQueryService } from './payment-review-query.service.js';
import { PaymentReviewCommandService } from './payment-review-command.service.js';

@Module({
  imports: [
    AuthModule,
    AuditModule,
    InventoryModule,
    VouchersModule,
    StorageModule,
    NotificationsModule,
    OrderTransactionPortsModule,
  ],
  controllers: [PaymentOperationsController, BackofficePaymentOperationsController],
  providers: [
    PaymentClock,
    PaymentEvidenceValidator,
    PaymentOperationsRepository,
    PaymentProofSubmissionService,
    PaymentProofAccessGuard,
    PaymentProofCsrfGuard,
    PaymentRateLimiter,
    PaymentRateLimitGuard,
    PaymentReviewQueryService,
    PaymentReviewCommandService,
  ],
  exports: [PaymentOperationsRepository, PaymentClock],
})
export class PaymentOperationsModule {}
