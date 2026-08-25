import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MailMessage, MailProvider } from '../../common/providers/mail-provider.js';
import { NotificationDeliveryService } from './notification-delivery.service.js';
import { PaymentLifecycleNotificationService } from './payment-lifecycle-notification.service.js';

class RecordingMailProvider implements MailProvider {
  public readonly messages: MailMessage[] = [];

  public send(message: MailMessage): Promise<void> {
    this.messages.push(message);
    return Promise.resolve();
  }
}

describe('PaymentLifecycleNotificationService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders submitted, verified, rejected and expired messages without evidence data', async () => {
    const mail = new RecordingMailProvider();
    const service = new PaymentLifecycleNotificationService(new NotificationDeliveryService(mail));
    const context = {
      paymentId: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6997',
      orderNumber: 'RPH-20260821-23456789',
      customerEmail: 'customer@example.com',
      expectedAmount: '500000',
      reviewSlaDueAt: new Date('2026-08-21T03:30:00.000Z'),
    };

    await expect(service.sendProofSubmitted(context)).resolves.toBe('SENT');
    await expect(
      service.sendVerified({ ...context, receivedAmount: '600000', balanceDue: '430000' }),
    ).resolves.toBe('SENT');
    await expect(
      service.sendRejected({ ...context, rejectionReason: 'Ảnh chuyển khoản không hợp lệ' }),
    ).resolves.toBe('SENT');
    await expect(service.sendExpired(context)).resolves.toBe('SENT');

    expect(mail.messages).toHaveLength(4);
    expect(mail.messages[0]?.text).toContain('SLA');
    expect(mail.messages[0]?.text).toContain('Asia/Ho_Chi_Minh');
    expect(mail.messages[1]?.text).toContain('600.000 ₫');
    expect(mail.messages[1]?.text).toContain('430.000 ₫');
    expect(mail.messages[2]?.text).toContain('Ảnh chuyển khoản không hợp lệ');
    expect(mail.messages[2]?.text).toContain('Đơn hàng đã bị hủy');
    expect(mail.messages[3]?.subject).toBe('[rePhone] Đơn RPH-20260821-23456789 đã hủy');
    expect(mail.messages[3]?.text).toContain('Không có khoản cọc đã xác minh cần hoàn');
    expect(mail.messages.map((message) => message.text).join(' ')).not.toContain('bucket');
  });

  it('returns FAILED after provider retries and logs expiry with order-cancelled semantics', async () => {
    let attempts = 0;
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new PaymentLifecycleNotificationService(
      new NotificationDeliveryService({
        send: () => {
          attempts += 1;
          return Promise.reject(new Error('SMTP unavailable'));
        },
      }),
    );
    await expect(
      service.sendExpired({
        paymentId: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6997',
        orderNumber: 'RPH-20260821-23456789',
        customerEmail: 'customer@example.com',
        expectedAmount: '500000',
      }),
    ).resolves.toBe('FAILED');
    expect(attempts).toBe(2);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'notification.failed', template: 'order.cancelled' }),
    );
  });
});
