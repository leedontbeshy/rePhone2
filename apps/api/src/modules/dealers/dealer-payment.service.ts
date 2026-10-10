import { dealerNow } from './dealer-clock.js';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../common/errors/api-error.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../../common/providers/storage-provider.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext, AuditWriteActorContext } from '../audit/audit.types.js';
import { CheckoutInventoryGateway } from '../inventory/checkout-inventory.gateway.js';
import { PrivateEvidenceValidator } from '../storage/private-evidence.validator.js';
import type { DealerContext } from './dealer-context.js';
import type { DealerReceiptDto, DealerReturnSettlementDto } from './dealer.dto.js';
import {
  lockDealerReceipt,
  readDealerFunding,
  refreshDealerFunding,
} from './dealer-ledger.reader.js';
import { assertDealerContext, lockDealerOrder } from './dealer-order.service.js';
import { DealerRefundService } from './dealer-refund.service.js';
import { DealerRuntime } from './dealer-runtime.service.js';

@Injectable()
export class DealerPaymentService {
  private readonly logger = new Logger(DealerPaymentService.name);
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(DealerRuntime) private readonly runtime: DealerRuntime,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(CheckoutInventoryGateway) private readonly inventory: CheckoutInventoryGateway,
    @Inject(DealerRefundService) private readonly refunds: DealerRefundService,
    @Inject(PrivateEvidenceValidator) private readonly evidence: PrivateEvidenceValidator,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  public async submit(
    context: DealerContext,
    requestId: string,
    file: Express.Multer.File | undefined,
    actor: AuditWriteActorContext,
  ) {
    const initial = await this.prisma.dealerPaymentRequest.findFirst({
      where: { id: requestId, order: { dealerId: context.dealerId } },
    });
    if (initial === null) throw new ApiError('RESOURCE_NOT_FOUND');
    const evidence = await this.evidence.validate(file);
    const stored = await this.storage.upload({
      bucket: this.runtime.config.storage.privateBucket,
      objectPath: `dealer/${this.runtime.mode}/proofs/${requestId}/${randomUUID()}.${evidence.extension}`,
      bytes: evidence.bytes,
      mimeType: evidence.mimeType,
    });
    try {
      const result = await this.transactions.run('dealer.proof.submit', async (tx) => {
        const order = await lockDealerOrder(tx, initial.orderId, context.dealerId);
        await assertDealerContext(tx, context, 'PAY_EXISTING_ORDER');
        const duplicate = await tx.dealerPaymentProof.findFirst({
          where: {
            evidenceSha256: evidence.sha256,
            paymentRequest: { order: { dealerId: context.dealerId } },
          },
          orderBy: { submittedAt: 'desc' },
        });
        if (duplicate !== null) {
          if (duplicate.paymentRequestId === requestId && duplicate.status !== 'REJECTED')
            return {
              id: duplicate.id,
              status: duplicate.status,
              submittedAt: duplicate.submittedAt.toISOString(),
              replayed: true,
            };
          throw new ApiError(
            'VALIDATION_FAILED',
            'Chứng từ đã được sử dụng hoặc bị từ chối. Hãy tải chứng từ mới sau khi kiểm tra lại giao dịch.',
          );
        }
        const request = await tx.dealerPaymentRequest.findUnique({ where: { id: requestId } });
        const now = await dealerNow(tx);
        const detail = order.dealerDetail;
        const due = detail.balanceDeadlineAt ?? detail.submissionDeadlineAt;
        if (
          order.status !== 'PLACED' ||
          request?.status !== 'OPEN' ||
          detail.reviewStartedAt !== null
        )
          throw new ApiError('INVALID_STATE_TRANSITION');
        if (due <= now) throw new ApiError('PAYMENT_PROOF_DEADLINE_PASSED');
        const proof = await tx.dealerPaymentProof.create({
          data: {
            paymentRequestId: requestId,
            evidenceBucket: stored.bucket,
            evidenceObjectPath: stored.objectPath,
            evidenceMimeType: evidence.mimeType,
            evidenceSha256: evidence.sha256,
            evidenceFileSize: evidence.fileSize,
            submittedAt: now,
          },
        });
        await tx.dealerOrderDetail.update({
          where: { orderId: order.id },
          data: {
            reviewStartedAt: now,
            reviewOrigin: detail.balanceDeadlineAt === null ? 'SUBMISSION' : 'BALANCE',
            submissionRemainingMs:
              detail.balanceDeadlineAt === null
                ? due.getTime() - now.getTime()
                : detail.submissionRemainingMs,
          },
        });
        await tx.inventoryReservation.updateMany({
          where: { orderId: order.id, status: 'ACTIVE' },
          data: { holdReason: 'REVIEW', expiresAt: null },
        });
        await this.audit.write(tx, actor, {
          action: 'dealer.proof.submitted',
          resourceType: 'DealerPaymentProof',
          resourceId: proof.id,
        });
        await this.signal(tx, order.id);
        return {
          id: proof.id,
          status: proof.status,
          submittedAt: proof.submittedAt.toISOString(),
          replayed: false,
        };
      });
      if (result.replayed) await this.cleanup(stored.bucket, stored.objectPath);
      return result;
    } catch (error) {
      await this.cleanup(stored.bucket, stored.objectPath);
      throw error;
    }
  }

  public async proofUrl(id: string, actor: AuditActorContext) {
    const proof = await this.prisma.dealerPaymentProof.findUnique({ where: { id } });
    if (proof === null) throw new ApiError('RESOURCE_NOT_FOUND');
    await this.transactions.run('dealer.proof.view', (tx) =>
      this.audit.write(tx, actor, {
        action: 'dealer.proof.viewed',
        resourceType: 'DealerPaymentProof',
        resourceId: id,
      }),
    );
    return {
      url: await this.storage.createSignedReadUrl(
        proof.evidenceBucket,
        proof.evidenceObjectPath,
        60,
      ),
      expiresIn: 60,
    };
  }

  public async reject(id: string, reason: string, actor: AuditActorContext) {
    const initial = await this.prisma.dealerPaymentProof.findUnique({
      where: { id },
      include: { paymentRequest: true },
    });
    if (initial === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return this.transactions.run('dealer.proof.reject', async (tx) => {
      const order = await lockDealerOrder(tx, initial.paymentRequest.orderId);
      const proof = await tx.dealerPaymentProof.findUnique({ where: { id } });
      if (proof?.status !== 'UNDER_REVIEW' || order.dealerDetail.reviewStartedAt === null)
        throw new ApiError('PAYMENT_ALREADY_REVIEWED');
      const now = await dealerNow(tx);
      const detail = order.dealerDetail;
      const dueAt =
        detail.balanceDeadlineAt ?? new Date(now.getTime() + (detail.submissionRemainingMs ?? 0));
      await tx.dealerPaymentProof.update({
        where: { id },
        data: { status: 'REJECTED', reviewedAt: now, reviewedById: actor.actorUserId, reason },
      });
      await tx.dealerOrderDetail.update({
        where: { orderId: order.id },
        data: {
          reviewStartedAt: null,
          reviewOrigin: null,
          submissionRemainingMs: null,
          ...(detail.balanceDeadlineAt === null ? { submissionDeadlineAt: dueAt } : {}),
        },
      });
      await tx.dealerPaymentRequest.update({
        where: { id: proof.paymentRequestId },
        data: { dueAt },
      });
      await tx.inventoryReservation.updateMany({
        where: { orderId: order.id, status: 'ACTIVE' },
        data: {
          holdReason: detail.balanceDeadlineAt === null ? 'DEALER_PAYMENT' : 'DEALER_BALANCE',
          expiresAt: dueAt,
        },
      });
      await this.audit.write(tx, actor, {
        action: 'dealer.proof.rejected',
        resourceType: 'DealerPaymentProof',
        resourceId: id,
        metadata: { reason },
      });
      if (dueAt <= now)
        await this.cancelLocked(tx, order.id, 'Hết thời hạn thanh toán bổ sung.', actor, true);
      else await this.signal(tx, order.id);
      return { id, status: 'REJECTED' };
    });
  }

  public async receipts() {
    const rows = await this.prisma.dealerBankTransaction.findMany({
      orderBy: { verifiedAt: 'desc' },
      take: 100,
      include: {
        allocations: {
          select: {
            id: true,
            orderId: true,
            amount: true,
            reversals: { select: { amount: true } },
          },
        },
        corrections: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      dealerId: row.dealerId,
      bankAccountKey: row.bankAccountKey,
      bankReference: row.bankReference,
      receivedAmount: row.receivedAmount.toString(),
      receivedAt: row.receivedAt.toISOString(),
      reconciliationHold: row.reconciliationHold,
      allocations: row.allocations.map((allocation) => ({
        id: allocation.id,
        reversedAmount: allocation.reversals
          .reduce((sum, row) => sum + BigInt(row.amount.toString()), 0n)
          .toString(),
        orderId: allocation.orderId,
        amount: allocation.amount.toString(),
      })),
      corrections: row.corrections.map((correction) => ({
        amount: correction.amount.toString(),
        reason: correction.reason,
      })),
    }));
  }

  public record(input: DealerReceiptDto, actor: AuditActorContext) {
    this.runtime.assertEnabled();
    return this.transactions.run(
      'dealer.receipt.record',
      async (tx) => {
        const now = await dealerNow(tx);
        if (new Date(input.receivedAt).getTime() > now.getTime() + 60_000)
          throw new ApiError('VALIDATION_FAILED');
        const order =
          input.orderId === undefined
            ? undefined
            : await lockDealerOrder(tx, input.orderId, input.dealerId);
        const dealerId = order?.dealerId ?? input.dealerId ?? null;
        let receipt = await tx.dealerBankTransaction.findUnique({
          where: {
            bankAccountKey_bankReference: {
              bankAccountKey: input.bankAccountKey,
              bankReference: input.bankReference,
            },
          },
        });
        if (receipt !== null) {
          if (
            receipt.receivedAmount.toString() !== input.receivedAmount ||
            receipt.receivedAt.getTime() !== new Date(input.receivedAt).getTime() ||
            receipt.dealerId !== dealerId
          )
            throw new ApiError(
              'CONCURRENT_MODIFICATION',
              'Giao dịch ngân hàng đã được ghi nhận với dữ liệu khác.',
            );
          return { id: receipt.id, replayed: true };
        }
        receipt = await tx.dealerBankTransaction.create({
          data: {
            dealerId,
            bankAccountKey: input.bankAccountKey,
            bankReference: input.bankReference,
            receivedAmount: input.receivedAmount,
            receivedAt: new Date(input.receivedAt),
            verifiedById: actor.actorUserId,
            note: input.reason,
          },
        });
        if (input.proofId !== undefined) {
          const proof = await tx.dealerPaymentProof.findUnique({
            where: { id: input.proofId },
            include: { paymentRequest: true },
          });
          if (
            order === undefined ||
            proof?.paymentRequest.orderId !== order.id ||
            proof.status !== 'UNDER_REVIEW'
          )
            throw new ApiError('PAYMENT_ALREADY_REVIEWED');
        }
        if (order !== undefined) await this.allocateLocked(tx, order.id, receipt.id, actor);
        await this.audit.write(tx, actor, {
          action: 'dealer.receipt.recorded',
          resourceType: 'DealerBankTransaction',
          resourceId: receipt.id,
          metadata: { amount: input.receivedAmount, reason: input.reason },
        });
        return { id: receipt.id, replayed: false };
      },
      (error) =>
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002',
    );
  }

  public assign(receiptId: string, orderId: string, actor: AuditActorContext) {
    return this.transactions.run('dealer.receipt.assign', async (tx) => {
      const order = await lockDealerOrder(tx, orderId);
      const { receipt } = await lockDealerReceipt(tx, receiptId);
      if (receipt.dealerId !== null && receipt.dealerId !== order.dealerId)
        throw new ApiError('RESOURCE_NOT_FOUND');
      if (receipt.allocations.length > 0)
        throw new ApiError(
          'INVALID_STATE_TRANSITION',
          'Khoản thu đã phân bổ; cần điều chỉnh có kiểm toán.',
        );
      if (receipt.dealerId === null)
        await tx.dealerBankTransaction.update({
          where: { id: receiptId },
          data: { dealerId: order.dealerId },
        });
      await this.allocateLocked(tx, order.id, receiptId, actor);
      await this.audit.write(tx, actor, {
        action: 'dealer.receipt.assigned',
        resourceType: 'DealerBankTransaction',
        resourceId: receiptId,
        metadata: { orderId },
      });
      return { id: receiptId, orderId };
    });
  }

  private async allocateLocked(
    tx: Prisma.TransactionClient,
    orderId: string,
    receiptId: string,
    actor: AuditActorContext,
  ) {
    let order = await lockDealerOrder(tx, orderId);
    let receipt = await lockDealerReceipt(tx, receiptId);
    if (receipt.receipt.dealerId !== order.dealerId || receipt.receipt.reconciliationHold)
      throw new ApiError('INVALID_STATE_TRANSITION');
    const now = await dealerNow(tx);
    const dueAt = order.dealerDetail.balanceDeadlineAt ?? order.dealerDetail.submissionDeadlineAt;
    if (order.status === 'PLACED' && order.dealerDetail.reviewStartedAt === null && dueAt <= now) {
      await this.cancelLocked(tx, order.id, 'Tiền đến sau thời hạn giữ máy.', actor, true);
      order = await lockDealerOrder(tx, order.id);
    }
    if (order.status !== 'CANCELLED') {
      const funding = await readDealerFunding(tx, order.id, BigInt(order.grandTotal.toString()));
      const outstanding = BigInt(order.grandTotal.toString()) - funding.allocatedAmount;
      const amount =
        outstanding < receipt.projection.unallocatedAvailable
          ? outstanding
          : receipt.projection.unallocatedAvailable;
      let request = await tx.dealerPaymentRequest.findFirst({
        where: { orderId: order.id, status: 'OPEN' },
      });
      if (
        request === null &&
        amount > 0n &&
        ['PLACED', 'CONFIRMED', 'PROCESSING'].includes(order.status)
      ) {
        const original = await tx.dealerPaymentRequest.findFirstOrThrow({
          where: { orderId: order.id },
          orderBy: { createdAt: 'asc' },
        });
        request = await tx.dealerPaymentRequest.create({
          data: {
            orderId: order.id,
            purpose: 'BALANCE',
            requiredAmount: outstanding.toString(),
            dueAt: new Date(now.getTime() + order.dealerDetail.balanceMinutes * 60_000),
            transferContent: `${original.transferContent}C${randomUUID().slice(0, 8)}`,
            bankSnapshot: original.bankSnapshot as Prisma.InputJsonObject,
          },
        });
      }
      if (amount > 0n && request !== null)
        await tx.dealerPaymentAllocation.create({
          data: {
            bankTransactionId: receiptId,
            orderId: order.id,
            paymentRequestId: request.id,
            amount: amount.toString(),
          },
        });
      await tx.dealerPaymentProof.updateMany({
        where: { paymentRequest: { orderId: order.id }, status: 'UNDER_REVIEW' },
        data: {
          status: 'ACCEPTED',
          reviewedAt: now,
          reviewedById: actor.actorUserId,
          bankTransactionId: receiptId,
          reason: 'Đã đối chiếu khoản thực nhận.',
        },
      });
      const updated = await refreshDealerFunding(tx, order.id, BigInt(order.grandTotal.toString()));
      await tx.dealerOrderDetail.update({
        where: { orderId: order.id },
        data: { reviewStartedAt: null, reviewOrigin: null, submissionRemainingMs: null },
      });
      if (
        updated.fundingShortfall === 0n &&
        ['PLACED', 'CONFIRMED', 'PROCESSING'].includes(order.status)
      ) {
        await tx.dealerPaymentRequest.updateMany({
          where: { orderId: order.id, status: 'OPEN' },
          data: { status: 'SATISFIED' },
        });
        await tx.inventoryReservation.updateMany({
          where: { orderId: order.id, status: 'ACTIVE' },
          data: { holdReason: 'FULFILLMENT', expiresAt: null },
        });
        if (order.status === 'PLACED' && updated.fullyFunded)
          await tx.order.update({
            where: { id: order.id },
            data: { status: 'CONFIRMED', confirmedAt: now },
          });
      } else if (!updated.fullyFunded && order.status === 'PLACED' && request !== null) {
        const balanceDeadlineAt =
          order.dealerDetail.balanceDeadlineAt ??
          new Date(now.getTime() + order.dealerDetail.balanceMinutes * 60_000);
        await tx.dealerOrderDetail.update({
          where: { orderId: order.id },
          data: { balanceDeadlineAt },
        });
        if (request.purpose === 'FULL_PAYMENT') {
          await tx.dealerPaymentRequest.update({
            where: { id: request.id },
            data: { status: 'SUPERSEDED' },
          });
          await tx.dealerPaymentRequest.create({
            data: {
              orderId: order.id,
              purpose: 'BALANCE',
              requiredAmount: updated.fundingShortfall.toString(),
              dueAt: balanceDeadlineAt,
              transferContent: `${request.transferContent}B`,
              bankSnapshot: request.bankSnapshot as Prisma.InputJsonObject,
            },
          });
        } else
          await tx.dealerPaymentRequest.update({
            where: { id: request.id },
            data: { requiredAmount: updated.fundingShortfall.toString() },
          });
        await tx.inventoryReservation.updateMany({
          where: { orderId: order.id, status: 'ACTIVE' },
          data: { holdReason: 'DEALER_BALANCE', expiresAt: balanceDeadlineAt },
        });
        if (balanceDeadlineAt <= now)
          await this.cancelLocked(tx, order.id, 'Hết thời hạn chuyển bổ sung.', actor, true);
      }
    }
    receipt = await lockDealerReceipt(tx, receiptId);
    if (receipt.projection.unallocatedAvailable > 0n)
      await this.refunds.reserve(
        tx,
        {
          dealerId: order.dealerId,
          bankTransactionId: receiptId,
          amount: receipt.projection.unallocatedAvailable.toString(),
          reason:
            order.status === 'CANCELLED'
              ? 'Hoàn tiền đến sau khi đơn đã hủy.'
              : 'Hoàn phần chuyển thừa.',
        },
        actor,
      );
    await this.signal(tx, order.id);
  }

  public cancel(
    id: string,
    reason: string,
    actor: AuditWriteActorContext,
    context?: DealerContext,
  ) {
    return this.transactions.run('dealer.order.cancel', async (tx) => {
      const order = await lockDealerOrder(tx, id, context?.dealerId);
      if (context !== undefined) await assertDealerContext(tx, context, 'CANCEL_EXISTING_ORDER');
      await this.cancelLocked(tx, order.id, reason, actor, false);
      return { id, status: 'CANCELLED' };
    });
  }

  public settleReturn(id: string, input: DealerReturnSettlementDto, actor: AuditActorContext) {
    return this.transactions.run('dealer.return.settle', async (tx) => {
      const order = await lockDealerOrder(tx, id);
      if (order.fulfillmentStatus !== 'RETURNED' || order.status !== 'PROCESSING')
        throw new ApiError('INVALID_STATE_TRANSITION');
      if (order.dealerDetail.returnSettlement !== null)
        throw new ApiError(
          'INVALID_STATE_TRANSITION',
          'Phí hoàn đã chốt. Điều chỉnh tiếp qua đối soát.',
        );
      const charge =
        input.responsibleParty === 'DEALER'
          ? BigInt(input.outboundCost) + BigInt(input.returnCost)
          : 0n;
      const funding = await readDealerFunding(tx, id, BigInt(order.grandTotal.toString()));
      if (charge > funding.fundedAmount)
        throw new ApiError(
          'INVALID_STATE_TRANSITION',
          'Phí vượt nguồn tiền còn giữ; cần đối soát thủ công.',
        );
      const settlement = {
        responsibleParty: input.responsibleParty,
        outboundCost: input.outboundCost,
        returnCost: input.returnCost,
        agreement: input.agreement,
        reason: input.reason,
        charge: charge.toString(),
        originalShippingFee: order.shippingFee.toString(),
        settledAt: (await dealerNow(tx)).toISOString(),
      };
      await tx.dealerOrderDetail.update({
        where: { orderId: id },
        data: { returnSettlement: settlement },
      });
      await this.audit.write(tx, actor, {
        action: 'dealer.return.fees_settled',
        resourceType: 'Order',
        resourceId: id,
        metadata: settlement,
      });
      await this.signal(tx, id);
      return settlement;
    });
  }

  public async cancelLocked(
    tx: Prisma.TransactionClient,
    id: string,
    reason: string,
    actor: AuditWriteActorContext,
    expired: boolean,
  ) {
    const order = await lockDealerOrder(tx, id);
    if (order.status === 'CANCELLED') return;
    if (
      !['PLACED', 'CONFIRMED', 'PROCESSING'].includes(order.status) ||
      !['PENDING', 'PREPARING', 'READY', 'RETURNED'].includes(order.fulfillmentStatus)
    )
      throw new ApiError('INVALID_STATE_TRANSITION');
    const activeShipment = await tx.shipment.findFirst({
      where: { orderId: id, status: { in: ['HANDED_TO_CARRIER', 'DELIVERED', 'FAILED'] } },
    });
    if (activeShipment !== null) throw new ApiError('INVALID_STATE_TRANSITION');
    const now = await dealerNow(tx);
    const funding = await readDealerFunding(tx, id, BigInt(order.grandTotal.toString()));
    const settlement = order.dealerDetail.returnSettlement as Record<string, unknown> | null;
    if (order.fulfillmentStatus === 'RETURNED' && settlement === null)
      throw new ApiError(
        'INVALID_STATE_TRANSITION',
        'Nhân viên cần chốt trách nhiệm và phí giao hoàn trước khi hủy đơn.',
      );
    const retainedFee =
      order.fulfillmentStatus === 'RETURNED' && typeof settlement?.['charge'] === 'string'
        ? BigInt(settlement['charge'])
        : 0n;
    if (retainedFee > funding.fundedAmount)
      throw new ApiError('INVALID_STATE_TRANSITION', 'Nguồn tiền còn giữ không đủ phí đã chốt.');
    await this.inventory.releaseOrderReservations(id, now, tx, expired ? 'EXPIRED' : 'RELEASED');
    await tx.dealerPaymentProof.updateMany({
      where: { paymentRequest: { orderId: id }, status: 'UNDER_REVIEW' },
      data: { status: 'CANCELLED', reviewedAt: now, reason },
    });
    await tx.dealerPaymentRequest.updateMany({
      where: { orderId: id, status: 'OPEN' },
      data: { status: expired ? 'EXPIRED' : 'CANCELLED' },
    });
    await tx.dealerOrderDetail.update({
      where: { orderId: id },
      data: { reviewStartedAt: null, reviewOrigin: null, submissionRemainingMs: null },
    });
    await tx.shipment.updateMany({
      where: { orderId: id, status: 'CREATED' },
      data: { status: 'CANCELLED' },
    });
    await tx.order.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        fulfillmentStatus: 'CANCELLED',
        cancelledAt: now,
        cancelReason: reason,
      },
    });
    if (funding.fundedAmount > retainedFee)
      await this.refunds.reserve(
        tx,
        {
          dealerId: order.dealerId,
          orderId: id,
          amount: (funding.fundedAmount - retainedFee).toString(),
          reason,
        },
        actor,
      );
    await this.audit.write(tx, actor, {
      action: expired ? 'dealer.order.expired' : 'dealer.order.cancelled',
      resourceType: 'Order',
      resourceId: id,
      metadata: { reason },
    });
  }

  public async expireDue() {
    if (!this.runtime.enabled) return 0;
    const now = await dealerNow(this.prisma);
    const candidates = await this.prisma.order.findMany({
      where: {
        channel: 'DEALER',
        status: 'PLACED',
        dealerDetail: {
          reviewStartedAt: null,
          reconciliationHold: false,
          OR: [
            { balanceDeadlineAt: { lte: now } },
            { balanceDeadlineAt: null, submissionDeadlineAt: { lte: now } },
          ],
        },
      },
      select: { id: true },
      take: 100,
    });
    let count = 0;
    for (const candidate of candidates)
      await this.transactions.run('dealer.order.expire', async (tx) => {
        const order = await lockDealerOrder(tx, candidate.id);
        if (
          order.status !== 'PLACED' ||
          order.dealerDetail.reviewStartedAt !== null ||
          order.dealerDetail.reconciliationHold ||
          (order.dealerDetail.balanceDeadlineAt ?? order.dealerDetail.submissionDeadlineAt) > now
        )
          return;
        await this.cancelLocked(
          tx,
          order.id,
          'Hết thời hạn giữ máy.',
          {
            actorType: 'SYSTEM',
            requestId: randomUUID(),
            ipAddress: 'system',
            userAgent: 'dealer-expiry-worker',
          },
          true,
        );
        count++;
      });
    return count;
  }

  public async reviewQueue() {
    const rows = await this.prisma.dealerPaymentProof.findMany({
      where: { status: 'UNDER_REVIEW' },
      include: {
        paymentRequest: {
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                dealerId: true,
                dealerDetail: { select: { reviewWarningMinutes: true } },
              },
            },
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      orderId: row.paymentRequest.order.id,
      orderNumber: row.paymentRequest.order.orderNumber,
      dealerId: row.paymentRequest.order.dealerId,
      requiredAmount: row.paymentRequest.requiredAmount.toString(),
      submittedAt: row.submittedAt.toISOString(),
      overdue:
        Date.now() >=
        row.submittedAt.getTime() +
          (row.paymentRequest.order.dealerDetail?.reviewWarningMinutes ?? 120) * 60_000,
    }));
  }

  private async signal(tx: Prisma.TransactionClient, id: string) {
    // Force a resource version for proof/hold changes that do not alter Order status.
    await tx.order.update({ where: { id }, data: { dealerResourceVersion: { increment: 1 } } });
  }
  private async cleanup(bucket: string, path: string) {
    try {
      await this.storage.delete(bucket, path);
    } catch {
      this.logger.warn({ event: 'dealer.evidence.cleanup_failed' });
    }
  }
}
