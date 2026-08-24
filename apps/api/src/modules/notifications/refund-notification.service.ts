import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MAIL_PROVIDER,
  type MailMessage,
  type MailProvider,
} from '../../common/providers/mail-provider.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';

@Injectable()
export class RefundNotificationService {
  private readonly logger = new Logger(RefundNotificationService.name);

  public constructor(
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
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
    return this.sendSafely('refund.completed', input.refundId, {
      to: input.customerEmail,
      subject: `[rePhone] Đã hoàn tiền đơn ${input.orderNumber}`,
      text: `Khoản hoàn ${amount} cho đơn ${input.orderNumber} đã hoàn tất qua ${input.method}. Xem đơn: ${link}`,
      html: `<p>Khoản hoàn <strong>${escapeHtml(amount)}</strong> cho đơn <strong>${escapeHtml(input.orderNumber)}</strong> đã hoàn tất.</p><p>Phương thức: ${escapeHtml(input.method)}.</p><p><a href="${escapeHtml(link)}">Xem đơn hàng</a></p>`,
    });
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
