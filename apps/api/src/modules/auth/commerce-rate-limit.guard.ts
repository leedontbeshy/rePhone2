import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { CommerceRateLimiter } from './commerce-rate-limiter.service.js';
import { GuestCartIdentityService } from './guest-cart-identity.service.js';

@Injectable()
export class CommerceRateLimitGuard implements CanActivate {
  public constructor(
    @Inject(CommerceRateLimiter) private readonly limiter: CommerceRateLimiter,
    @Inject(GuestCartIdentityService)
    private readonly guestIdentity: GuestCartIdentityService,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.guestIdentity.readToken(request);
    const actorKey =
      request.auth === undefined
        ? token === undefined
          ? `ip:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`
          : `guest:${this.guestIdentity.digestToken(token)}`
        : `user:${request.auth.userId}`;
    this.limiter.consume(actorKey);
    return true;
  }
}
