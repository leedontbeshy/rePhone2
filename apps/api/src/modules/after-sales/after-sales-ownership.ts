import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { requestContext } from '../../common/http/request-context.js';
import type { AuditWriteActorContext } from '../audit/audit.types.js';
import type {
  OrderOwnershipPolicy,
  OrderOwnershipRecord,
} from '../order-transaction-ports/order-ownership.policy.js';

export function assertAfterSalesOwnership(
  ownership: OrderOwnershipPolicy,
  request: Request,
  order: OrderOwnershipRecord,
  now?: Date,
): void {
  try {
    ownership.assertAccess(request, order, now);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'ORDER_NOT_FOUND') {
      throw new ApiError('RESOURCE_NOT_FOUND');
    }
    throw error;
  }
}

export function afterSalesAuditActor(request: Request): AuditWriteActorContext {
  return request.auth === undefined
    ? { actorType: 'GUEST', ...requestContext(request) }
    : { actorType: 'USER', actorUserId: request.auth.userId, ...requestContext(request) };
}

export function afterSalesCustomerId(request: Request): string | null {
  return request.auth?.userId ?? null;
}
