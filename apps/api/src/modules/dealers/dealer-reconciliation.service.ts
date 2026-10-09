import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import {
  lockDealerReceipt,
  readDealerFunding,
  refreshDealerFunding,
} from './dealer-ledger.reader.js';
import { lockDealerOrder } from './dealer-order.service.js';
import { dealerHash } from './dealer-runtime.service.js';

@Injectable()
export class DealerReconciliationService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
  ) {}

  public async list() {
    const rows = await this.prisma.dealerReconciliationCase.findMany({
      include: { bankTransaction: { select: { dealerId: true, bankReference: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      bankTransactionId: row.bankTransactionId,
      dealerId: row.bankTransaction.dealerId,
      bankReference: row.bankTransaction.bankReference,
      proposedAmount: row.proposedAmount.toString(),
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      resolutionNote: row.resolutionNote,
    }));
  }

  public correct(
    id: string,
    amount: string,
    reason: string,
    key: string | undefined,
    actor: AuditActorContext,
  ) {
    if (key === undefined || !/^[\x21-\x7e]{16,128}$/.test(key))
      throw new ApiError('VALIDATION_FAILED', 'Cần Idempotency-Key cho điều chỉnh tiền.');
    const keyHash = dealerHash(`${id}:${key}`);
    return this.transactions.run('dealer.receipt.correct', async (tx) => {
      await this.lockAffectedOrders(tx, id);
      const { receipt, projection, effective } = await lockDealerReceipt(tx, id);
      const oldCorrection = await tx.dealerBankCorrection.findUnique({
        where: { idempotencyKey: keyHash },
      });
      const oldCase = await tx.dealerReconciliationCase.findUnique({
        where: { idempotencyKey: keyHash },
      });
      if (oldCorrection !== null || oldCase !== null) {
        if (
          (oldCorrection?.amount ?? oldCase?.proposedAmount)?.toString() !== amount ||
          (oldCorrection?.reason ?? oldCase?.reason) !== reason
        )
          throw new ApiError('CONCURRENT_MODIFICATION');
        return {
          id: (oldCorrection ?? oldCase)?.id,
          requiresReconciliation: oldCase !== null,
          replayed: true,
        };
      }
      const change = BigInt(amount);
      const hasRefundObligation = projection.refundObligationAmount > 0n;
      const irreversible =
        (await tx.order.count({
          where: {
            dealerAllocations: { some: { bankTransactionId: id } },
            OR: [
              { status: 'COMPLETED' },
              {
                shipments: {
                  some: {
                    status: { in: ['HANDED_TO_CARRIER', 'DELIVERED', 'FAILED', 'RETURNED'] },
                  },
                },
              },
            ],
          },
        })) > 0;
      if (
        receipt.reconciliationHold ||
        hasRefundObligation ||
        irreversible ||
        effective + change < 0n ||
        (change < 0n && -change > projection.unallocatedAvailable)
      ) {
        const row = await tx.dealerReconciliationCase.create({
          data: {
            bankTransactionId: id,
            proposedAmount: amount,
            reason,
            idempotencyKey: keyHash,
            openedById: actor.actorUserId,
          },
        });
        await tx.dealerBankTransaction.update({
          where: { id },
          data: { reconciliationHold: true },
        });
        await this.audit.write(tx, actor, {
          action: 'dealer.reconciliation.opened',
          resourceType: 'DealerReconciliationCase',
          resourceId: row.id,
          metadata: { reason, proposedAmount: amount },
        });
        return { id: row.id, requiresReconciliation: true, replayed: false };
      }
      const correction = await tx.dealerBankCorrection.create({
        data: {
          bankTransactionId: id,
          amount,
          reason,
          actorUserId: actor.actorUserId,
          idempotencyKey: keyHash,
        },
      });
      await this.audit.write(tx, actor, {
        action: 'dealer.receipt.corrected',
        resourceType: 'DealerBankTransaction',
        resourceId: id,
        metadata: { correctionId: correction.id, amount, reason },
      });
      return { id: correction.id, requiresReconciliation: false, replayed: false };
    });
  }

  /** Reversal records an attribution error before dispatch. Money already committed to refunds cannot be erased. */
  public reverseAllocation(id: string, reason: string, actor: AuditActorContext) {
    return this.transactions.run('dealer.allocation.reverse', async (tx) => {
      const initial = await tx.dealerPaymentAllocation.findUnique({ where: { id } });
      if (initial === null) throw new ApiError('RESOURCE_NOT_FOUND');
      const order = await lockDealerOrder(tx, initial.orderId);
      const { receipt } = await lockDealerReceipt(tx, initial.bankTransactionId);
      const allocation = receipt.allocations.find((row) => row.id === id);
      if (allocation === undefined) throw new ApiError('RESOURCE_NOT_FOUND');
      if (
        order.status === 'COMPLETED' ||
        (await tx.shipment.count({
          where: {
            orderId: order.id,
            status: { in: ['HANDED_TO_CARRIER', 'DELIVERED', 'FAILED', 'RETURNED'] },
          },
        })) > 0 ||
        allocation.refundSources.some((source) =>
          ['REQUESTED', 'PROCESSING', 'COMPLETED'].includes(source.refund.status),
        )
      )
        throw new ApiError(
          'INVALID_STATE_TRANSITION',
          'Khoản tiền đã tham gia giao hàng hoặc hoàn tiền; xử lý bằng hồ sơ đối soát.',
        );
      const amount =
        BigInt(allocation.amount.toString()) -
        allocation.reversals.reduce((sum, row) => sum + BigInt(row.amount.toString()), 0n);
      if (amount === 0n) return { id, reversed: true };
      await tx.dealerAllocationReversal.create({
        data: {
          allocationId: id,
          amount: amount.toString(),
          reason,
          actorUserId: actor.actorUserId,
        },
      });
      await refreshDealerFunding(tx, order.id, BigInt(order.grandTotal.toString()));
      await tx.dealerOrderDetail.update({
        where: { orderId: order.id },
        data: { reconciliationHold: true },
      });
      await this.audit.write(tx, actor, {
        action: 'dealer.allocation.reversed',
        resourceType: 'DealerPaymentAllocation',
        resourceId: id,
        metadata: { amount: amount.toString(), reason },
      });
      return { id, reversed: true, orderOnHold: true };
    });
  }

  public resolve(id: string, reason: string, applyCorrection: boolean, actor: AuditActorContext) {
    return this.transactions.run('dealer.reconciliation.resolve', async (tx) => {
      const initial = await tx.dealerReconciliationCase.findUnique({ where: { id } });
      if (initial === null) throw new ApiError('RESOURCE_NOT_FOUND');
      const orders = await this.lockAffectedOrders(tx, initial.bankTransactionId);
      const { receipt, projection, effective } = await lockDealerReceipt(
        tx,
        initial.bankTransactionId,
      );
      const current = await tx.dealerReconciliationCase.findUniqueOrThrow({ where: { id } });
      if (current.resolvedAt !== null) throw new ApiError('INVALID_STATE_TRANSITION');
      const change = BigInt(current.proposedAmount.toString());
      if (applyCorrection) {
        if (effective + change < 0n || (change < 0n && -change > projection.unallocatedAvailable))
          throw new ApiError(
            'INVALID_STATE_TRANSITION',
            'Chưa đủ hạn mức để ghi điều chỉnh. Không được đảo tiền đã hoàn hoặc giao hàng.',
          );
        await tx.dealerBankCorrection.create({
          data: {
            bankTransactionId: receipt.id,
            amount: current.proposedAmount,
            reason,
            actorUserId: actor.actorUserId,
            idempotencyKey: `case:${id}`,
          },
        });
      }
      await tx.dealerReconciliationCase.update({
        where: { id },
        data: {
          resolvedAt: new Date(),
          resolvedById: actor.actorUserId,
          resolutionNote: `${applyCorrection ? 'Đã ghi điều chỉnh' : 'Giữ nguyên khoản thu'}: ${reason}`,
        },
      });
      const open = await tx.dealerReconciliationCase.count({
        where: { bankTransactionId: receipt.id, resolvedAt: null },
      });
      if (open === 0)
        await tx.dealerBankTransaction.update({
          where: { id: receipt.id },
          data: { reconciliationHold: false },
        });
      for (const order of orders)
        await refreshDealerFunding(tx, order.id, BigInt(order.grandTotal.toString()));
      await this.audit.write(tx, actor, {
        action: 'dealer.reconciliation.resolved',
        resourceType: 'DealerReconciliationCase',
        resourceId: id,
        metadata: { reason, applyCorrection },
      });
      return { id, resolved: true };
    });
  }

  public releaseOrder(id: string, reason: string, actor: AuditActorContext) {
    return this.transactions.run('dealer.order.release_reconciliation', async (tx) => {
      const order = await lockDealerOrder(tx, id);
      const funding = await readDealerFunding(tx, id, BigInt(order.grandTotal.toString()));
      if (
        funding.fundingShortfall !== 0n ||
        funding.rows.some((row) => row.bankTransaction.reconciliationHold)
      )
        throw new ApiError('ORDER_NOT_FULLY_PAID');
      await tx.dealerOrderDetail.update({
        where: { orderId: id },
        data: { reconciliationHold: false },
      });
      await this.audit.write(tx, actor, {
        action: 'dealer.order.reconciliation_released',
        resourceType: 'Order',
        resourceId: id,
        metadata: { reason },
      });
      return { id, released: true };
    });
  }

  private async lockAffectedOrders(tx: Prisma.TransactionClient, receiptId: string) {
    const rows = await tx.order.findMany({
      where: { dealerAllocations: { some: { bankTransactionId: receiptId } } },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    const orders = [];
    for (const row of rows) orders.push(await lockDealerOrder(tx, row.id));
    return orders;
  }
}
