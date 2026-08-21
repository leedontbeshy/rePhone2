import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import {
  BACKOFFICE_RATE_LIMIT_METADATA_KEY,
  type BackofficeRateLimitKind,
} from './backoffice-rate-limit.decorator.js';
import { BackofficeRateLimiter } from './backoffice-rate-limiter.service.js';

@Injectable()
export class BackofficeRateLimitGuard implements CanActivate {
  public constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(BackofficeRateLimiter) private readonly rateLimiter: BackofficeRateLimiter,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const kind = this.reflector.getAllAndOverride<BackofficeRateLimitKind | undefined>(
      BACKOFFICE_RATE_LIMIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (kind === undefined) {
      return true;
    }
    const auth = context.switchToHttp().getRequest<Request>().auth;
    if (auth === undefined) {
      throw new ApiError('AUTH_REQUIRED');
    }
    this.rateLimiter.consume(auth.userId, kind);
    return true;
  }
}
