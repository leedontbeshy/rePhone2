import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { NotificationDeliveryService } from './notification-delivery.service.js';

@Injectable()
export class AfterSalesNotificationService {
  public constructor(
    @Inject(NotificationDeliveryService)
    private readonly delivery: NotificationDeliveryService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public sendUpdated(input: {
    requestId: string;
    requestNumber: string;
    orderNumber: string;
    customerEmail: string;
    status: string;
  }): Promise<void> {
    const link = `${this.config.api.webPublicUrl}/after-sales/${encodeURIComponent(input.requestNumber)}?orderNumber=${encodeURIComponent(input.orderNumber)}`;
    return this.deliver('after_sales.updated', input.requestId, {
      to: input.customerEmail,
      subject: `[rePhone] Cập nhật hậu mãi ${input.requestNumber}`,
      text: `Yêu cầu ${input.requestNumber} của đơn ${input.orderNumber} hiện ở trạng thái ${input.status}. Xem chi tiết: ${link}`,
      html: `<p>Yêu cầu <strong>${escapeHtml(input.requestNumber)}</strong> của đơn <strong>${escapeHtml(input.orderNumber)}</strong> hiện ở trạng thái <strong>${escapeHtml(input.status)}</strong>.</p><p><a href="${escapeHtml(link)}">Xem yêu cầu hậu mãi</a></p>`,
    });
  }

  private async deliver(
    template: string,
    resourceId: string,
    message: { to: string; subject: string; text: string; html: string },
  ): Promise<void> {
    await this.delivery.deliver({ template, resourceId, message });
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
