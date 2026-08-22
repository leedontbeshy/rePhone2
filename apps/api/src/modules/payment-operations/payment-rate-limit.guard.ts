import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { GuestCartIdentityService } from '../auth/guest-cart-identity.service.js';
import { GuestOrderIdentityService } from '../order-transaction-ports/guest-order-identity.service.js';
import { PaymentRateLimiter } from './payment-rate-limiter.service.js';

@Injectable()
export class PaymentRateLimitGuard implements CanActivate {
  public constructor(
    @Inject(PaymentRateLimiter) private readonly limiter: PaymentRateLimiter,
    @Inject(GuestOrderIdentityService)
    private readonly guestOrders: GuestOrderIdentityService,
    @Inject(GuestCartIdentityService)
    private readonly guestCarts: GuestCartIdentityService,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.auth !== undefined) {
      this.limiter.consume(`customer:${request.auth.userId}`, 20, 10 * 60_000);
      return true;
    }

    const paymentId = String(request.params.paymentId ?? 'unknown');
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    this.limiter.consume(`guest-ip:${ip}:payment:${paymentId}`, 10, 60_000);
    const orderToken = this.guestOrders.readToken(request);
    if (orderToken !== undefined) {
      this.limiter.consume(
        `guest-order:${this.guestOrders.digestToken(orderToken)}`,
        20,
        10 * 60_000,
      );
      return true;
    }
    const cartToken = this.guestCarts.readToken(request);
    const credentialKey =
      cartToken === undefined ? `ip:${ip}` : `cart:${this.guestCarts.digestToken(cartToken)}`;
    this.limiter.consume(`guest-${credentialKey}`, 20, 10 * 60_000);
    return true;
  }
}
