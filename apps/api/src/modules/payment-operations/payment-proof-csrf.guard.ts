import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from '../auth/auth.constants.js';
import { GuestOrderIdentityService } from '../order-transaction-ports/guest-order-identity.service.js';

@Injectable()
export class PaymentProofCsrfGuard implements CanActivate {
  public constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(GuestOrderIdentityService)
    private readonly guestOrders: GuestOrderIdentityService,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.auth !== undefined || this.guestOrders.readToken(request) !== undefined)
      return true;
    const contentType = request.get('content-type') ?? '';
    if (
      request.get('origin') !== this.config.api.webOrigin ||
      request.get(CSRF_HEADER_NAME) !== CSRF_HEADER_VALUE ||
      !contentType.toLowerCase().startsWith('multipart/form-data')
    ) {
      throw new ApiError('CSRF_VALIDATION_FAILED');
    }
    return true;
  }
}
