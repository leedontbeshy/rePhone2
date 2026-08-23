import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OrderTransactionPortsModule } from '../order-transaction-ports/order-transaction-ports.module.js';
import { PaymentCoreModule } from '../payments/payment-core.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { VouchersModule } from '../vouchers/voucher.module.js';
import { WarrantyModule } from '../warranty/warranty.module.js';
import { BackofficeOrderController } from './backoffice-order.controller.js';
import { BackofficeShipmentController } from './backoffice-shipment.controller.js';
import { BackofficeOrderService } from './backoffice-order.service.js';
import { FulfillmentClock } from './fulfillment-clock.service.js';
import { FulfillmentNoStoreMiddleware } from './fulfillment-no-store.middleware.js';
import { FulfillmentQueryService } from './fulfillment-query.service.js';
import { PickupCompletionController } from './pickup-completion.controller.js';
import { PickupCompletionService } from './pickup-completion.service.js';
import { PickupExpiryService } from './pickup-expiry.service.js';
import { PickupPreparationController } from './pickup-preparation.controller.js';
import { PickupPreparationService } from './pickup-preparation.service.js';
import { ShipmentFinalizationService } from './shipment-finalization.service.js';
import { ShipmentGateway } from './shipment.gateway.js';
import { ShipmentPreparationService } from './shipment-preparation.service.js';
import { ShippingFeeOverrideService } from './shipping-fee-override.service.js';
import { ShippingOrderController } from './shipping-order.controller.js';

@Module({
  imports: [
    AuthModule,
    AuditModule,
    OrderTransactionPortsModule,
    InventoryModule,
    PaymentCoreModule,
    VouchersModule,
    WarrantyModule,
    SettingsModule,
    NotificationsModule,
  ],
  controllers: [
    BackofficeOrderController,
    PickupPreparationController,
    PickupCompletionController,
    ShippingOrderController,
    BackofficeShipmentController,
  ],
  providers: [
    FulfillmentClock,
    FulfillmentQueryService,
    BackofficeOrderService,
    PickupPreparationService,
    PickupCompletionService,
    PickupExpiryService,
    ShipmentGateway,
    ShippingFeeOverrideService,
    ShipmentPreparationService,
    ShipmentFinalizationService,
  ],
  exports: [FulfillmentClock, PickupExpiryService],
})
export class FulfillmentModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(FulfillmentNoStoreMiddleware)
      .forRoutes(
        BackofficeOrderController,
        PickupPreparationController,
        PickupCompletionController,
        ShippingOrderController,
        BackofficeShipmentController,
      );
  }
}
