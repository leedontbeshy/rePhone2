import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { GuestCartIdentityService } from '../auth/guest-cart-identity.service.js';
import { GuestOrderIdentityService } from './guest-order-identity.service.js';

export interface OrderOwnershipRecord {
  channel?: 'STOREFRONT' | 'DEALER';
  customerId: string | null;
  guestAccessTokenHash: string | null;
  sourceCart: {
    status: string;
    guestTokenHash: string | null;
    expiresAt: Date | null;
  } | null;
}

@Injectable()
export class OrderOwnershipPolicy {
  public constructor(
    @Inject(GuestOrderIdentityService)
    private readonly guestOrders: GuestOrderIdentityService,
    @Inject(GuestCartIdentityService)
    private readonly guestCarts: GuestCartIdentityService,
  ) {}

  public assertAccess(request: Request, order: OrderOwnershipRecord, now = new Date()): void {
    if (order.channel === 'DEALER' || order.sourceCart === null)
      throw new ApiError('ORDER_NOT_FOUND');
    if (request.auth !== undefined) {
      if (request.auth.role !== 'CUSTOMER') throw new ApiError('FORBIDDEN');
      if (order.customerId !== request.auth.userId) throw new ApiError('ORDER_NOT_FOUND');
      return;
    }

    const guestOrderToken = this.guestOrders.readToken(request);
    if (guestOrderToken !== undefined) {
      if (this.guestOrders.matches(guestOrderToken, order.guestAccessTokenHash)) return;
      throw new ApiError('ORDER_NOT_FOUND');
    }

    const guestCartToken = this.guestCarts.readToken(request);
    const guestCartHash =
      guestCartToken === undefined ? undefined : this.guestCarts.digestToken(guestCartToken);
    const activeConvertedCookie =
      guestCartHash !== undefined &&
      order.sourceCart.status === 'CONVERTED' &&
      order.sourceCart.guestTokenHash === guestCartHash &&
      (order.sourceCart.expiresAt === null || order.sourceCart.expiresAt > now);
    if (!activeConvertedCookie) throw new ApiError('ORDER_NOT_FOUND');
  }
}
