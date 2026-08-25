import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MailMessage } from '../../common/providers/mail-provider.js';
import { NotificationDeliveryService } from './notification-delivery.service.js';

const message: MailMessage = {
  to: 'customer@example.com',
  subject: '[rePhone] Test',
  text: 'Secret body',
  html: '<p>Secret body</p>',
};

describe('NotificationDeliveryService', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns SENT without retry when the provider succeeds', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const service = new NotificationDeliveryService({ send });

    await expect(
      service.deliver({ template: 'order.completed', resourceId: 'order-1', message }),
    ).resolves.toBe('SENT');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('tries at most twice and logs only safe failure metadata', async () => {
    const send = vi.fn().mockRejectedValue(new Error('SMTP unavailable for customer@example.com'));
    const logger = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new NotificationDeliveryService({ send });

    await expect(
      service.deliver({ template: 'order.completed', resourceId: 'order-1', message }),
    ).resolves.toBe('FAILED');

    expect(send).toHaveBeenCalledTimes(2);
    expect(logger).toHaveBeenCalledWith({
      event: 'notification.failed',
      template: 'order.completed',
      resourceId: 'order-1',
      attempt: 2,
      errorCategory: 'Error',
    });
    expect(JSON.stringify(logger.mock.calls)).not.toContain(message.to);
    expect(JSON.stringify(logger.mock.calls)).not.toContain(message.text);
  });

  it('stops after the three-second total timeout', async () => {
    vi.useFakeTimers();
    const send = vi.fn(() => new Promise<void>(() => undefined));
    const logger = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new NotificationDeliveryService({ send });

    const result = service.deliver({
      template: 'auth.password_reset_requested',
      resourceId: 'user-1',
      message,
    });
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(result).resolves.toBe('FAILED');
    expect(send).toHaveBeenCalledTimes(2);
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({ errorCategory: 'NotificationTimeoutError', attempt: 2 }),
    );
  });

  it('categorizes a non-Error provider rejection without logging message contents', async () => {
    const send = vi.fn().mockRejectedValue('provider rejected');
    const logger = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new NotificationDeliveryService({ send });

    await expect(
      service.deliver({ template: 'employee.invited', resourceId: 'employee-1', message }),
    ).resolves.toBe('FAILED');
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({ errorCategory: 'UnknownError', attempt: 2 }),
    );
    expect(JSON.stringify(logger.mock.calls)).not.toContain('provider rejected');
  });

  it('does not start another provider attempt after the total deadline', async () => {
    const send = vi.fn().mockRejectedValue(new Error('first failure'));
    const logger = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(3_001);
    const service = new NotificationDeliveryService({ send });

    await expect(
      service.deliver({ template: 'employee.invited', resourceId: 'employee-1', message }),
    ).resolves.toBe('FAILED');

    expect(send).toHaveBeenCalledOnce();
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({ errorCategory: 'Error', attempt: 1 }),
    );
  });

  it('handles a synchronous timer setup failure without attempting timer cleanup', async () => {
    const send = vi.fn(() => new Promise<void>(() => undefined));
    const logger = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(() => {
      throw new Error('timer unavailable');
    });
    const service = new NotificationDeliveryService({ send });

    await expect(
      service.deliver({ template: 'employee.invited', resourceId: 'employee-1', message }),
    ).resolves.toBe('FAILED');

    expect(send).toHaveBeenCalledTimes(2);
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({ errorCategory: 'Error', attempt: 2 }),
    );
  });
});
