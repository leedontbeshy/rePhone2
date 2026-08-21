import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { GuestCartIdentityService } from '../auth/guest-cart-identity.service.js';
import { ORDER_RATE_LIMIT_KEY, type OrderRateLimitKind } from './order-rate-limit.decorator.js';
import { OrderRateLimiter } from './order-rate-limiter.service.js';

@Injectable()
export class OrderRateLimitGuard implements CanActivate {
  public constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(OrderRateLimiter) private readonly limiter: OrderRateLimiter,
    @Inject(GuestCartIdentityService)
    private readonly guestCartIdentity: GuestCartIdentityService,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const kind = this.reflector.getAllAndOverride<OrderRateLimitKind>(ORDER_RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (kind === undefined) return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (kind === 'GUEST_ORDER' && request.auth !== undefined) return true;
    const token = this.guestCartIdentity.readToken(request);
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const actorKey =
      kind === 'GUEST_ORDER'
        ? `ip:${ip}:order:${request.params.orderNumber ?? 'unknown'}`
        : request.auth !== undefined
          ? `customer:${request.auth.userId}`
          : token === undefined
            ? `ip:${ip}`
            : `cart:${this.guestCartIdentity.digestToken(token)}`;
    this.limiter.consume(kind, actorKey);
    return true;
  }
}
