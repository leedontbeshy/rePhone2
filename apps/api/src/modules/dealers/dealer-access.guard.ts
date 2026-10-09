import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SessionResolver } from '../auth/session-resolver.service.js';
import { allowsDealerCapability } from '../dealer-core/dealer-access.policy.js';
import {
  DEALER_PERMISSION,
  setDealerContext,
  type DealerContext,
  type DealerPermission,
} from './dealer-context.js';
import { DealerRuntime, dealerHash } from './dealer-runtime.service.js';

@Injectable()
export class DealerAccessGuard implements CanActivate {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionResolver) private readonly sessions: SessionResolver,
    @Inject(DealerRuntime) private readonly runtime: DealerRuntime,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}
  public async canActivate(execution: ExecutionContext): Promise<boolean> {
    this.runtime.assertEnabled();
    const request = execution.switchToHttp().getRequest<Request>();
    const permission = this.reflector.get<DealerPermission | undefined>(
      DEALER_PERMISSION,
      execution.getHandler(),
    );
    if (permission === undefined) throw new ApiError('FORBIDDEN');
    const key = request.get('x-dealer-api-key');
    let context: DealerContext;
    if (key !== undefined) {
      if (request.get('origin') !== undefined || request.get('sec-fetch-site') !== undefined)
        throw new ApiError('FORBIDDEN', 'API key chỉ dành cho kết nối giữa các máy chủ.');
      if (!key.startsWith(`rp_${this.runtime.mode.toLowerCase()}_`) || key.length > 128)
        throw new ApiError('INVALID_CREDENTIALS');
      const credential = await this.prisma.dealerApiClient.findUnique({
        where: { keyHash: dealerHash(key) },
        include: { dealer: { include: { owner: { select: { status: true } } } } },
      });
      if (
        credential === null ||
        credential.revokedAt !== null ||
        credential.expiresAt <= new Date() ||
        credential.environment !== this.runtime.mode ||
        credential.dealer.owner.status !== 'ACTIVE'
      )
        throw new ApiError('INVALID_CREDENTIALS');
      if (!credential.scopes.includes(permission.scope)) throw new ApiError('FORBIDDEN');
      context = {
        dealerId: credential.dealerId,
        apiClientId: credential.id,
        scopes: credential.scopes,
      };
    } else {
      const auth = await this.sessions.resolve(request, true);
      if (auth === undefined) throw new ApiError('AUTH_REQUIRED');
      const dealer = await this.prisma.dealerProfile.findUnique({
        where: { ownerUserId: auth.userId },
      });
      if (dealer === null) throw new ApiError('FORBIDDEN', 'Chưa có hồ sơ đại lý.');
      context = { dealerId: dealer.id, userId: auth.userId };
    }
    const profile = await this.prisma.dealerProfile.findUnique({ where: { id: context.dealerId } });
    if (profile === null || !allowsDealerCapability(profile, permission.capability))
      throw new ApiError('FORBIDDEN', 'Trạng thái đại lý không cho phép thao tác này.');
    await this.consumeQuota(
      context.dealerId,
      permission.rate ?? (request.method === 'GET' ? 'READ' : 'WRITE'),
    );
    setDealerContext(request, context);
    return true;
  }
  private async consumeQuota(dealerId: string, rate: 'READ' | 'WRITE' | 'PROOF'): Promise<void> {
    const seconds = rate === 'PROOF' ? 600 : 60;
    const maximum = rate === 'READ' ? 60 : rate === 'WRITE' ? 10 : 5;
    const now = Date.now();
    const start = Math.floor(now / (seconds * 1000)) * seconds * 1000;
    const result = await this.prisma.dealerRateLimit.upsert({
      where: { key: `${dealerId}:${rate}:${start.toString()}` },
      create: {
        key: `${dealerId}:${rate}:${start.toString()}`,
        windowStart: new Date(start),
        count: 1,
      },
      update: { count: { increment: 1 } },
    });
    if (result.count > maximum)
      throw new ApiError('RATE_LIMITED', undefined, [], {
        'Retry-After': Math.ceil((start + seconds * 1000 - now) / 1000).toString(),
      });
  }
}
