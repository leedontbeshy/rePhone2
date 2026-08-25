import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { NotificationDeliveryService } from './notification-delivery.service.js';

@Injectable()
export class RefundNotificationService {
  public constructor(
    @Inject(NotificationDeliveryService)
    private readonly delivery: NotificationDeliveryService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public sendCompleted(input: {
    refundId: string;
    orderNumber: string;
    customerEmail: string;
    amount: string;
    method: string;
  }): Promise<void> {
    const link = `${this.config.api.webPublicUrl}/orders/${encodeURIComponent(input.orderNumber)}`;
    const amount = `${BigInt(input.amount).toLocaleString('vi-VN')} ₫`;
    return this.deliver('refund.completed', input.refundId, {
      to: input.customerEmail,
      subject: `[rePhone] Đã hoàn tiền đơn ${input.orderNumber}`,
      text: `Khoản hoàn ${amount} cho đơn ${input.orderNumber} đã hoàn tất qua ${input.method}. Xem đơn: ${link}`,
      html: `<p>Khoản hoàn <strong>${escapeHtml(amount)}</strong> cho đơn <strong>${escapeHtml(input.orderNumber)}</strong> đã hoàn tất.</p><p>Phương thức: ${escapeHtml(input.method)}.</p><p><a href="${escapeHtml(link)}">Xem đơn hàng</a></p>`,
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
