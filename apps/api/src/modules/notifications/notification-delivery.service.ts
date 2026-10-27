import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MAIL_PROVIDER,
  type MailMessage,
  type MailProvider,
} from '../../common/providers/mail-provider.js';
import { MailDisabledError } from '../../common/providers/smtp-mail.provider.js';

export type NotificationDelivery = 'SENT' | 'FAILED';

export interface NotificationDeliveryInput {
  template: string;
  resourceId: string;
  message: MailMessage;
}

const MAX_ATTEMPTS = 2;
const ATTEMPT_TIMEOUT_MS = 1_500;
const TOTAL_TIMEOUT_MS = 3_000;

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  public constructor(@Inject(MAIL_PROVIDER) private readonly mail: MailProvider) {}

  public async deliver(input: NotificationDeliveryInput): Promise<NotificationDelivery> {
    const deadline = Date.now() + TOTAL_TIMEOUT_MS;
    let lastError: unknown;
    let attempts = 0;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;

      attempts = attempt;
      try {
        await withTimeout(this.mail.send(input.message), Math.min(ATTEMPT_TIMEOUT_MS, remainingMs));
        return 'SENT';
      } catch (error) {
        if (error instanceof MailDisabledError) return 'FAILED';
        lastError = error;
      }
    }

    this.logger.error({
      event: 'notification.failed',
      template: input.template,
      resourceId: input.resourceId,
      attempt: attempts,
      errorCategory: errorCategory(lastError),
    });
    return 'FAILED';
  }
}

class NotificationTimeoutError extends Error {
  public constructor() {
    super('Notification provider timed out.');
    this.name = 'NotificationTimeoutError';
  }
}

function errorCategory(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new NotificationTimeoutError());
        }, milliseconds);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
