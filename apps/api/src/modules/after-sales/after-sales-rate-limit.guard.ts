import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { GuestCartIdentityService } from '../auth/guest-cart-identity.service.js';
import { GuestOrderIdentityService } from '../order-transaction-ports/guest-order-identity.service.js';
import { AfterSalesRateLimiter } from './after-sales-rate-limiter.service.js';

@Injectable()
export class AfterSalesRateLimitGuard implements CanActivate {
  public constructor(
    @Inject(AfterSalesRateLimiter) private readonly limiter: AfterSalesRateLimiter,
    @Inject(GuestOrderIdentityService)
    private readonly guestOrders: GuestOrderIdentityService,
    @Inject(GuestCartIdentityService) private readonly guestCarts: GuestCartIdentityService,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.auth !== undefined) {
      this.limiter.consume(`customer:${request.auth.userId}`);
      return true;
    }
    const orderToken = this.guestOrders.readToken(request);
    if (orderToken !== undefined) {
      this.limiter.consume(`guest-order:${this.guestOrders.digestToken(orderToken)}`);
      return true;
    }
    const cartToken = this.guestCarts.readToken(request);
    if (cartToken !== undefined) {
      this.limiter.consume(`guest-cart:${this.guestCarts.digestToken(cartToken)}`);
      return true;
    }
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    this.limiter.consume(`guest-ip:${ip}`);
    return true;
  }
}
