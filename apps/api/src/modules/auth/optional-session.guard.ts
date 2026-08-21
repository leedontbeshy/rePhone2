import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { SessionResolver } from './session-resolver.service.js';

@Injectable()
export class OptionalSessionGuard implements CanActivate {
  public constructor(@Inject(SessionResolver) private readonly sessionResolver: SessionResolver) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    await this.sessionResolver.resolve(request, false);
    return true;
  }
}
