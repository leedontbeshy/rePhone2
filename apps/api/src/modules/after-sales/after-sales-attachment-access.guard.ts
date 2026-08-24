import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { OrderOwnershipPolicy } from '../order-transaction-ports/order-ownership.policy.js';
import { AfterSalesClock } from './after-sales-clock.service.js';
import { assertAfterSalesOwnership } from './after-sales-ownership.js';
import { AfterSalesRepository } from './after-sales.repository.js';

export const ATTACHABLE_AFTER_SALES_STATUSES = ['REQUESTED', 'RECEIVED', 'INSPECTING'] as const;

@Injectable()
export class AfterSalesAttachmentAccessGuard implements CanActivate {
  public constructor(
    @Inject(AfterSalesRepository) private readonly repository: AfterSalesRepository,
    @Inject(OrderOwnershipPolicy) private readonly ownership: OrderOwnershipPolicy,
    @Inject(AfterSalesClock) private readonly clock: AfterSalesClock,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const requestNumber = request.params['requestNumber'];
    if (typeof requestNumber !== 'string') throw new ApiError('RESOURCE_NOT_FOUND');
    const record = await this.repository.findByRequestNumber(requestNumber);
    if (record === null) throw new ApiError('RESOURCE_NOT_FOUND');
    assertAfterSalesOwnership(this.ownership, request, record.orderItem.order, this.clock.now());
    if (!isAttachableStatus(record.status)) throw new ApiError('INVALID_STATE_TRANSITION');
    return true;
  }
}

export function isAttachableStatus(
  status: string,
): status is (typeof ATTACHABLE_AFTER_SALES_STATUSES)[number] {
  return (ATTACHABLE_AFTER_SALES_STATUSES as readonly string[]).includes(status);
}
