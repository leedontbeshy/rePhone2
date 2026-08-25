import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import type {
  NotificationDelivery,
  NotificationDeliveryInput,
} from '../notifications/notification-delivery.service.js';
import { EmployeeIdentityGateway } from './employee-identity.gateway.js';

describe('EmployeeIdentityGateway notification', () => {
  it('uses a fragment token, branded subject and explicit invitation expiry', async () => {
    const deliver = vi
      .fn<(input: NotificationDeliveryInput) => Promise<NotificationDelivery>>()
      .mockResolvedValue('SENT');
    const notifications = { deliver };
    const gateway = new EmployeeIdentityGateway(
      { createOpaqueToken: vi.fn(), digestOpaqueToken: vi.fn() } as never,
      { invalidateActive: vi.fn(), create: vi.fn() } as never,
      { revokeAllForUser: vi.fn() } as never,
      notifications as never,
      {
        api: { webPublicUrl: 'https://shop.rephone.test' },
      } as AppConfig,
    );
    const expiresAt = new Date('2026-08-26T08:00:00.000Z');

    await expect(
      gateway.sendInvitation('employee-1', 'employee@example.test', 'raw-secret', expiresAt),
    ).resolves.toBe('SENT');

    const delivery = deliver.mock.calls[0]?.[0];
    expect(delivery).toBeDefined();
    if (delivery === undefined) throw new Error('Expected an invitation delivery');
    expect(delivery.message.subject).toBe('[rePhone] Lời mời nhân viên');
    expect(delivery.message.text).toContain(expiresAt.toISOString());
    expect(delivery.message.text).toContain('/accept-invitation#token=raw-secret');
    expect(delivery.message.text).not.toContain('?token=');
  });
});
