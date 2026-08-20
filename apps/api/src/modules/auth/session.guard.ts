import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { AuthSessionsRepository } from './repositories/auth-sessions.repository.js';
import { TokenService } from './token.service.js';

@Injectable()
export class SessionGuard implements CanActivate {
  public constructor(
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(AuthSessionsRepository) private readonly sessionsRepository: AuthSessionsRepository,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.get('authorization');
    if (authorization === undefined) {
      throw new ApiError('AUTH_REQUIRED');
    }

    const match = /^Bearer ([^\s]+)$/.exec(authorization);
    if (match === null) {
      throw new ApiError('ACCESS_TOKEN_INVALID');
    }
    const token = match[1];
    if (token === undefined) {
      throw new ApiError('ACCESS_TOKEN_INVALID');
    }

    let claims;
    try {
      claims = await this.tokenService.verifyAccessToken(token);
    } catch {
      throw new ApiError('ACCESS_TOKEN_INVALID');
    }

    if (
      typeof claims.sub !== 'string' ||
      typeof claims.sessionId !== 'string' ||
      !['ADMIN', 'EMPLOYEE', 'CUSTOMER'].includes(claims.role)
    ) {
      throw new ApiError('ACCESS_TOKEN_INVALID');
    }

    const session = await this.sessionsRepository.findAccessSession(claims.sessionId);
    if (
      session === null ||
      session.userId !== claims.sub ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE' ||
      session.user.role !== claims.role
    ) {
      throw new ApiError('SESSION_REVOKED');
    }

    request.auth = {
      userId: session.userId,
      role: session.user.role,
      sessionId: session.id,
    };
    return true;
  }
}
