import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import {
  NotificationDeliveryService,
  type NotificationDelivery,
} from '../notifications/notification-delivery.service.js';
import { buildOneTimeAuthLink } from './auth-one-time-link.js';
import { AuthSessionsRepository } from './repositories/auth-sessions.repository.js';
import { AuthTokensRepository } from './repositories/auth-tokens.repository.js';
import { TokenService } from './token.service.js';
import { ApiError } from '../../common/errors/api-error.js';

export interface PendingEmployeeInvitation {
  rawToken: string;
  expiresAt: Date;
}

/**
 * Narrow Auth-owned port used by backoffice user lifecycle commands.
 * Token persistence and session revocation stay inside the Auth boundary while
 * the caller keeps the surrounding business transaction and audit atomic.
 */
@Injectable()
export class EmployeeIdentityGateway {
  public constructor(
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(AuthTokensRepository) private readonly authTokens: AuthTokensRepository,
    @Inject(AuthSessionsRepository) private readonly sessions: AuthSessionsRepository,
    @Inject(NotificationDeliveryService)
    private readonly notifications: NotificationDeliveryService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public async issueInvitation(
    transaction: Prisma.TransactionClient,
    userId: string,
    issuedAt: Date,
  ): Promise<PendingEmployeeInvitation> {
    if (this.config.mail.enabled === false) {
      throw new ApiError(
        'SERVICE_UNAVAILABLE',
        'Email đang tắt trong bản demo. Dùng tài khoản nhân viên đã có.',
      );
    }
    const rawToken = this.tokens.createOpaqueToken();
    const tokenHash = this.tokens.digestOpaqueToken(rawToken);
    const expiresAt = new Date(
      issuedAt.getTime() + this.config.auth.employeeInviteTtlHours * 3_600_000,
    );

    await this.authTokens.invalidateActive(userId, 'EMPLOYEE_INVITATION', issuedAt, transaction);
    await this.authTokens.create(
      { userId, purpose: 'EMPLOYEE_INVITATION', tokenHash, expiresAt },
      transaction,
    );
    return { rawToken, expiresAt };
  }

  public async revokeAllCredentials(
    transaction: Prisma.TransactionClient,
    userId: string,
    revokedAt: Date,
  ): Promise<void> {
    await this.sessions.revokeAllForUser(userId, transaction);
    await transaction.authToken.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: revokedAt },
    });
  }

  public sendInvitation(
    userId: string,
    email: string,
    rawToken: string,
    expiresAt: Date,
  ): Promise<NotificationDelivery> {
    const url = buildOneTimeAuthLink(this.config.api.webPublicUrl, '/accept-invitation', rawToken);
    const expiry = expiresAt.toISOString();
    return this.notifications.deliver({
      template: 'employee.invited',
      resourceId: userId,
      message: {
        to: email,
        subject: '[rePhone] Lời mời nhân viên',
        text: `Mở liên kết sau để kích hoạt tài khoản nhân viên trước ${expiry}: ${url}`,
        html: `<p>Mở liên kết sau để kích hoạt tài khoản nhân viên trước <strong>${expiry}</strong>:</p><p><a href="${url}">${url}</a></p>`,
      },
    });
  }
}
