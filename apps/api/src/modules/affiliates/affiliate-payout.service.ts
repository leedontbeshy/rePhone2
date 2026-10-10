import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { AffiliatePayout, Prisma } from '../../generated/prisma/client.js';
import { ApiError } from '../../common/errors/api-error.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../../common/providers/storage-provider.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import { PrivateEvidenceValidator } from '../storage/private-evidence.validator.js';
import { AffiliateLedgerService } from '../affiliate-core/affiliate-ledger.service.js';
import { AffiliateRuntime } from '../affiliate-core/affiliate-runtime.service.js';
import { AFFILIATE_MIN_PAYOUT, money } from '../affiliate-core/affiliate.policy.js';
import {
  AffiliateProfileService,
  lockAffiliate,
  projectBank,
} from './affiliate-profile.service.js';
import type { AffiliateCompleteDto, AffiliatePayoutActionDto } from './affiliate.dto.js';

export function projectPayout(p: AffiliatePayout) {
  const snapshot = p.bankSnapshot as Record<string, unknown>;
  return {
    id: p.id,
    affiliateId: p.affiliateId,
    amount: p.amount.toString(),
    status: p.status,
    note: p.note,
    createdAt: p.createdAt,
    transferredAt: p.transferredAt,
    transferReference: p.transferReference,
    bank: {
      bankName: snapshot['bankName'],
      accountHolder: snapshot['accountHolder'],
      lastFour: snapshot['lastFour'],
    },
  };
}
@Injectable()
export class AffiliatePayoutService {
  private readonly logger = new Logger(AffiliatePayoutService.name);
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AffiliateRuntime) private readonly runtime: AffiliateRuntime,
    @Inject(AffiliateLedgerService) private readonly ledger: AffiliateLedgerService,
    @Inject(AffiliateProfileService) private readonly profiles: AffiliateProfileService,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(PrivateEvidenceValidator) private readonly validator: PrivateEvidenceValidator,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}
  public async request(requestKey: string, actor: AuditActorContext) {
    this.runtime.assertEnabled();
    const profile = await this.profiles.requireOwn(actor.actorUserId);
    return this.transactions.run(
      'affiliate.payout.request',
      async (tx) => {
        const replay = await tx.affiliatePayout.findUnique({
          where: { affiliateId_requestKey: { affiliateId: profile.id, requestKey } },
        });
        if (replay) return projectPayout(replay);
        const sources = await tx.affiliateAttribution.findMany({
          where: {
            affiliateId: profile.id,
            commissions: { some: { status: { in: ['PENDING', 'HELD', 'AVAILABLE'] } } },
          },
          select: { orderId: true },
        });
        await this.ledger.lockOrders(
          tx,
          sources.map((s) => s.orderId),
        );
        const p = await lockAffiliate(tx, profile.id);
        if (!['ACTIVE', 'SUSPENDED'].includes(p.status) || p.payoutHold)
          throw new ApiError('FORBIDDEN', 'Hồ sơ đang chờ duyệt hoặc tạm giữ chi trả.');
        if (
          await tx.affiliatePayout.findFirst({
            where: {
              affiliateId: p.id,
              status: { in: ['REQUESTED', 'PROCESSING', 'NEEDS_REVIEW'] },
            },
          })
        )
          throw new ApiError('INVALID_STATE_TRANSITION', 'Bạn đã có yêu cầu rút tiền đang xử lý.');
        for (const source of sources) await this.ledger.reconcile(tx, source.orderId);
        const commissions = await tx.affiliateCommission.findMany({
          where: {
            attribution: { affiliateId: p.id },
            status: 'AVAILABLE',
            payoutItems: { none: { active: true } },
          },
          orderBy: { id: 'asc' },
        });
        const amount = commissions.reduce((sum, c) => sum + money(c.amount), 0n);
        if (amount < AFFILIATE_MIN_PAYOUT)
          throw new ApiError('VALIDATION_FAILED', 'Số dư khả dụng cần đạt 200.000đ để rút.');
        const bank = await tx.affiliateBankAccount.findFirst({
          where: {
            affiliateId: p.id,
            verifiedAt: { not: null },
            effectiveAt: { lte: new Date() },
            disabledAt: null,
          },
          orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
        });
        if (!bank)
          throw new ApiError(
            'INVALID_STATE_TRANSITION',
            'Chưa có tài khoản ngân hàng đã xác minh và có hiệu lực.',
          );
        const payout = await tx.affiliatePayout.create({
          data: {
            affiliateId: p.id,
            bankAccountId: bank.id,
            bankSnapshot: {
              ...projectBank(bank),
              createdAt: bank.createdAt.toISOString(),
              verifiedAt: bank.verifiedAt?.toISOString() ?? null,
              emailConfirmedAt: bank.emailConfirmedAt?.toISOString() ?? null,
              effectiveAt: bank.effectiveAt?.toISOString() ?? null,
              disabledAt: null,
              accountCiphertext: bank.accountCiphertext,
            },
            requestKey,
            amount: amount.toString(),
            items: { create: commissions.map((c) => ({ commissionId: c.id, amount: c.amount })) },
          },
        });
        await tx.affiliateCommission.updateMany({
          where: { id: { in: commissions.map((c) => c.id) } },
          data: { status: 'RESERVED' },
        });
        await this.audit.write(tx, actor, {
          action: 'affiliate.payout.requested',
          resourceType: 'AffiliatePayout',
          resourceId: payout.id,
          metadata: { amount: amount.toString() },
        });
        return projectPayout(payout);
      },
      undefined,
      { timeoutMs: 15000 },
    );
  }
  private async locked(tx: Prisma.TransactionClient, id: string) {
    const found = await tx.affiliatePayout.findUnique({
      where: { id },
      include: { items: { include: { commission: true } } },
    });
    if (!found) throw new ApiError('RESOURCE_NOT_FOUND');
    const orders = [...new Set(found.items.map((i) => i.commission.orderId))];
    await this.ledger.lockOrders(tx, orders);
    const affiliate = await lockAffiliate(tx, found.affiliateId);
    await tx.$queryRaw`SELECT id FROM affiliate_payouts WHERE id=${id}::uuid FOR UPDATE`;
    for (const orderId of orders) await this.ledger.reconcile(tx, orderId);
    const payout = await tx.affiliatePayout.findUniqueOrThrow({
      where: { id },
      include: { items: { include: { commission: true } }, bankAccount: true },
    });
    return { payout, affiliate, orders };
  }
  public async action(id: string, input: AffiliatePayoutActionDto, actor: AuditActorContext) {
    this.runtime.assertEnabled();
    return this.transactions.run(
      'affiliate.payout.action',
      async (tx) => {
        const { payout: p, affiliate, orders } = await this.locked(tx, id);
        if (['PAID', 'REJECTED', 'CANCELLED'].includes(p.status))
          throw new ApiError('INVALID_STATE_TRANSITION');
        if (input.status === 'PROCESSING') {
          if (
            p.status !== 'REQUESTED' ||
            affiliate.payoutHold ||
            p.bankAccount.disabledAt ||
            p.items.some(
              (i) => money(i.amount) !== money(i.commission.amount) || i.commission.holdReason,
            )
          )
            throw new ApiError(
              'INVALID_STATE_TRANSITION',
              'Khoản chi cần được đối soát trước khi chuyển tiền.',
            );
        }
        if (['CANCELLED', 'REJECTED'].includes(input.status)) {
          if (p.status !== 'REQUESTED' && !input.confirmedNotTransferred)
            throw new ApiError(
              'VALIDATION_FAILED',
              'Phải xác nhận ngân hàng chưa chuyển tiền trước khi giải phóng khoản chi.',
            );
          await tx.affiliatePayoutItem.updateMany({
            where: { payoutId: id },
            data: { active: false },
          });
        }
        const updated = await tx.affiliatePayout.update({
          where: { id },
          data: { status: input.status, note: input.note },
        });
        if (['CANCELLED', 'REJECTED'].includes(input.status))
          for (const orderId of orders) await this.ledger.reconcile(tx, orderId);
        await this.audit.write(tx, actor, {
          action: 'affiliate.payout.transition',
          resourceType: 'AffiliatePayout',
          resourceId: id,
          changes: { before: { status: p.status }, after: { status: input.status } },
          metadata: {
            note: input.note,
            confirmedNotTransferred: input.confirmedNotTransferred ?? false,
          },
        });
        return projectPayout(updated);
      },
      undefined,
      { timeoutMs: 15000 },
    );
  }
  public async destination(id: string, actor: AuditActorContext) {
    this.runtime.assertEnabled();
    return this.transactions.run('affiliate.payout.destination', async (tx) => {
      const p = await tx.affiliatePayout.findUnique({ where: { id } });
      if (!p) throw new ApiError('RESOURCE_NOT_FOUND');
      const bank = p.bankSnapshot as Record<string, string>;
      const cipher = bank['accountCiphertext'];
      if (!cipher) throw new ApiError('INTERNAL_ERROR');
      await this.audit.write(tx, actor, {
        action: 'affiliate.payout.destination.read',
        resourceType: 'AffiliatePayout',
        resourceId: id,
      });
      return { ...projectPayout(p), accountNumber: this.runtime.decrypt(cipher) };
    });
  }
  public async complete(
    id: string,
    input: AffiliateCompleteDto,
    file: Express.Multer.File | undefined,
    actor: AuditActorContext,
  ) {
    this.runtime.assertEnabled();
    if (!file) throw new ApiError('VALIDATION_FAILED', 'Cần chứng từ chuyển khoản.');
    const transferredAt = new Date(input.transferredAt);
    if (transferredAt.getTime() > Date.now() + 60_000)
      throw new ApiError('VALIDATION_FAILED', 'Thời điểm chuyển tiền không được ở tương lai.');
    const validated = await this.validator.validate(file);
    const bucket = this.runtime.config.storage.privateBucket;
    const objectPath = `affiliate-payouts/${id}/${randomUUID()}.${validated.extension}`;
    await this.storage.upload({
      bucket,
      objectPath,
      bytes: validated.bytes,
      mimeType: validated.mimeType,
    });
    let retained = false;
    try {
      const result = await this.transactions.run(
        'affiliate.payout.complete',
        async (tx) => {
          const { payout: p } = await this.locked(tx, id);
          if (p.status === 'PAID') {
            const evidence = p.evidence as Record<string, string>;
            if (
              p.transferReference !== input.transferReference ||
              p.transferredAt?.getTime() !== transferredAt.getTime() ||
              evidence['sha256'] !== validated.sha256
            )
              throw new ApiError('DUPLICATE_RESOURCE');
            return { payout: p, stored: false };
          }
          if (!['PROCESSING', 'NEEDS_REVIEW'].includes(p.status) || transferredAt < p.createdAt)
            throw new ApiError('INVALID_STATE_TRANSITION');
          // A reconciled bank transfer is recorded even if a refund happened while the bank was processing it.
          for (const item of p.items) {
            const loss = money(item.amount) - money(item.commission.amount);
            await tx.affiliateCommission.update({
              where: { id: item.commissionId },
              data: {
                paidAmount: item.amount,
                absorbedLoss: (loss > 0n ? loss : 0n).toString(),
                status: 'PAID',
              },
            });
          }
          const payout = await tx.affiliatePayout.update({
            where: { id },
            data: {
              status: 'PAID',
              note: input.note,
              transferReference: input.transferReference,
              transferredAt,
              evidence: {
                bucket,
                objectPath,
                sha256: validated.sha256,
                mimeType: validated.mimeType,
              },
            },
          });
          await this.audit.write(tx, actor, {
            action: 'affiliate.payout.paid',
            resourceType: 'AffiliatePayout',
            resourceId: id,
            metadata: { amount: p.amount.toString(), transferReference: input.transferReference },
          });
          return { payout, stored: true };
        },
        undefined,
        { timeoutMs: 15000 },
      );
      retained = result.stored;
      return projectPayout(result.payout);
    } finally {
      if (!retained)
        try {
          await this.storage.delete(bucket, objectPath);
        } catch {
          this.logger.warn({ event: 'affiliate.evidence.orphan', payoutId: id });
        }
    }
  }
  public async evidence(id: string, actor: AuditActorContext) {
    this.runtime.assertEnabled();
    const data = await this.transactions.run('affiliate.payout.evidence', async (tx) => {
      const p = await tx.affiliatePayout.findUnique({ where: { id } });
      if (!p?.evidence) throw new ApiError('RESOURCE_NOT_FOUND');
      await this.audit.write(tx, actor, {
        action: 'affiliate.payout.evidence.read',
        resourceType: 'AffiliatePayout',
        resourceId: id,
      });
      return p.evidence as Record<string, string>;
    });
    if (!data['bucket'] || !data['objectPath']) throw new ApiError('INTERNAL_ERROR');
    return {
      url: await this.storage.createSignedReadUrl(data['bucket'], data['objectPath'], 300),
    };
  }
}
