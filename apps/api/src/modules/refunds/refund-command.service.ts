import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { requestContext } from '../../common/http/request-context.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../../common/providers/storage-provider.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { RefundNotificationService } from '../notifications/refund-notification.service.js';
import { RefundOrderGateway } from '../order-transaction-ports/refund-order.gateway.js';
import { projectOrderFinance } from '../payments/payment-finance.policy.js';
import {
  PrivateEvidenceValidator,
  type ValidatedPrivateEvidence,
} from '../storage/private-evidence.validator.js';
import type {
  CompleteRefundDto,
  CreateRefundDto,
  StartRefundProcessingDto,
  TerminalRefundDto,
} from './refund.dto.js';
import { RefundClock } from './refund-clock.service.js';
import { RefundCoreGateway, type LockedRefundFinance } from './refund-core.gateway.js';
import {
  RefundOperationsRepository,
  type RefundOperationsRecord,
} from './refund-operations.repository.js';
import { projectRefundDetail } from './refund.projector.js';
import type { RefundDetailDto } from './refund-response.dto.js';

@Injectable()
export class RefundCommandService {
  private readonly logger = new Logger(RefundCommandService.name);

  public constructor(
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(RefundCoreGateway) private readonly finance: RefundCoreGateway,
    @Inject(RefundOrderGateway) private readonly orders: RefundOrderGateway,
    @Inject(RefundOperationsRepository)
    private readonly refunds: RefundOperationsRepository,
    @Inject(PrivateEvidenceValidator)
    private readonly evidenceValidator: PrivateEvidenceValidator,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(RefundClock) private readonly clock: RefundClock,
    @Inject(RefundNotificationService)
    private readonly notifications: RefundNotificationService,
  ) {}

  public async create(
    orderId: string,
    input: CreateRefundDto,
    auth: AuthContext,
    request: Request,
  ): Promise<RefundDetailDto> {
    const refundId = await this.transactions.run('refunds.create', async (transaction) => {
      const order = await this.orders.lockById(orderId, transaction);
      if (order === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (!['CANCELLED', 'COMPLETED'].includes(order.status)) {
        throw new ApiError('INVALID_STATE_TRANSITION');
      }
      const lockedFinance = await this.finance.lockFinance(order.id, transaction);
      const amount = BigInt(input.amount);
      const available = this.finance.availableTotal(lockedFinance);
      if (amount > available) throw new ApiError('REFUND_AMOUNT_EXCEEDS_PAID');
      if (
        input.paymentId !== undefined &&
        amount > this.finance.availableForPayment(lockedFinance, input.paymentId)
      ) {
        throw new ApiError('REFUND_AMOUNT_EXCEEDS_PAID');
      }
      const refund = await transaction.refund.create({
        data: {
          orderId: order.id,
          paymentId: input.paymentId ?? null,
          amount: input.amount,
          method: input.method,
          status: 'REQUESTED',
          reason: input.reason,
          requestedByType: 'STAFF',
          requestedById: auth.userId,
        },
      });
      await this.audit.write(
        transaction,
        { actorUserId: auth.userId, ...requestContext(request) },
        {
          action: 'refund.created',
          resourceType: 'Refund',
          resourceId: refund.id,
          changes: { after: { status: 'REQUESTED' } },
          metadata: {
            orderNumber: order.orderNumber,
            amount: input.amount,
            method: input.method,
            reason: input.reason,
            ...(input.paymentId === undefined ? {} : { paymentId: input.paymentId }),
          },
        },
      );
      return refund.id;
    });
    return this.detail(refundId);
  }

  public async start(
    id: string,
    input: StartRefundProcessingDto,
    auth: AuthContext,
    request: Request,
  ): Promise<RefundDetailDto> {
    const note = input.note ?? null;
    await this.withLockedRefund(id, 'refunds.start-processing', async (refund, _finance, tx) => {
      if (
        refund.status === 'PROCESSING' &&
        refund.processedById === auth.userId &&
        refund.note === note
      ) {
        return false;
      }
      if (refund.status !== 'REQUESTED' || refund.method === 'OTHER') {
        throw new ApiError('INVALID_STATE_TRANSITION');
      }
      const now = this.clock.now();
      const updated = await tx.refund.updateMany({
        where: { id: refund.id, status: 'REQUESTED' },
        data: { status: 'PROCESSING', processedById: auth.userId, processingAt: now, note },
      });
      if (updated.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
      await this.auditAction(tx, auth, request, refund, 'refund.processing_started', {
        before: { status: 'REQUESTED' },
        after: { status: 'PROCESSING', note: noteShape(note) },
      });
      return true;
    });
    return this.detail(id);
  }

  public async completeCash(
    id: string,
    input: CompleteRefundDto,
    auth: AuthContext,
    request: Request,
  ): Promise<RefundDetailDto> {
    const changed = await this.withLockedRefund(
      id,
      'refunds.complete-cash',
      async (refund, finance, transaction) => {
        if (
          refund.status === 'COMPLETED' &&
          refund.method === 'CASH' &&
          refund.note === input.note &&
          refund.evidenceBucket === null &&
          refund.evidenceObjectPath === null
        ) {
          this.assertCompletionActor(refund, auth);
          return false;
        }
        this.assertCompletable(refund, 'CASH', auth);
        await this.completeLocked(refund, finance, input.note, null, auth, request, transaction);
        return true;
      },
    );
    const detail = await this.detail(id);
    if (changed) await this.notifyCompleted(id);
    return detail;
  }

  public async completeBank(
    id: string,
    input: CompleteRefundDto,
    file: Express.Multer.File | undefined,
    auth: AuthContext,
    request: Request,
  ): Promise<RefundDetailDto> {
    const evidence = await this.evidenceValidator.validate(file);
    const beforeUpload = await this.refunds.findById(id);
    if (beforeUpload === null) throw new ApiError('RESOURCE_NOT_FOUND');
    if (isExactBankReplay(beforeUpload, input.note, evidence.sha256)) {
      this.assertCompletionActor(beforeUpload, auth);
      return projectRefundDetail(beforeUpload);
    }
    this.assertCompletable(beforeUpload, 'BANK_TRANSFER', auth);

    const objectPath = `refunds/${id}/${randomUUID()}.${evidence.extension}`;
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

    let changed: boolean;
    try {
      changed = await this.withLockedRefund(
        id,
        'refunds.complete-bank-transfer',
        async (refund, finance, transaction) => {
          if (isExactBankReplay(refund, input.note, evidence.sha256)) {
            this.assertCompletionActor(refund, auth);
            return false;
          }
          this.assertCompletable(refund, 'BANK_TRANSFER', auth);
          await this.completeLocked(
            refund,
            finance,
            input.note,
            { evidence, bucket: stored.bucket, objectPath: stored.objectPath },
            auth,
            request,
            transaction,
          );
          return true;
        },
      );
    } catch (error) {
      await this.deleteBestEffort(id, stored.bucket, stored.objectPath, request);
      throw error;
    }
    if (!changed) await this.deleteBestEffort(id, stored.bucket, stored.objectPath, request);
    const detail = await this.detail(id);
    if (changed) await this.notifyCompleted(id);
    return detail;
  }

  public reject(
    id: string,
    input: TerminalRefundDto,
    auth: AuthContext,
    request: Request,
  ): Promise<RefundDetailDto> {
    return this.terminal(id, 'REJECTED', input.reason, auth, request);
  }

  public cancel(
    id: string,
    input: TerminalRefundDto,
    auth: AuthContext,
    request: Request,
  ): Promise<RefundDetailDto> {
    return this.terminal(id, 'CANCELLED', input.reason, auth, request);
  }

  private async terminal(
    id: string,
    target: 'REJECTED' | 'CANCELLED',
    reason: string,
    auth: AuthContext,
    request: Request,
  ): Promise<RefundDetailDto> {
    await this.withLockedRefund(
      id,
      `refunds.${target.toLowerCase()}`,
      async (refund, _finance, tx) => {
        if (
          refund.status === target &&
          refund.terminalById === auth.userId &&
          refund.terminalReason === reason
        ) {
          return false;
        }
        if (refund.status !== 'REQUESTED') throw new ApiError('INVALID_STATE_TRANSITION');
        const now = this.clock.now();
        const updated = await tx.refund.updateMany({
          where: { id: refund.id, status: 'REQUESTED' },
          data: {
            status: target,
            terminalReason: reason,
            terminalById: auth.userId,
            terminalAt: now,
          },
        });
        if (updated.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
        await this.auditAction(
          tx,
          auth,
          request,
          refund,
          target === 'REJECTED' ? 'refund.rejected' : 'refund.cancelled',
          {
            before: { status: 'REQUESTED' },
            after: { status: target, reason },
          },
        );
        return true;
      },
    );
    return this.detail(id);
  }

  private async completeLocked(
    refund: RefundOperationsRecord,
    finance: LockedRefundFinance,
    note: string,
    storedEvidence: {
      evidence: ValidatedPrivateEvidence;
      bucket: string;
      objectPath: string;
    } | null,
    auth: AuthContext,
    request: Request,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    const order = await this.orders.findById(refund.orderId, transaction);
    if (order === null) throw new ApiError('RESOURCE_NOT_FOUND');
    const verifiedAmounts = finance.payments.flatMap((payment) => {
      if (payment.status !== 'VERIFIED') return [];
      if (payment.receivedAmount === null) throw new ApiError('INTERNAL_ERROR');
      return [BigInt(payment.receivedAmount)];
    });
    const completedAmounts = finance.refunds.flatMap((item) =>
      item.status === 'COMPLETED' || item.id === refund.id ? [BigInt(item.amount)] : [],
    );
    const verifiedTotal = verifiedAmounts.reduce((sum, amount) => sum + amount, 0n);
    const completedTotal = completedAmounts.reduce((sum, amount) => sum + amount, 0n);
    if (completedTotal > verifiedTotal) throw new ApiError('REFUND_AMOUNT_EXCEEDS_PAID');
    const projection = projectOrderFinance(
      BigInt(order.grandTotal),
      verifiedAmounts,
      completedAmounts,
    );
    const now = this.clock.now();
    const updated = await transaction.refund.updateMany({
      where: { id: refund.id, status: 'PROCESSING' },
      data: {
        status: 'COMPLETED',
        completedAt: now,
        note,
        ...(storedEvidence === null
          ? {}
          : {
              evidenceBucket: storedEvidence.bucket,
              evidenceObjectPath: storedEvidence.objectPath,
              evidenceMimeType: storedEvidence.evidence.mimeType,
              evidenceFileSize: storedEvidence.evidence.fileSize,
              evidenceSha256: storedEvidence.evidence.sha256,
            }),
      },
    });
    if (updated.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
    await this.orders.updateFinance(
      order.id,
      {
        paidAmount: projection.paidAmount.toString(),
        refundedAmount: projection.refundedAmount.toString(),
        balanceDue: projection.balanceDue.toString(),
        paymentStatus: projection.paymentStatus,
      },
      transaction,
    );
    await this.auditAction(transaction, auth, request, refund, 'refund.completed', {
      before: { status: 'PROCESSING' },
      after: {
        status: 'COMPLETED',
        amount: refund.amount.toString(),
        method: refund.method,
        note: noteShape(note),
        evidence: storedEvidence === null ? { present: false } : { present: true },
      },
    });
  }

  private async withLockedRefund<T>(
    id: string,
    operation: string,
    useCase: (
      refund: RefundOperationsRecord,
      finance: LockedRefundFinance,
      transaction: Prisma.TransactionClient,
    ) => Promise<T>,
  ): Promise<T> {
    const orderId = await this.refunds.findOrderId(id);
    if (orderId === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return this.transactions.run(operation, async (transaction) => {
      const order = await this.orders.lockById(orderId, transaction);
      if (order === null) throw new ApiError('RESOURCE_NOT_FOUND');
      const finance = await this.finance.lockFinance(orderId, transaction);
      const refund = await this.refunds.findByIdInTransaction(id, transaction);
      if (refund === null || refund.orderId !== orderId) throw new ApiError('RESOURCE_NOT_FOUND');
      return useCase(refund, finance, transaction);
    });
  }

  private assertCompletable(
    refund: RefundOperationsRecord,
    method: 'BANK_TRANSFER' | 'CASH',
    auth: AuthContext,
  ): void {
    if (refund.status !== 'PROCESSING' || refund.method !== method) {
      throw new ApiError('INVALID_STATE_TRANSITION');
    }
    this.assertCompletionActor(refund, auth);
  }

  private assertCompletionActor(refund: RefundOperationsRecord, auth: AuthContext): void {
    if (refund.processedById !== auth.userId && auth.role !== 'ADMIN') {
      throw new ApiError('FORBIDDEN');
    }
  }

  private async auditAction(
    transaction: Prisma.TransactionClient,
    auth: AuthContext,
    request: Request,
    refund: RefundOperationsRecord,
    action: string,
    changes: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.audit.write(
      transaction,
      { actorUserId: auth.userId, ...requestContext(request) },
      {
        action,
        resourceType: 'Refund',
        resourceId: refund.id,
        changes,
        metadata: { orderNumber: refund.order.orderNumber },
      },
    );
  }

  private async detail(id: string): Promise<RefundDetailDto> {
    const refund = await this.refunds.findById(id);
    if (refund === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return projectRefundDetail(refund);
  }

  private async notifyCompleted(id: string): Promise<void> {
    const refund = await this.refunds.findById(id);
    if (refund === null) return;
    await this.notifications.sendCompleted({
      refundId: refund.id,
      orderNumber: refund.order.orderNumber,
      customerEmail: refund.order.customerEmail,
      amount: refund.amount.toString(),
      method: refund.method,
    });
  }

  private async deleteBestEffort(
    refundId: string,
    bucket: string,
    objectPath: string,
    request: Request,
  ): Promise<void> {
    try {
      await this.storage.delete(bucket, objectPath);
    } catch {
      this.logger.warn({
        event: 'storage_orphan_candidate',
        refundId,
        requestId: requestContext(request).requestId,
      });
    }
  }
}

function isExactBankReplay(
  refund: Pick<RefundOperationsRecord, 'status' | 'method' | 'note' | 'evidenceSha256'>,
  note: string,
  digest: string,
): boolean {
  if (refund.status !== 'COMPLETED') return false;
  if (
    refund.method !== 'BANK_TRANSFER' ||
    refund.note !== note ||
    refund.evidenceSha256 !== digest
  ) {
    throw new ApiError('INVALID_STATE_TRANSITION');
  }
  return true;
}

function noteShape(note: string | null): { present: boolean; length: number } {
  return { present: note !== null, length: note?.length ?? 0 };
}
