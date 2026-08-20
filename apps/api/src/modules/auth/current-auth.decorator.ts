import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import type { AuthContext } from './auth-context.js';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const auth = context.switchToHttp().getRequest<Request>().auth;
    if (auth === undefined) {
      throw new ApiError('AUTH_REQUIRED');
    }
    return auth;
  },
);
