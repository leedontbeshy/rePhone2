import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { validate as validateUuid } from 'uuid';
import { ApiError } from '../../common/errors/api-error.js';
import { RefundOperationsRepository } from './refund-operations.repository.js';

@Injectable()
export class RefundBankCompletionGuard implements CanActivate {
  public constructor(
    @Inject(RefundOperationsRepository)
    private readonly refunds: RefundOperationsRepository,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const id = request.params['id'];
    if (typeof id !== 'string' || !validateUuid(id)) {
      throw new ApiError('VALIDATION_FAILED', undefined, [
        { field: 'id', code: 'IS_UUID', message: 'id phải là UUID hợp lệ.' },
      ]);
    }
    const auth = request.auth;
    if (auth === undefined) throw new ApiError('AUTH_REQUIRED');
    const refund = await this.refunds.findById(id);
    if (refund === null) throw new ApiError('RESOURCE_NOT_FOUND');
    if (
      refund.method !== 'BANK_TRANSFER' ||
      !['PROCESSING', 'COMPLETED'].includes(refund.status)
    ) {
      throw new ApiError('INVALID_STATE_TRANSITION');
    }
    if (refund.processedById !== auth.userId && auth.role !== 'ADMIN') {
      throw new ApiError('FORBIDDEN');
    }
    return true;
  }
}
