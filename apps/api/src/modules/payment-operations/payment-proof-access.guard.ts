import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { isUUID } from 'class-validator';
import { ApiError } from '../../common/errors/api-error.js';
import { OrderOwnershipPolicy } from '../order-transaction-ports/order-ownership.policy.js';
import { PaymentClock } from './payment-clock.service.js';
import { PaymentOperationsRepository } from './payment-operations.repository.js';
import {
  assertProofSubmissionState,
  isProofSubmissionReplay,
} from './payment-proof-submission.service.js';

@Injectable()
export class PaymentProofAccessGuard implements CanActivate {
  public constructor(
    @Inject(PaymentOperationsRepository)
    private readonly payments: PaymentOperationsRepository,
    @Inject(OrderOwnershipPolicy)
    private readonly ownership: OrderOwnershipPolicy,
    @Inject(PaymentClock) private readonly clock: PaymentClock,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const paymentId = request.params.paymentId;
    if (typeof paymentId !== 'string' || !isUUID(paymentId)) {
      throw new ApiError('ORDER_NOT_FOUND');
    }
    const payment = await this.payments.findById(paymentId);
    if (payment === null) throw new ApiError('ORDER_NOT_FOUND');
    const now = this.clock.now();
    this.ownership.assertAccess(request, payment.order, now);
    if (!isProofSubmissionReplay(payment)) assertProofSubmissionState(payment, now);
    return true;
  }
}
