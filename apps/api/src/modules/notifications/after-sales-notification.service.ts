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
export class AfterSalesNotificationService {
  private readonly logger = new Logger(AfterSalesNotificationService.name);

  public constructor(
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
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
    return this.sendSafely('after_sales.updated', input.requestId, {
      to: input.customerEmail,
      subject: `[rePhone] Cập nhật hậu mãi ${input.requestNumber}`,
      text: `Yêu cầu ${input.requestNumber} của đơn ${input.orderNumber} hiện ở trạng thái ${input.status}. Xem chi tiết: ${link}`,
      html: `<p>Yêu cầu <strong>${escapeHtml(input.requestNumber)}</strong> của đơn <strong>${escapeHtml(input.orderNumber)}</strong> hiện ở trạng thái <strong>${escapeHtml(input.status)}</strong>.</p><p><a href="${escapeHtml(link)}">Xem yêu cầu hậu mãi</a></p>`,
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
