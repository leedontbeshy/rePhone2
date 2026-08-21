import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserRole } from '../../generated/prisma/enums.js';
import { ApiError } from '../../common/errors/api-error.js';
import { ROLES_METADATA_KEY } from './roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  public constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  public canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles === undefined || roles.length === 0) {
      return true;
    }
    const auth = context.switchToHttp().getRequest<Request>().auth;
    if (auth === undefined) {
      throw new ApiError('AUTH_REQUIRED');
    }
    if (!roles.includes(auth.role)) {
      throw new ApiError('FORBIDDEN');
    }
    return true;
  }
}
