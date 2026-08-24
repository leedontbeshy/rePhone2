import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from '../auth/auth.constants.js';
import { GuestCommerceCsrfGuard } from '../auth/guest-commerce-csrf.guard.js';
import { GuestOrderIdentityService } from './guest-order-identity.service.js';

@Injectable()
export class GuestOrderMutationCsrfGuard implements CanActivate {
  public constructor(
    @Inject(GuestCommerceCsrfGuard) private readonly cookieCsrf: GuestCommerceCsrfGuard,
    @Inject(GuestOrderIdentityService)
    private readonly guestOrders: GuestOrderIdentityService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.auth !== undefined || this.guestOrders.readToken(request) !== undefined)
      return true;
    const contentType = request.get('content-type') ?? '';
    if (contentType.toLowerCase().startsWith('multipart/form-data')) {
      if (
        request.get('origin') !== this.config.api.webOrigin ||
        request.get(CSRF_HEADER_NAME) !== CSRF_HEADER_VALUE
      ) {
        throw new ApiError('CSRF_VALIDATION_FAILED');
      }
      return true;
    }
    return this.cookieCsrf.canActivate(context);
  }
}
