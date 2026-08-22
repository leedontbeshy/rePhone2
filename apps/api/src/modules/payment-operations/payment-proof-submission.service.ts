import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { requestContext } from '../../common/http/request-context.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../../common/providers/storage-provider.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditWriteActorContext } from '../audit/audit.types.js';
import { CheckoutInventoryGateway } from '../inventory/checkout-inventory.gateway.js';
import { OrderOwnershipPolicy } from '../order-transaction-ports/order-ownership.policy.js';
import { PaymentClock } from './payment-clock.service.js';
import { PaymentEvidenceValidator } from './payment-evidence.validator.js';
import { projectPaymentPublic } from './payment-operation.projector.js';
import type { PaymentPublicDto } from './payment-operation-response.dto.js';
import {
  PaymentOperationsRepository,
  type PaymentOperationsRecord,
} from './payment-operations.repository.js';

@Injectable()
export class PaymentProofSubmissionService {
  private readonly logger = new Logger(PaymentProofSubmissionService.name);

  public constructor(
    @Inject(PaymentOperationsRepository)
    private readonly payments: PaymentOperationsRepository,
    @Inject(PaymentEvidenceValidator)
    private readonly evidenceValidator: PaymentEvidenceValidator,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(OrderOwnershipPolicy)
    private readonly ownership: OrderOwnershipPolicy,
    @Inject(CheckoutInventoryGateway)
    private readonly inventory: CheckoutInventoryGateway,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(PaymentClock) private readonly clock: PaymentClock,
  ) {}

  public async submit(
    request: Request,
    paymentId: string,
    file: Express.Multer.File | undefined,
  ): Promise<PaymentPublicDto> {
    const evidence = await this.evidenceValidator.validate(file);
    const objectPath = `payments/${paymentId}/${randomUUID()}.${evidence.extension}`;
    let stored: Awaited<ReturnType<StorageProvider['upload']>>;
    try {
      stored = await this.storage.upload({
        bucket: this.config.storage.privateBucket,
        objectPath,
        bytes: evidence.bytes,
        mimeType: evidence.mimeType,
      });
    } catch {
      throw new ApiError('STORAGE_UNAVAILABLE');
    }

    try {
      const outcome = await this.transactions.run('payments.submit-proof', async (transaction) => {
        const payment = await this.payments.lockPaymentRoot(paymentId, transaction);
        if (payment === null) throw new ApiError('ORDER_NOT_FOUND');
        const now = this.clock.now();
        this.ownership.assertAccess(request, payment.order, now);
        if (payment.status === 'UNDER_REVIEW') {
          return { submitted: false, payment };
        }
        assertProofSubmissionState(payment, now);
        await this.payments.lockActiveReservations(payment.order.id, transaction);
        const attached = await transaction.payment.updateMany({
          where: {
            id: payment.id,
            status: 'AWAITING_PROOF',
            evidenceBucket: null,
            evidenceObjectPath: null,
          },
          data: {
            evidenceBucket: stored.bucket,
            evidenceObjectPath: stored.objectPath,
              customerDeclaredAt: now,
              submittedAt: now,
              status: 'UNDER_REVIEW',
            },
        });
        if (attached.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
        await this.inventory.transitionOrderReservationReason(
          payment.order.id,
          'DEPOSIT',
          'REVIEW',
          null,
          transaction,
        );
        await this.audit.write(transaction, paymentAuditActor(request), {
          action: 'payment.proof_submitted',
          resourceType: 'Payment',
          resourceId: payment.id,
          changes: {
            before: { status: payment.status, reservationReason: 'DEPOSIT' },
            after: { status: 'UNDER_REVIEW', reservationReason: 'REVIEW' },
          },
          metadata: {
            orderNumber: payment.order.orderNumber,
            mimeType: evidence.mimeType,
            fileSize: evidence.fileSize,
          },
        });
        const updated = await this.payments.findById(payment.id, transaction);
        if (updated === null) throw new ApiError('INTERNAL_ERROR');
        return { submitted: true, payment: updated };
      });
      if (!outcome.submitted) {
        await this.deleteBestEffort(paymentId, stored.bucket, stored.objectPath, request);
      }
      return projectPaymentPublic(outcome.payment, this.config, this.clock.now());
    } catch (error) {
      await this.deleteBestEffort(paymentId, stored.bucket, stored.objectPath, request);
      throw error;
    }
  }

  private async deleteBestEffort(
    paymentId: string,
    bucket: string,
    objectPath: string,
    request: Request,
  ): Promise<void> {
    try {
      await this.storage.delete(bucket, objectPath);
    } catch {
      this.logger.warn({
        event: 'storage_orphan_candidate',
        paymentId,
        requestId: requestContext(request).requestId,
      });
    }
  }
}

export function assertProofSubmissionState(
  payment: Pick<
    PaymentOperationsRecord,
    'purpose' | 'method' | 'status' | 'expiresAt' | 'evidenceBucket' | 'evidenceObjectPath'
  > & { order: Pick<PaymentOperationsRecord['order'], 'status' | 'fulfillmentStatus'> },
  now: Date,
): void {
  if (
    payment.purpose !== 'DEPOSIT' ||
    payment.method !== 'BANK_TRANSFER' ||
    payment.order.status !== 'PLACED' ||
    payment.order.fulfillmentStatus !== 'PENDING'
  ) {
    throw new ApiError('INVALID_STATE_TRANSITION');
  }
  if (payment.status !== 'AWAITING_PROOF') {
    throw new ApiError(
      ['VERIFIED', 'REJECTED', 'EXPIRED', 'CANCELLED'].includes(payment.status)
        ? 'PAYMENT_ALREADY_REVIEWED'
        : 'INVALID_STATE_TRANSITION',
    );
  }
  if (payment.evidenceBucket !== null || payment.evidenceObjectPath !== null) {
    throw new ApiError('INVALID_STATE_TRANSITION');
  }
  if (payment.expiresAt === null || now >= payment.expiresAt) {
    throw new ApiError('PAYMENT_PROOF_DEADLINE_PASSED');
  }
}

function paymentAuditActor(request: Request): AuditWriteActorContext {
  const context = requestContext(request);
  return request.auth === undefined
    ? { ...context, actorType: 'GUEST' }
    : { ...context, actorType: 'USER', actorUserId: request.auth.userId };
}
