import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MAIL_PROVIDER,
  type MailMessage,
  type MailProvider,
} from '../../common/providers/mail-provider.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import type { OrderDetailDto } from '../orders/order-response.dto.js';

@Injectable()
export class OrderNotificationService {
  private readonly logger = new Logger(OrderNotificationService.name);

  public constructor(
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public sendPlaced(order: OrderDetailDto, guestAccessToken?: string): Promise<void> {
    const link = this.orderLink(order.orderNumber, guestAccessToken);
    const pickup = order.fulfillmentType === 'PICKUP';
    const instructions = pickup
      ? `Địa điểm nhận: ${order.pickupStore?.name ?? 'rePhone'}.`
      : order.paymentAttempts[0] === undefined
        ? 'Đơn không yêu cầu cọc.'
        : `Số tiền cọc: ${formatVnd(order.paymentAttempts[0].expectedAmount)}. Nội dung: ${order.paymentAttempts[0].transferContent ?? order.orderNumber}.`;
    return this.sendSafely(pickup ? 'order.placed_pickup' : 'order.placed_shipping', order.id, {
      to: order.contact.email,
      subject: `[rePhone] Đã nhận đơn ${order.orderNumber}`,
      text: `rePhone đã nhận đơn ${order.orderNumber}. ${instructions} Xem đơn: ${link}`,
      html: `<p>rePhone đã nhận đơn <strong>${escapeHtml(order.orderNumber)}</strong>.</p><p>${escapeHtml(instructions)}</p><p><a href="${escapeHtml(link)}">Xem đơn hàng</a></p>`,
    });
  }

  public sendCancelled(order: {
    id: string;
    orderNumber: string;
    contact: { email: string };
    cancelReason: string | null;
    refunds: Array<{ status: string; amount: string }>;
  }): Promise<void> {
    const refund = order.refunds.find(({ status }) => ['REQUESTED', 'PROCESSING'].includes(status));
    const refundText =
      refund === undefined
        ? ''
        : ` Nghĩa vụ hoàn tiền: ${formatVnd(refund.amount)} đang chờ xử lý.`;
    return this.sendSafely('order.cancelled', order.id, {
      to: order.contact.email,
      subject: `[rePhone] Đơn ${order.orderNumber} đã hủy`,
      text: `Đơn ${order.orderNumber} đã được hủy. Lý do: ${order.cancelReason ?? 'Theo yêu cầu khách hàng'}.${refundText}`,
      html: `<p>Đơn <strong>${escapeHtml(order.orderNumber)}</strong> đã được hủy.</p><p>Lý do: ${escapeHtml(order.cancelReason ?? 'Theo yêu cầu khách hàng')}.</p>${refund === undefined ? '' : `<p>${escapeHtml(refundText.trim())}</p>`}`,
    });
  }

  public sendPickupReady(order: {
    id: string;
    orderNumber: string;
    contact: { email: string };
    location: { name: string };
    pickupHoldUntil: string | null;
    storeAddress: string;
  }): Promise<void> {
    const deadline =
      order.pickupHoldUntil === null
        ? 'theo xác nhận của cửa hàng'
        : formatDateTime(order.pickupHoldUntil);
    const link = this.orderLink(order.orderNumber);
    return this.sendSafely('pickup.ready', order.id, {
      to: order.contact.email,
      subject: `[rePhone] Đơn ${order.orderNumber} đã sẵn sàng nhận`,
      text: `Đơn ${order.orderNumber} đã sẵn sàng tại ${order.location.name}, ${order.storeAddress}. Vui lòng nhận trước ${deadline}. Xem đơn: ${link}`,
      html: `<p>Đơn <strong>${escapeHtml(order.orderNumber)}</strong> đã sẵn sàng nhận.</p><p>${escapeHtml(order.location.name)}, ${escapeHtml(order.storeAddress)}.</p><p>Vui lòng nhận trước ${escapeHtml(deadline)}.</p><p><a href="${escapeHtml(link)}">Xem đơn hàng</a></p>`,
    });
  }

  public sendCompleted(order: {
    id: string;
    orderNumber: string;
    contact: { email: string };
    pricing: { paidAmount: string; refundedAmount: string };
    items: Array<{ warranty: { warrantyCode: string } | null }>;
  }): Promise<void> {
    const warrantyCodes = order.items.flatMap(({ warranty }) =>
      warranty === null ? [] : [warranty.warrantyCode],
    );
    const warrantyText =
      warrantyCodes.length === 0
        ? 'Đơn không phát sinh bảo hành.'
        : `Mã bảo hành: ${warrantyCodes.join(', ')}.`;
    const link = this.orderLink(order.orderNumber);
    return this.sendSafely('order.completed', order.id, {
      to: order.contact.email,
      subject: `[rePhone] Đơn ${order.orderNumber} đã hoàn tất`,
      text: `Đơn ${order.orderNumber} đã hoàn tất. Đã thanh toán: ${formatVnd(order.pricing.paidAmount)}. Đã hoàn: ${formatVnd(order.pricing.refundedAmount)}. ${warrantyText} Xem đơn: ${link}`,
      html: `<p>Đơn <strong>${escapeHtml(order.orderNumber)}</strong> đã hoàn tất.</p><p>Đã thanh toán: ${escapeHtml(formatVnd(order.pricing.paidAmount))}. Đã hoàn: ${escapeHtml(formatVnd(order.pricing.refundedAmount))}.</p><p>${escapeHtml(warrantyText)}</p><p><a href="${escapeHtml(link)}">Xem đơn hàng</a></p>`,
    });
  }

  private orderLink(orderNumber: string, token?: string): string {
    const base = `${this.config.api.webPublicUrl}/orders/${encodeURIComponent(orderNumber)}`;
    return token === undefined ? base : `${base}#token=${encodeURIComponent(token)}`;
  }

  private async sendSafely(
    template: string,
    resourceId: string,
    message: MailMessage,
  ): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await withTimeout(this.mail.send(message), 1_500);
        return;
      } catch (error) {
        lastError = error;
      }
    }
    this.logger.error({
      event: 'notification.failed',
      template,
      resourceId,
      recipientHash: createHash('sha256').update(message.to).digest('hex'),
      errorCategory: lastError instanceof Error ? lastError.name : 'UnknownError',
    });
  }
}

function formatVnd(value: string): string {
  return `${BigInt(value).toLocaleString('vi-VN')} ₫`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('MailTimeout'));
        }, milliseconds);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
