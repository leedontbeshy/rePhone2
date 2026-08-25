import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import { AfterSalesNotificationService } from './after-sales-notification.service.js';
import { NotificationDeliveryService } from './notification-delivery.service.js';

describe('AfterSalesNotificationService', () => {
  it('adds the public order number hint without exposing a guest credential', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const service = new AfterSalesNotificationService(new NotificationDeliveryService({ send }), {
      api: { webPublicUrl: 'https://web.test' },
    } as AppConfig);

    await service.sendUpdated({
      requestId: 'case-1',
      requestNumber: 'RPH-AS-20260825-234567',
      orderNumber: 'RPH-20260825-23456789',
      customerEmail: 'customer@example.com',
      status: 'REQUESTED',
    });

    const message = send.mock.calls[0]?.[0] as { text: string; html: string };
    expect(message.text).toContain(
      '/after-sales/RPH-AS-20260825-234567?orderNumber=RPH-20260825-23456789',
    );
    expect(message.html).not.toContain('guestAccessToken');
    expect(message.html).not.toContain('X-Guest-Order-Token');
  });
});
