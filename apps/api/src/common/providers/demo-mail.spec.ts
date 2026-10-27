import { describe, expect, it, vi } from 'vitest';
import { DisabledMailProvider } from './smtp-mail.provider.js';
import { NotificationDeliveryService } from '../../modules/notifications/notification-delivery.service.js';

describe('disabled demo email', () => {
  it('does not report delivery, retry or contact SMTP', async () => {
    const provider = new DisabledMailProvider();
    const send = vi.spyOn(provider, 'send');
    const service = new NotificationDeliveryService(provider);
    expect(
      await service.deliver({
        template: 'demo',
        resourceId: 'test',
        message: { to: 'fake@example.invalid', subject: 'demo', text: 'demo', html: 'demo' },
      }),
    ).toBe('FAILED');
    expect(send).toHaveBeenCalledTimes(1);
    expect(await provider.probe()).toBe('not-configured');
  });
});
