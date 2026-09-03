import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { User } from '../../generated/prisma/client.js';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service.js';
import type { RegisterDto } from './auth.dto.js';
import type { RegistrationResultDto } from './auth-response.dto.js';
import { AuthRateLimiter } from './auth-rate-limiter.service.js';
import { GENERIC_REGISTRATION_MESSAGE } from './auth.constants.js';
import { buildOneTimeAuthLink } from './auth-one-time-link.js';
import type {
  RequestMetadata,
  SafeUser,
  SessionIssueResult,
  SessionPayload,
} from './auth.types.js';
import { PasswordService } from './password.service.js';
import { AuthSessionsRepository } from './repositories/auth-sessions.repository.js';
import { AuthTokensRepository } from './repositories/auth-tokens.repository.js';
import { UsersRepository } from './repositories/users.repository.js';
import { TokenService } from './token.service.js';

const GENERIC_FORGOT_MESSAGE = 'Nếu tài khoản phù hợp, hướng dẫn sẽ được gửi qua email.';

type RefreshOutcome =
  | { kind: 'missing' | 'revoked' | 'reused' }
  | { kind: 'success'; user: User; sessionId: string; expiresAt: Date };

@Injectable()
export class AuthService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UsersRepository) private readonly usersRepository: UsersRepository,
    @Inject(AuthSessionsRepository) private readonly sessionsRepository: AuthSessionsRepository,
    @Inject(AuthTokensRepository) private readonly authTokensRepository: AuthTokensRepository,
    @Inject(PasswordService) private readonly passwordService: PasswordService,
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(AuthRateLimiter) private readonly rateLimiter: AuthRateLimiter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(NotificationDeliveryService)
    private readonly notifications: NotificationDeliveryService,
  ) {}

  public async register(
    input: RegisterDto,
    metadata: RequestMetadata,
  ): Promise<RegistrationResultDto> {
    this.rateLimiter.register(metadata.ipAddress);
    const normalizedEmail = normalizeEmail(input.email);
    const passwordHash = await this.passwordService.hash(input.password);

    try {
      await this.usersRepository.createCustomer({
        email: input.email.trim(),
        normalizedEmail,
        passwordHash,
        fullName: input.fullName.trim(),
        ...(input.phone === undefined ? {} : { phone: input.phone.trim() }),
      });
    } catch (error) {
      if (!isPrismaUniqueViolation(error)) throw error;
    }

    return { message: GENERIC_REGISTRATION_MESSAGE };
  }

  public async login(
    email: string,
    password: string,
    metadata: RequestMetadata,
  ): Promise<SessionIssueResult> {
    const normalizedEmail = normalizeEmail(email);
    this.rateLimiter.login(metadata.ipAddress, normalizedEmail);
    const user = await this.usersRepository.findByNormalizedEmail(normalizedEmail);

    if (user?.passwordHash === null || user === null) {
      await this.passwordService.performDummyVerification(password);
      throw new ApiError('INVALID_CREDENTIALS');
    }

    const passwordMatches = await this.passwordService.verify(user.passwordHash, password);
    if (!passwordMatches) {
      throw new ApiError('INVALID_CREDENTIALS');
    }
    if (user.status === 'PENDING_VERIFICATION') {
      throw new ApiError('INVALID_CREDENTIALS');
    }
    if (user.status !== 'ACTIVE') {
      throw new ApiError('ACCOUNT_UNAVAILABLE');
    }

    return this.issueSession(user, metadata);
  }

  public async refresh(
    refreshToken: string | undefined,
    metadata: RequestMetadata,
  ): Promise<SessionIssueResult> {
    if (refreshToken === undefined || refreshToken.length === 0) {
      throw new ApiError('AUTH_REQUIRED');
    }

    const currentHash = this.tokenService.digestOpaqueToken(refreshToken);
    this.rateLimiter.refresh(metadata.ipAddress, currentHash);
    const successorToken = this.tokenService.createOpaqueToken();
    const successorHash = this.tokenService.digestOpaqueToken(successorToken);
    const now = new Date();
    const candidate = await this.sessionsRepository.findByRefreshTokenHash(currentHash);

    if (candidate === null) {
      throw new ApiError('AUTH_REQUIRED');
    }

    const outcome = await this.prisma.$transaction<RefreshOutcome>(async (transaction) => {
      if (!(await this.usersRepository.lockById(candidate.userId, transaction))) {
        return { kind: 'missing' };
      }
      const current = await this.sessionsRepository.lockByRefreshTokenHash(
        currentHash,
        transaction,
      );
      if (current === null || current.userId !== candidate.userId) {
        return { kind: 'missing' };
      }
      if (current.revokedAt !== null) {
        await this.sessionsRepository.revokeFamily(current.tokenFamilyId, transaction);
        return { kind: 'reused' };
      }
      if (current.expiresAt <= now) {
        await this.sessionsRepository.revoke(current.id, transaction);
        return { kind: 'revoked' };
      }

      const user = await this.usersRepository.findById(candidate.userId, transaction);
      if (user === null || user.status !== 'ACTIVE') {
        await this.sessionsRepository.revokeAllForUser(current.userId, transaction);
        return { kind: 'revoked' };
      }

      await this.sessionsRepository.revoke(current.id, transaction);
      const successor = await this.sessionsRepository.create(
        {
          userId: current.userId,
          refreshTokenHash: successorHash,
          tokenFamilyId: current.tokenFamilyId,
          expiresAt: current.expiresAt,
          ipAddress: metadata.ipAddress,
          ...(metadata.userAgent === undefined ? {} : { userAgent: metadata.userAgent }),
        },
        transaction,
      );
      return { kind: 'success', user, sessionId: successor.id, expiresAt: successor.expiresAt };
    });

    if (outcome.kind === 'missing') {
      throw new ApiError('AUTH_REQUIRED');
    }
    if (outcome.kind !== 'success') {
      throw new ApiError('SESSION_REVOKED');
    }

    return {
      ...(await this.createSessionPayload(outcome.user, outcome.sessionId)),
      refreshToken: successorToken,
      refreshExpiresAt: outcome.expiresAt,
    };
  }

  public async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken === undefined || refreshToken.length === 0) {
      return;
    }
    const tokenHash = this.tokenService.digestOpaqueToken(refreshToken);
    await this.prisma.$transaction(async (transaction) => {
      const session = await this.sessionsRepository.lockByRefreshTokenHash(tokenHash, transaction);
      if (session !== null) {
        await this.sessionsRepository.revokeFamily(session.tokenFamilyId, transaction);
      }
    });
  }

  public async forgotPassword(
    email: string,
    metadata: RequestMetadata,
  ): Promise<{ message: string }> {
    const normalizedEmail = normalizeEmail(email);
    this.rateLimiter.reset(metadata.ipAddress, normalizedEmail);
    const user = await this.usersRepository.findByNormalizedEmail(normalizedEmail);

    if (user === null || user.status !== 'ACTIVE' || user.passwordHash === null) {
      await this.passwordService.performDummyVerification('forgot-password-probe-1');
      return { message: GENERIC_FORGOT_MESSAGE };
    }

    const rawToken = this.tokenService.createOpaqueToken();
    const tokenHash = this.tokenService.digestOpaqueToken(rawToken);
    const now = new Date();
    const expiresAt = addMinutes(now, this.config.auth.passwordResetTtlMinutes);
    const issued = await this.prisma.$transaction(async (transaction) => {
      if (!(await this.usersRepository.lockById(user.id, transaction))) return false;
      const currentUser = await this.usersRepository.findById(user.id, transaction);
      if (
        currentUser === null ||
        currentUser.status !== 'ACTIVE' ||
        currentUser.passwordHash === null
      ) {
        return false;
      }
      await this.authTokensRepository.invalidateActive(user.id, 'RESET_PASSWORD', now, transaction);
      await this.authTokensRepository.create(
        { userId: user.id, purpose: 'RESET_PASSWORD', tokenHash, expiresAt },
        transaction,
      );
      return true;
    });

    if (!issued) return { message: GENERIC_FORGOT_MESSAGE };

    const url = buildOneTimeAuthLink(this.config.api.webPublicUrl, '/reset-password', rawToken);
    await this.sendMailSafely('auth.password_reset_requested', user.id, {
      to: user.email,
      subject: '[rePhone] Đặt lại mật khẩu',
      text: `Mở liên kết sau để đặt lại mật khẩu trước ${expiresAt.toISOString()}: ${url}`,
      html: `<p>Mở liên kết sau để đặt lại mật khẩu trước <strong>${expiresAt.toISOString()}</strong>:</p><p><a href="${url}">${url}</a></p>`,
    });
    return { message: GENERIC_FORGOT_MESSAGE };
  }

  public async resetPassword(
    rawToken: string,
    newPassword: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    const tokenHash = this.tokenService.digestOpaqueToken(rawToken);
    this.rateLimiter.reset(metadata.ipAddress, tokenHash);
    const passwordHash = await this.passwordService.hash(newPassword);
    const now = new Date();
    const candidate = await this.authTokensRepository.findByHash(tokenHash);

    const changed =
      candidate === null
        ? false
        : await this.prisma.$transaction(async (transaction) => {
            if (!(await this.usersRepository.lockById(candidate.userId, transaction))) {
              return false;
            }
            const token = await this.authTokensRepository.lockByHash(tokenHash, transaction);
            if (
              token === null ||
              token.userId !== candidate.userId ||
              token.purpose !== 'RESET_PASSWORD' ||
              token.consumedAt !== null ||
              token.expiresAt <= now
            ) {
              return false;
            }
            const user = await this.usersRepository.findById(candidate.userId, transaction);
            if (user === null || user.status !== 'ACTIVE' || user.passwordHash === null) {
              return false;
            }

            await this.authTokensRepository.consume(token.id, now, transaction);
            await this.authTokensRepository.invalidateActive(
              user.id,
              'RESET_PASSWORD',
              now,
              transaction,
            );
            await transaction.user.update({
              where: { id: user.id },
              data: { passwordHash, passwordChangedAt: now },
            });
            await this.sessionsRepository.revokeAllForUser(user.id, transaction);
            return true;
          });

    if (!changed) {
      throw new ApiError('ONE_TIME_TOKEN_INVALID');
    }
  }

  public async acceptEmployeeInvitation(
    rawToken: string,
    password: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    const tokenHash = this.tokenService.digestOpaqueToken(rawToken);
    this.rateLimiter.invitation(metadata.ipAddress, tokenHash);
    const passwordHash = await this.passwordService.hash(password);
    const now = new Date();
    const candidate = await this.authTokensRepository.findByHash(tokenHash);

    const accepted =
      candidate === null
        ? false
        : await this.prisma.$transaction(async (transaction) => {
            if (!(await this.usersRepository.lockById(candidate.userId, transaction))) {
              return false;
            }
            const token = await this.authTokensRepository.lockByHash(tokenHash, transaction);
            if (
              token === null ||
              token.userId !== candidate.userId ||
              token.purpose !== 'EMPLOYEE_INVITATION' ||
              token.consumedAt !== null ||
              token.expiresAt <= now
            ) {
              return false;
            }
            const user = await this.usersRepository.findById(candidate.userId, transaction);
            if (
              user === null ||
              user.role !== 'EMPLOYEE' ||
              user.status !== 'PENDING_VERIFICATION' ||
              user.passwordHash !== null
            ) {
              return false;
            }

            await this.authTokensRepository.consume(token.id, now, transaction);
            await this.authTokensRepository.invalidateActive(
              user.id,
              'EMPLOYEE_INVITATION',
              now,
              transaction,
            );
            await transaction.user.update({
              where: { id: user.id },
              data: {
                status: 'ACTIVE',
                passwordHash,
                emailVerifiedAt: now,
                passwordChangedAt: now,
              },
            });
            return true;
          });

    if (!accepted) {
      throw new ApiError('ONE_TIME_TOKEN_INVALID');
    }
  }

  public async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersRepository.findById(userId);
    if (user?.passwordHash === null || user === null) {
      throw new ApiError('CURRENT_PASSWORD_INCORRECT');
    }
    if (!(await this.passwordService.verify(user.passwordHash, currentPassword))) {
      throw new ApiError('CURRENT_PASSWORD_INCORRECT');
    }

    const passwordHash = await this.passwordService.hash(newPassword);
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      if (!(await this.usersRepository.lockById(userId, transaction))) {
        throw new ApiError('CURRENT_PASSWORD_INCORRECT');
      }
      const currentUser = await this.usersRepository.findById(userId, transaction);
      if (
        currentUser === null ||
        currentUser.status !== 'ACTIVE' ||
        currentUser.passwordHash !== user.passwordHash
      ) {
        throw new ApiError('CURRENT_PASSWORD_INCORRECT');
      }
      await transaction.user.update({
        where: { id: userId },
        data: { passwordHash, passwordChangedAt: now },
      });
      await this.sessionsRepository.revokeAllForUser(userId, transaction);
      await transaction.authToken.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: now },
      });
    });
  }

  private async issueSession(user: User, metadata: RequestMetadata): Promise<SessionIssueResult> {
    const refreshToken = this.tokenService.createOpaqueToken();
    const refreshTokenHash = this.tokenService.digestOpaqueToken(refreshToken);
    const expiresAt = addDays(new Date(), this.config.auth.refreshTtlDays);
    const result = await this.prisma.$transaction(async (transaction) => {
      if (!(await this.usersRepository.lockById(user.id, transaction))) {
        throw new ApiError('INVALID_CREDENTIALS');
      }
      const currentUser = await this.usersRepository.findById(user.id, transaction);
      if (currentUser === null || currentUser.status !== 'ACTIVE') {
        throw new ApiError('ACCOUNT_UNAVAILABLE');
      }
      const created = await this.sessionsRepository.create(
        {
          userId: user.id,
          refreshTokenHash,
          tokenFamilyId: randomUUID(),
          expiresAt,
          ipAddress: metadata.ipAddress,
          ...(metadata.userAgent === undefined ? {} : { userAgent: metadata.userAgent }),
        },
        transaction,
      );
      await transaction.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      return { session: created, user: currentUser };
    });
    return {
      ...(await this.createSessionPayload(result.user, result.session.id)),
      refreshToken,
      refreshExpiresAt: result.session.expiresAt,
    };
  }

  private async createSessionPayload(user: User, sessionId: string): Promise<SessionPayload> {
    return {
      accessToken: await this.tokenService.signAccessToken(user.id, user.role, sessionId),
      expiresIn: this.config.auth.accessTtlSeconds,
      user: toSafeUser(user),
    };
  }

  private async sendMailSafely(
    template: 'auth.password_reset_requested' | 'employee.invited',
    userId: string,
    message: { to: string; subject: string; text: string; html: string },
  ): Promise<void> {
    await this.notifications.deliver({
      template,
      resourceId: userId,
      message,
    });
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    fullName: user.fullName,
    phone: user.phone,
  };
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
