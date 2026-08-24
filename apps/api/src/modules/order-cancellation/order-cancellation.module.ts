import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OrderTransactionPortsModule } from '../order-transaction-ports/order-transaction-ports.module.js';
import { RefundCoreModule } from '../refunds/refund-core.module.js';
import { VouchersModule } from '../vouchers/voucher.module.js';
import { OrderCancellationClock } from './order-cancellation-clock.service.js';
import { OrderCancellationService } from './order-cancellation.service.js';

@Module({
  imports: [
    AuditModule,
    InventoryModule,
    VouchersModule,
    RefundCoreModule,
    OrderTransactionPortsModule,
    NotificationsModule,
  ],
  providers: [OrderCancellationClock, OrderCancellationService],
  exports: [OrderCancellationService],
})
export class OrderCancellationModule {}
