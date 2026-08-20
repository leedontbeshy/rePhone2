import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { MAIL_PROVIDER, type MailProvider } from '../../common/providers/mail-provider.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { User } from '../../generated/prisma/client.js';
import type { RegisterDto } from './auth.dto.js';
import type { RegisteredAccountDto } from './auth-response.dto.js';
import { AuthRateLimiter } from './auth-rate-limiter.service.js';
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

interface InviteEmployeeInput {
  email: string;
  fullName: string;
  employeeCode: string;
  phone?: string;
  hiredAt?: Date;
}

type RefreshOutcome =
  | { kind: 'missing' | 'revoked' | 'reused' }
  | { kind: 'success'; user: User; sessionId: string; expiresAt: Date };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  public constructor(
    private readonly prisma: PrismaService,
    private readonly usersRepository: UsersRepository,
    private readonly sessionsRepository: AuthSessionsRepository,
    private readonly authTokensRepository: AuthTokensRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly rateLimiter: AuthRateLimiter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(MAIL_PROVIDER) private readonly mailProvider: MailProvider,
  ) {}

  public async register(
    input: RegisterDto,
    metadata: RequestMetadata,
  ): Promise<RegisteredAccountDto> {
    this.rateLimiter.register(metadata.ipAddress);
    const normalizedEmail = normalizeEmail(input.email);
    const passwordHash = await this.passwordService.hash(input.password);

    try {
      const user = await this.usersRepository.createCustomer({
        email: input.email.trim(),
        normalizedEmail,
        passwordHash,
        fullName: input.fullName.trim(),
        ...(input.phone === undefined ? {} : { phone: input.phone.trim() }),
      });
      return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        status: user.status,
      };
    } catch (error) {
      if (isPrismaUniqueViolation(error)) {
        throw new ApiError('DUPLICATE_RESOURCE');
      }
      throw error;
    }
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

    const outcome = await this.prisma.$transaction<RefreshOutcome>(async (transaction) => {
      const current = await this.sessionsRepository.lockByRefreshTokenHash(
        currentHash,
        transaction,
      );
      if (current === null) {
        return { kind: 'missing' };
      }
      if (current.revokedAt !== null) {
        await this.sessionsRepository.revokeFamily(current.tokenFamilyId, now, transaction);
        return { kind: 'reused' };
      }
      if (current.expiresAt <= now) {
        await this.sessionsRepository.revoke(current.id, now, transaction);
        return { kind: 'revoked' };
      }

      const user = await this.usersRepository.findById(current.userId, transaction);
      if (user === null || user.status !== 'ACTIVE') {
        await this.sessionsRepository.revokeAllForUser(current.userId, now, transaction);
        return { kind: 'revoked' };
      }

      await this.sessionsRepository.revoke(current.id, now, transaction);
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
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const session = await this.sessionsRepository.lockByRefreshTokenHash(tokenHash, transaction);
      if (session !== null) {
        await this.sessionsRepository.revokeFamily(session.tokenFamilyId, now, transaction);
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
    await this.prisma.$transaction(async (transaction) => {
      await this.authTokensRepository.invalidateActive(user.id, 'RESET_PASSWORD', now, transaction);
      await this.authTokensRepository.create(
        { userId: user.id, purpose: 'RESET_PASSWORD', tokenHash, expiresAt },
        transaction,
      );
    });

    const url = `${this.config.api.webPublicUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await this.sendMailSafely(user.id, {
      to: user.email,
      subject: 'Đặt lại mật khẩu rePhone',
      text: `Mở liên kết sau để đặt lại mật khẩu: ${url}`,
      html: `<p>Mở liên kết sau để đặt lại mật khẩu:</p><p><a href="${url}">${url}</a></p>`,
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

    const changed = await this.prisma.$transaction(async (transaction) => {
      const token = await this.authTokensRepository.lockByHash(tokenHash, transaction);
      if (
        token === null ||
        token.purpose !== 'RESET_PASSWORD' ||
        token.consumedAt !== null ||
        token.expiresAt <= now
      ) {
        return false;
      }
      const user = await this.usersRepository.findById(token.userId, transaction);
      if (user === null || user.status !== 'ACTIVE' || user.passwordHash === null) {
        return false;
      }

      await this.authTokensRepository.consume(token.id, now, transaction);
      await this.authTokensRepository.invalidateActive(user.id, 'RESET_PASSWORD', now, transaction);
      await transaction.user.update({
        where: { id: user.id },
        data: { passwordHash, passwordChangedAt: now },
      });
      await this.sessionsRepository.revokeAllForUser(user.id, now, transaction);
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

    const accepted = await this.prisma.$transaction(async (transaction) => {
      const token = await this.authTokensRepository.lockByHash(tokenHash, transaction);
      if (
        token === null ||
        token.purpose !== 'EMPLOYEE_INVITATION' ||
        token.consumedAt !== null ||
        token.expiresAt <= now
      ) {
        return false;
      }
      const user = await this.usersRepository.findById(token.userId, transaction);
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
      await transaction.user.update({
        where: { id: userId },
        data: { passwordHash, passwordChangedAt: now },
      });
      await this.sessionsRepository.revokeAllForUser(userId, now, transaction);
      await transaction.authToken.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: now },
      });
    });
  }

  public async inviteEmployee(input: InviteEmployeeInput): Promise<{ id: string }> {
    const rawToken = this.tokenService.createOpaqueToken();
    const tokenHash = this.tokenService.digestOpaqueToken(rawToken);
    const now = new Date();
    const expiresAt = addHours(now, this.config.auth.employeeInviteTtlHours);

    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        const created = await this.usersRepository.createPendingEmployee(
          {
            email: input.email.trim(),
            normalizedEmail: normalizeEmail(input.email),
            fullName: input.fullName.trim(),
            employeeCode: input.employeeCode.trim(),
            ...(input.phone === undefined ? {} : { phone: input.phone.trim() }),
            ...(input.hiredAt === undefined ? {} : { hiredAt: input.hiredAt }),
          },
          transaction,
        );
        await this.authTokensRepository.create(
          { userId: created.id, purpose: 'EMPLOYEE_INVITATION', tokenHash, expiresAt },
          transaction,
        );
        return created;
      });
      await this.sendInvitation(user.id, user.email, rawToken);
      return { id: user.id };
    } catch (error) {
      if (isPrismaUniqueViolation(error)) {
        throw new ApiError('DUPLICATE_RESOURCE');
      }
      throw error;
    }
  }

  public async resendEmployeeInvitation(userId: string): Promise<void> {
    const user = await this.usersRepository.findById(userId);
    if (
      user === null ||
      user.role !== 'EMPLOYEE' ||
      user.status !== 'PENDING_VERIFICATION' ||
      user.passwordHash !== null
    ) {
      throw new ApiError('RESOURCE_NOT_FOUND');
    }

    const rawToken = this.tokenService.createOpaqueToken();
    const tokenHash = this.tokenService.digestOpaqueToken(rawToken);
    const now = new Date();
    const expiresAt = addHours(now, this.config.auth.employeeInviteTtlHours);
    await this.prisma.$transaction(async (transaction) => {
      await this.authTokensRepository.invalidateActive(
        user.id,
        'EMPLOYEE_INVITATION',
        now,
        transaction,
      );
      await this.authTokensRepository.create(
        { userId: user.id, purpose: 'EMPLOYEE_INVITATION', tokenHash, expiresAt },
        transaction,
      );
    });
    await this.sendInvitation(user.id, user.email, rawToken);
  }

  private async issueSession(user: User, metadata: RequestMetadata): Promise<SessionIssueResult> {
    const refreshToken = this.tokenService.createOpaqueToken();
    const refreshTokenHash = this.tokenService.digestOpaqueToken(refreshToken);
    const expiresAt = addDays(new Date(), this.config.auth.refreshTtlDays);
    const session = await this.prisma.$transaction(async (transaction) => {
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
      return created;
    });
    return {
      ...(await this.createSessionPayload(user, session.id)),
      refreshToken,
      refreshExpiresAt: expiresAt,
    };
  }

  private async createSessionPayload(user: User, sessionId: string): Promise<SessionPayload> {
    return {
      accessToken: await this.tokenService.signAccessToken(user.id, user.role, sessionId),
      expiresIn: this.config.auth.accessTtlSeconds,
      user: toSafeUser(user),
    };
  }

  private sendInvitation(userId: string, email: string, rawToken: string): Promise<void> {
    const url = `${this.config.api.webPublicUrl}/accept-invitation?token=${encodeURIComponent(rawToken)}`;
    return this.sendMailSafely(userId, {
      to: email,
      subject: 'Lời mời nhân viên rePhone',
      text: `Mở liên kết sau để kích hoạt tài khoản nhân viên: ${url}`,
      html: `<p>Mở liên kết sau để kích hoạt tài khoản nhân viên:</p><p><a href="${url}">${url}</a></p>`,
    });
  }

  private async sendMailSafely(
    userId: string,
    message: { to: string; subject: string; text: string; html: string },
  ): Promise<void> {
    try {
      await this.mailProvider.send(message);
    } catch (error) {
      this.logger.error({ event: 'auth.mail.failed', userId, error });
    }
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

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
