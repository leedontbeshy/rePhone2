import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { requestContext } from '../../common/http/request-context.js';
import type { AuditWriteActorContext } from '../audit/audit.types.js';
import type { DealerCapability } from '../dealer-core/dealer-access.policy.js';

export const DEALER_SCOPES = [
  'catalog:read',
  'orders:read',
  'orders:write',
  'payments:read',
  'payments:write',
  'after-sales:read',
  'after-sales:write',
] as const;
export type DealerScope = (typeof DEALER_SCOPES)[number];
export interface DealerContext {
  dealerId: string;
  userId?: string;
  apiClientId?: string;
  scopes?: readonly string[];
}
export interface DealerPermission {
  scope: DealerScope;
  capability: DealerCapability;
  rate?: 'READ' | 'WRITE' | 'PROOF';
}
export const DEALER_PERMISSION = 'dealer:permission';
export const DealerPermission = (permission: DealerPermission) =>
  SetMetadata(DEALER_PERMISSION, permission);
const contexts = new WeakMap<Request, DealerContext>();
export function setDealerContext(request: Request, context: DealerContext): void {
  contexts.set(request, context);
}
export function dealerContext(request: Request): DealerContext {
  const context = contexts.get(request);
  if (context === undefined) throw new ApiError('AUTH_REQUIRED');
  return context;
}
export function dealerAuditActor(request: Request): AuditWriteActorContext {
  const context = dealerContext(request);
  return context.apiClientId === undefined
    ? { ...requestContext(request), actorUserId: context.userId ?? '' }
    : {
        ...requestContext(request),
        actorType: 'API_CLIENT',
        actorApiClientId: context.apiClientId,
      };
}
