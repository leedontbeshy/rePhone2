import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../common/errors/api-error.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../../common/providers/storage-provider.js';
import { PrivateEvidenceValidator } from '../storage/private-evidence.validator.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext, AuditWriteActorContext } from '../audit/audit.types.js';
import {
  lockDealerReceipt,
  readDealerFunding,
  refreshDealerFunding,
} from './dealer-ledger.reader.js';
import { lockDealerOrder } from './dealer-order.service.js';
import { lockDealer } from './dealer-profile.service.js';
import { DealerRuntime, canonicalDealerJson, dealerHash } from './dealer-runtime.service.js';
import type { DealerRefundActionDto, DealerRefundDto } from './dealer.dto.js';

const holding = ['REQUESTED', 'PROCESSING', 'COMPLETED'];
@Injectable()
export class DealerRefundService {
  private readonly logger = new Logger(DealerRefundService.name);
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(DealerRuntime) private readonly runtime: DealerRuntime,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(PrivateEvidenceValidator) private readonly evidence: PrivateEvidenceValidator,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  public async list(dealerId?: string) {
    const rows = await this.prisma.refund.findMany({
      where: { dealerId: dealerId ?? { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      dealerId: row.dealerId,
      orderId: row.orderId,
      amount: row.amount.toString(),
      status: row.status,
      reason: row.reason,
      payoutHold: row.payoutHold,
      transferState: row.transferState,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    }));
  }

  public create(input: DealerRefundDto, actor: AuditActorContext, key?: string) {
    this.runtime.assertEnabled();
    if (key === undefined || !/^[\x21-\x7e]{16,128}$/.test(key))
      throw new ApiError('VALIDATION_FAILED', 'Cần Idempotency-Key cho yêu cầu hoàn tiền.');
    const keyHash = dealerHash(key);
    const payloadHash = dealerHash(canonicalDealerJson(input));
    return this.transactions.run('dealer.refund.create', async (tx) => {
      // Serialize the target source before reading the durable command record.
      if (input.orderId !== undefined) await lockDealerOrder(tx, input.orderId, input.dealerId);
      else if (input.bankTransactionId !== undefined)
        await lockDealerReceipt(tx, input.bankTransactionId);
      const prior = await tx.dealerIdempotencyRecord.findUnique({
        where: {
          dealerId_operation_keyHash: {
            dealerId: input.dealerId,
            operation: 'CREATE_REFUND',
            keyHash,
          },
        },
      });
      if (prior !== null) {
        if (prior.payloadHash !== payloadHash) throw new ApiError('CONCURRENT_MODIFICATION');
        return prior.responseSnapshot;
      }
      const result = await this.reserve(tx, input, actor);
      const id = result.refunds[0]?.id;
      if (id === undefined) throw new ApiError('INTERNAL_ERROR');
      await tx.dealerIdempotencyRecord.create({
        data: {
          dealerId: input.dealerId,
          operation: 'CREATE_REFUND',
          keyHash,
          payloadHash,
          resourceId: id,
          responseSnapshot: result,
        },
      });
      return result;
    });
  }

  /** Reserve quota first. A disabled payout destination holds cash; it never erases the obligation. */
  public async reserve(
    tx: Prisma.TransactionClient,
    input: DealerRefundDto,
    actor: AuditWriteActorContext,
  ) {
    if ((input.orderId === undefined) === (input.bankTransactionId === undefined))
      throw new ApiError('VALIDATION_FAILED', 'Chọn đúng một nguồn hoàn tiền.');
    const amount = BigInt(input.amount);
    if (amount <= 0n) throw new ApiError('VALIDATION_FAILED');
    const sources: Array<{ allocationId?: string; bankTransactionId?: string; amount: string }> =
      [];
    let order: Awaited<ReturnType<typeof lockDealerOrder>> | undefined;
    if (input.orderId !== undefined) {
      order = await lockDealerOrder(tx, input.orderId, input.dealerId);
      const funding = await readDealerFunding(tx, order.id, BigInt(order.grandTotal.toString()));
      if (amount > funding.fundedAmount) throw new ApiError('REFUND_AMOUNT_EXCEEDS_PAID');
      let remaining = amount;
      for (const allocation of funding.rows) {
        const held = allocation.refundSources
          .filter((source) => holding.includes(source.refund.status))
          .reduce((sum, source) => sum + BigInt(source.amount.toString()), 0n);
        const available =
          BigInt(allocation.amount.toString()) -
          allocation.reversals.reduce((sum, row) => sum + BigInt(row.amount.toString()), 0n) -
          held;
        const part = remaining < available ? remaining : available;
        if (part > 0n) sources.push({ allocationId: allocation.id, amount: part.toString() });
        remaining -= part;
        if (remaining === 0n) break;
      }
    } else if (input.bankTransactionId !== undefined) {
      const { receipt, projection } = await lockDealerReceipt(tx, input.bankTransactionId);
      if (receipt.dealerId !== input.dealerId) throw new ApiError('RESOURCE_NOT_FOUND');
      if (receipt.reconciliationHold)
        throw new ApiError('INVALID_STATE_TRANSITION', 'Khoản thu đang chờ đối soát.');
      if (amount > projection.unallocatedAvailable)
        throw new ApiError('REFUND_AMOUNT_EXCEEDS_PAID');
      sources.push({ bankTransactionId: receipt.id, amount: input.amount });
    }
    await lockDealer(tx, input.dealerId);
    const bank = await tx.dealerBankAccount.findFirst({
      where: {
        dealerId: input.dealerId,
        verifiedAt: { not: null },
        effectiveAt: { lte: new Date() },
      },
      orderBy: [{ disabledAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
    });
    if (bank === null)
      throw new ApiError(
        'INVALID_STATE_TRANSITION',
        'Cần xác minh tài khoản đại lý trước khi ghi nhận hoàn tiền.',
      );
    const refunds: Array<{ id: string; status: string; amount: string; payoutHold: boolean }> = [];
    for (const source of sources) {
      const refund = await tx.refund.create({
        data: {
          orderId: input.orderId ?? null,
          dealerId: input.dealerId,
          amount: source.amount,
          method: 'BANK_TRANSFER',
          reason: input.reason,
          requestedByType: 'SYSTEM',
          requestedById: null,
          dealerBankAccountId: bank.id,
          destinationSnapshot: {
            bankName: bank.bankName,
            accountHolder: bank.accountHolder,
            accountLastFour: bank.accountLastFour,
            accountNumberCiphertext: bank.accountNumberCiphertext,
          },
          payoutHold: bank.disabledAt !== null,
          payoutHoldReason: bank.disabledAt === null ? null : 'Tài khoản nhận hoàn bị khóa.',
          dealerSources: { create: source },
        },
      });
      await this.audit.write(tx, actor, {
        action: 'dealer.refund.requested',
        resourceType: 'Refund',
        resourceId: refund.id,
        metadata: { dealerId: input.dealerId, amount: source.amount, reason: input.reason },
      });
      refunds.push({
        id: refund.id,
        status: refund.status,
        amount: source.amount,
        payoutHold: refund.payoutHold,
      });
    }
    if (order !== undefined)
      await refreshDealerFunding(tx, order.id, BigInt(order.grandTotal.toString()));
    return { refunds, totalAmount: input.amount };
  }

  private async lockRefund(tx: Prisma.TransactionClient, id: string) {
    const initial = await tx.refund.findUnique({ where: { id } });
    if (initial === null || initial.dealerId === null) throw new ApiError('RESOURCE_NOT_FOUND');
    if (initial.orderId !== null) await lockDealerOrder(tx, initial.orderId, initial.dealerId);
    const sources = await tx.dealerRefundSource.findMany({
      where: { refundId: id, bankTransactionId: { not: null } },
      orderBy: { bankTransactionId: 'asc' },
    });
    for (const source of sources)
      if (source.bankTransactionId !== null) await lockDealerReceipt(tx, source.bankTransactionId);
    await lockDealer(tx, initial.dealerId);
    await tx.$queryRaw`SELECT id FROM refunds WHERE id=${id}::uuid FOR UPDATE`;
    const refund = await tx.refund.findUnique({
      where: { id },
      include: { dealerBankAccount: true },
    });
    if (refund === null || refund.dealerId === null) throw new ApiError('RESOURCE_NOT_FOUND');
    const reconciliationHold =
      (await tx.dealerRefundSource.count({
        where: {
          refundId: id,
          OR: [
            { bankTransaction: { reconciliationHold: true } },
            { allocation: { bankTransaction: { reconciliationHold: true } } },
          ],
        },
      })) > 0;
    return { ...refund, dealerId: refund.dealerId, reconciliationHold };
  }

  public async action(id: string, input: DealerRefundActionDto, actor: AuditActorContext) {
    return this.transactions.run('dealer.refund.action', async (tx) => {
      const refund = await this.lockRefund(tx, id);
      if (!['REQUESTED', 'PROCESSING'].includes(refund.status))
        throw new ApiError('INVALID_STATE_TRANSITION');
      const now = new Date();
      if (refund.reconciliationHold && ['START', 'RELEASE', 'MARK_SENT'].includes(input.action))
        throw new ApiError('INVALID_STATE_TRANSITION', 'Khoản thu đang chờ đối soát.');
      let data: Prisma.RefundUpdateInput;
      switch (input.action) {
        case 'HOLD':
          data = { payoutHold: true, payoutHoldReason: input.reason };
          break;
        case 'RELEASE':
          if (refund.transferState !== 'NOT_SENT' || refund.dealerBankAccount?.disabledAt !== null)
            throw new ApiError('INVALID_STATE_TRANSITION');
          data = { payoutHold: false, payoutHoldReason: null };
          break;
        case 'START':
          if (
            refund.status !== 'REQUESTED' ||
            refund.payoutHold ||
            refund.dealerBankAccount?.disabledAt !== null
          )
            throw new ApiError('INVALID_STATE_TRANSITION');
          data = {
            status: 'PROCESSING',
            processingAt: now,
            processedBy: { connect: { id: actor.actorUserId } },
          };
          break;
        case 'MARK_SENT':
        case 'MARK_UNKNOWN':
          if (refund.status !== 'PROCESSING' || refund.payoutHold)
            throw new ApiError('INVALID_STATE_TRANSITION');
          data = {
            transferState: input.action === 'MARK_SENT' ? 'SENT' : 'UNKNOWN',
            ...(input.action === 'MARK_UNKNOWN'
              ? { payoutHold: true, payoutHoldReason: input.reason }
              : {}),
          };
          break;
        case 'REJECT':
        case 'CANCEL':
          if (refund.status !== 'REQUESTED' || refund.transferState !== 'NOT_SENT')
            throw new ApiError('INVALID_STATE_TRANSITION');
          data = {
            status: input.action === 'REJECT' ? 'REJECTED' : 'CANCELLED',
            terminalAt: now,
            terminalBy: { connect: { id: actor.actorUserId } },
            terminalReason: input.reason,
          };
          break;
        default:
          throw new ApiError('VALIDATION_FAILED');
      }
      await tx.refund.update({ where: { id }, data });
      if (refund.orderId !== null) {
        const order = await lockDealerOrder(tx, refund.orderId);
        await refreshDealerFunding(tx, order.id, BigInt(order.grandTotal.toString()));
      }
      await this.audit.write(tx, actor, {
        action: `dealer.refund.${input.action.toLowerCase()}`,
        resourceType: 'Refund',
        resourceId: id,
        metadata: { reason: input.reason },
      });
      return { id, action: input.action };
    });
  }

  public async destination(id: string, actor: AuditActorContext) {
    return this.transactions.run('dealer.refund.destination', async (tx) => {
      const refund = await this.lockRefund(tx, id);
      if (
        refund.status !== 'PROCESSING' ||
        refund.payoutHold ||
        refund.reconciliationHold ||
        refund.dealerBankAccount?.disabledAt !== null ||
        refund.transferState !== 'NOT_SENT'
      )
        throw new ApiError('INVALID_STATE_TRANSITION');
      const snapshot = refund.destinationSnapshot as Record<string, unknown>;
      if (typeof snapshot['accountNumberCiphertext'] !== 'string')
        throw new ApiError('INTERNAL_ERROR');
      await this.audit.write(tx, actor, {
        action: 'dealer.refund.destination_viewed',
        resourceType: 'Refund',
        resourceId: id,
      });
      return {
        bankName: snapshot['bankName'],
        accountHolder: snapshot['accountHolder'],
        accountNumber: this.runtime.decrypt(snapshot['accountNumberCiphertext']),
        amount: refund.amount.toString(),
      };
    });
  }

  public rebind(id: string, bankId: string, reason: string, actor: AuditActorContext) {
    return this.transactions.run('dealer.refund.rebind', async (tx) => {
      const refund = await this.lockRefund(tx, id);
      if (
        !['REQUESTED', 'PROCESSING'].includes(refund.status) ||
        refund.transferState !== 'NOT_SENT'
      )
        throw new ApiError('INVALID_STATE_TRANSITION');
      const bank = await tx.dealerBankAccount.findFirst({
        where: {
          id: bankId,
          dealerId: refund.dealerId,
          verifiedAt: { not: null },
          effectiveAt: { lte: new Date() },
          disabledAt: null,
        },
      });
      if (bank === null)
        throw new ApiError(
          'INVALID_STATE_TRANSITION',
          'Chọn tài khoản cùng đại lý đã xác minh và có hiệu lực.',
        );
      await tx.refund.update({
        where: { id },
        data: {
          dealerBankAccountId: bank.id,
          destinationSnapshot: {
            bankName: bank.bankName,
            accountHolder: bank.accountHolder,
            accountLastFour: bank.accountLastFour,
            accountNumberCiphertext: bank.accountNumberCiphertext,
          },
          payoutHold: true,
          payoutHoldReason: 'Đã đổi tài khoản; cần kiểm tra trước khi tiếp tục chuyển.',
        },
      });
      await this.audit.write(tx, actor, {
        action: 'dealer.refund.destination_rebound',
        resourceType: 'Refund',
        resourceId: id,
        metadata: { oldBankId: refund.dealerBankAccountId, newBankId: bank.id, reason },
      });
      return { id, payoutHold: true };
    });
  }

  public async complete(
    id: string,
    file: Express.Multer.File | undefined,
    actor: AuditActorContext,
  ) {
    const candidate = await this.prisma.refund.findFirst({
      where: { id, dealerId: { not: null }, status: 'PROCESSING' },
    });
    if (candidate === null) throw new ApiError('RESOURCE_NOT_FOUND');
    const evidence = await this.evidence.validate(file);
    const stored = await this.storage.upload({
      bucket: this.runtime.config.storage.privateBucket,
      objectPath: `refunds/${id}/${this.runtime.mode}-${randomUUID()}.${evidence.extension}`,
      bytes: evidence.bytes,
      mimeType: evidence.mimeType,
    });
    try {
      await this.transactions.run('dealer.refund.complete', async (tx) => {
        const refund = await this.lockRefund(tx, id);
        if (refund.status !== 'PROCESSING' || refund.transferState === 'NOT_SENT')
          throw new ApiError(
            'INVALID_STATE_TRANSITION',
            'Cần xác nhận đã chuyển tiền hoặc đối soát giao dịch chưa rõ kết quả.',
          );
        // A sent transfer must be reconciled even if its old destination was subsequently disabled.
        await tx.refund.update({
          where: { id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            processedById: actor.actorUserId,
            note: 'Đã đối soát và xác nhận chứng từ chuyển tiền.',
            payoutHold: false,
            payoutHoldReason: null,
            transferState: 'SENT',
            evidenceBucket: stored.bucket,
            evidenceObjectPath: stored.objectPath,
            evidenceMimeType: evidence.mimeType,
            evidenceFileSize: evidence.fileSize,
            evidenceSha256: evidence.sha256,
          },
        });
        if (refund.orderId !== null) {
          const order = await lockDealerOrder(tx, refund.orderId);
          await refreshDealerFunding(tx, order.id, BigInt(order.grandTotal.toString()));
        }
        await this.audit.write(tx, actor, {
          action: 'dealer.refund.completed',
          resourceType: 'Refund',
          resourceId: id,
        });
      });
    } catch (error) {
      try {
        await this.storage.delete(stored.bucket, stored.objectPath);
      } catch {
        this.logger.warn({ event: 'dealer.evidence.cleanup_failed', resourceId: id });
      }
      throw error;
    }
    return { id, status: 'COMPLETED' };
  }
}
