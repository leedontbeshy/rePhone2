import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from './auth.constants.js';

@Injectable()
export class CsrfGuard implements CanActivate {
  public constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.get('origin');
    const proof = request.get(CSRF_HEADER_NAME);
    const contentType = request.get('content-type') ?? '';

    if (
      origin !== this.config.api.webOrigin ||
      proof !== CSRF_HEADER_VALUE ||
      !contentType.toLowerCase().startsWith('application/json')
    ) {
      throw new ApiError('CSRF_VALIDATION_FAILED');
    }
    return true;
  }
}
