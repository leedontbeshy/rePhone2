import { describe, expect, it } from 'vitest';
import type { MailMessage, MailProvider } from '../../common/providers/mail-provider.js';
import { PaymentLifecycleNotificationService } from './payment-lifecycle-notification.service.js';

class RecordingMailProvider implements MailProvider {
  public readonly messages: MailMessage[] = [];

  public send(message: MailMessage): Promise<void> {
    this.messages.push(message);
    return Promise.resolve();
  }
}

describe('PaymentLifecycleNotificationService', () => {
  it('renders submitted, verified, rejected and expired messages without evidence data', async () => {
    const mail = new RecordingMailProvider();
    const service = new PaymentLifecycleNotificationService(mail);
    const context = {
      paymentId: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6997',
      orderNumber: 'RPH-20260821-23456789',
      customerEmail: 'customer@example.com',
      expectedAmount: '500000',
    };

    await expect(service.sendProofSubmitted(context)).resolves.toBe('SENT');
    await expect(service.sendVerified({ ...context, receivedAmount: '600000' })).resolves.toBe(
      'SENT',
    );
    await expect(
      service.sendRejected({ ...context, rejectionReason: 'Ảnh chuyển khoản không hợp lệ' }),
    ).resolves.toBe('SENT');
    await expect(service.sendExpired(context)).resolves.toBe('SENT');

    expect(mail.messages).toHaveLength(4);
    expect(mail.messages[1]?.text).toContain('600.000 ₫');
    expect(mail.messages[2]?.text).toContain('Ảnh chuyển khoản không hợp lệ');
    expect(mail.messages.map((message) => message.text).join(' ')).not.toContain('bucket');
  });

  it('returns FAILED after provider retries instead of throwing', async () => {
    let attempts = 0;
    const service = new PaymentLifecycleNotificationService({
      send: () => {
        attempts += 1;
        return Promise.reject(new Error('SMTP unavailable'));
      },
    });
    await expect(
      service.sendVerified({
        paymentId: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6997',
        orderNumber: 'RPH-20260821-23456789',
        customerEmail: 'customer@example.com',
        expectedAmount: '500000',
      }),
    ).resolves.toBe('FAILED');
    expect(attempts).toBe(2);
  });
});
