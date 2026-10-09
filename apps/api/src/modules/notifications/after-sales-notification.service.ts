import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { NotificationDeliveryService } from './notification-delivery.service.js';

@Injectable()
export class AfterSalesNotificationService {
  public constructor(
    @Inject(NotificationDeliveryService)
    private readonly delivery: NotificationDeliveryService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService,
  ) {}

  public async sendUpdated(input: {
    requestId: string;
    requestNumber: string;
    orderNumber: string;
    customerEmail: string;
    status: string;
  }): Promise<void> {
    const dealer = await this.prisma?.order.findUnique({
      where: { orderNumber: input.orderNumber },
      select: { channel: true, dealer: { select: { contactEmail: true } } },
    });
    if (dealer?.channel === 'DEALER') {
      if (dealer.dealer === null) return;
      const text = `Yêu cầu hậu mãi ${input.requestNumber} hiện ở trạng thái ${input.status}. Theo dõi tại cổng đại lý rePhone: ${this.config.api.webPublicUrl}/dealer. Vui lòng thông báo kết quả cho khách hàng của bạn.`;
      return this.deliver('dealer.after_sales.updated', input.requestId, {
        to: dealer.dealer.contactEmail,
        subject: `[rePhone] Hậu mãi ${input.requestNumber}`,
        text,
        html: `<p>${escapeHtml(text)}</p>`,
      });
    }
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
