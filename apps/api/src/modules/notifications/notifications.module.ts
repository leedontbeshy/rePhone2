import { Module } from '@nestjs/common';
import { MAIL_PROVIDER } from '../../common/providers/mail-provider.js';
import { NoopMailProvider, SmtpMailProvider } from '../../common/providers/smtp-mail.provider.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { OrderNotificationService } from './order-notification.service.js';
import { PaymentLifecycleNotificationService } from './payment-lifecycle-notification.service.js';
import { RefundNotificationService } from './refund-notification.service.js';
import { AfterSalesNotificationService } from './after-sales-notification.service.js';

@Module({
  providers: [
    {
      provide: MAIL_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.environment === 'test' ? new NoopMailProvider() : new SmtpMailProvider(config.mail),
    },
    OrderNotificationService,
    PaymentLifecycleNotificationService,
    RefundNotificationService,
    AfterSalesNotificationService,
  ],
  exports: [
    MAIL_PROVIDER,
    OrderNotificationService,
    PaymentLifecycleNotificationService,
    RefundNotificationService,
    AfterSalesNotificationService,
  ],
})
export class NotificationsModule {}
