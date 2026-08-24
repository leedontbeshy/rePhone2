import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { GuestCommerceCsrfGuard } from '../auth/guest-commerce-csrf.guard.js';
import { GuestOrderIdentityService } from './guest-order-identity.service.js';

@Injectable()
export class GuestOrderMutationCsrfGuard implements CanActivate {
  public constructor(
    @Inject(GuestCommerceCsrfGuard) private readonly cookieCsrf: GuestCommerceCsrfGuard,
    @Inject(GuestOrderIdentityService)
    private readonly guestOrders: GuestOrderIdentityService,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.auth !== undefined || this.guestOrders.readToken(request) !== undefined)
      return true;
    return this.cookieCsrf.canActivate(context);
  }
}
