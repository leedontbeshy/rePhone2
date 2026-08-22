import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MAIL_PROVIDER,
  type MailMessage,
  type MailProvider,
} from '../../common/providers/mail-provider.js';

export type NotificationDelivery = 'SENT' | 'FAILED';

export interface PaymentNotificationContext {
  paymentId: string;
  orderNumber: string;
  customerEmail: string;
  expectedAmount: string;
  receivedAmount?: string;
  balanceDue?: string;
  reviewSlaDueAt?: Date | null;
  rejectionReason?: string;
}

@Injectable()
export class PaymentLifecycleNotificationService {
  private readonly logger = new Logger(PaymentLifecycleNotificationService.name);

  public constructor(@Inject(MAIL_PROVIDER) private readonly mail: MailProvider) {}

  public sendProofSubmitted(context: PaymentNotificationContext): Promise<NotificationDelivery> {
    const reviewSla =
      context.reviewSlaDueAt === undefined || context.reviewSlaDueAt === null
        ? 'Thời hạn xử lý theo SLA review được hiển thị trên đơn hàng.'
        : `SLA review dự kiến hoàn tất trước ${formatVietnamDeadline(context.reviewSlaDueAt)}.`;
    return this.sendSafely('payment.proof_submitted', context, {
      to: context.customerEmail,
      subject: `[rePhone] Đã nhận bằng chứng cọc cho ${context.orderNumber}`,
      text: `rePhone đã nhận bằng chứng cọc cho đơn ${context.orderNumber}. Khoản thanh toán đang được kiểm tra. ${reviewSla}`,
      html: `<p>rePhone đã nhận bằng chứng cọc cho đơn <strong>${escapeHtml(context.orderNumber)}</strong>.</p><p>Khoản thanh toán đang được kiểm tra. ${escapeHtml(reviewSla)}</p>`,
    });
  }

  public sendVerified(context: PaymentNotificationContext): Promise<NotificationDelivery> {
    const received = formatVnd(context.receivedAmount ?? context.expectedAmount);
    const balance =
      context.balanceDue === undefined
        ? 'Số tiền còn lại được hiển thị trên đơn hàng.'
        : `Số tiền còn lại khi nhận hàng: ${formatVnd(context.balanceDue)}.`;
    return this.sendSafely('payment.verified', context, {
      to: context.customerEmail,
      subject: `[rePhone] Đã xác nhận cọc cho ${context.orderNumber}`,
      text: `rePhone đã xác nhận ${received} cho đơn ${context.orderNumber}. ${balance} Đơn hàng chuyển sang bước chuẩn bị giao.`,
      html: `<p>rePhone đã xác nhận <strong>${escapeHtml(received)}</strong> cho đơn <strong>${escapeHtml(context.orderNumber)}</strong>.</p><p>${escapeHtml(balance)} Đơn hàng chuyển sang bước chuẩn bị giao.</p>`,
    });
  }

  public sendRejected(context: PaymentNotificationContext): Promise<NotificationDelivery> {
    const reason = context.rejectionReason ?? 'Bằng chứng thanh toán không hợp lệ.';
    return this.sendSafely('payment.rejected', context, {
      to: context.customerEmail,
      subject: `[rePhone] Bằng chứng cọc của ${context.orderNumber} bị từ chối`,
      text: `Bằng chứng cọc cho đơn ${context.orderNumber} bị từ chối. Lý do: ${reason}. Đơn hàng đã bị hủy. Hệ thống chưa ghi nhận khoản cọc đã xác minh để hoàn; vui lòng liên hệ rePhone nếu cần đối soát.`,
      html: `<p>Bằng chứng cọc cho đơn <strong>${escapeHtml(context.orderNumber)}</strong> bị từ chối.</p><p>Lý do: ${escapeHtml(reason)}</p><p>Đơn hàng đã bị hủy. Hệ thống chưa ghi nhận khoản cọc đã xác minh để hoàn; vui lòng liên hệ rePhone nếu cần đối soát.</p>`,
    });
  }

  public sendExpired(context: PaymentNotificationContext): Promise<NotificationDelivery> {
    return this.sendSafely('order.cancelled', context, {
      to: context.customerEmail,
      subject: `[rePhone] Đơn ${context.orderNumber} đã hủy`,
      text: `Đơn ${context.orderNumber} đã bị hủy. Lý do: quá hạn nộp bằng chứng cọc. Không có khoản cọc đã xác minh cần hoàn.`,
      html: `<p>Đơn <strong>${escapeHtml(context.orderNumber)}</strong> đã bị hủy.</p><p>Lý do: quá hạn nộp bằng chứng cọc.</p><p>Không có khoản cọc đã xác minh cần hoàn.</p>`,
    });
  }

  private async sendSafely(
    template: string,
    context: PaymentNotificationContext,
    message: MailMessage,
  ): Promise<NotificationDelivery> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await withTimeout(this.mail.send(message), 1_500);
        return 'SENT';
      } catch (error) {
        lastError = error;
      }
    }
    this.logger.error({
      event: 'notification.failed',
      template,
      resourceId: context.paymentId,
      recipientHash: createHash('sha256').update(message.to).digest('hex'),
      errorCategory: lastError instanceof Error ? lastError.name : 'UnknownError',
    });
    return 'FAILED';
  }
}

function formatVnd(value: string): string {
  return `${BigInt(value).toLocaleString('vi-VN')} ₫`;
}

function formatVietnamDeadline(value: Date): string {
  const formatted = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
    hour12: false,
  }).format(value);
  return `${formatted} (Asia/Ho_Chi_Minh)`;
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
