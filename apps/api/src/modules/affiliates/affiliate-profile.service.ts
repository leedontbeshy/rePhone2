import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type {
  AffiliateBankAccount,
  AffiliateProfile,
  Prisma,
} from '../../generated/prisma/client.js';
import { ApiError } from '../../common/errors/api-error.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import { PasswordService } from '../auth/password.service.js';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service.js';
import { AffiliateRuntime } from '../affiliate-core/affiliate-runtime.service.js';
import { affiliateHash, AFFILIATE_TERMS } from '../affiliate-core/affiliate.policy.js';
import type {
  AffiliateApplicationDto,
  AffiliateBankDto,
  AffiliatePolicyDto,
  AffiliateTransitionDto,
  AffiliateOverrideDto,
} from './affiliate.dto.js';

export async function lockAffiliate(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM affiliate_profiles WHERE id=${id}::uuid FOR UPDATE`;
  const profile = await tx.affiliateProfile.findUnique({ where: { id } });
  if (!profile) throw new ApiError('RESOURCE_NOT_FOUND');
  return profile;
}
export function projectBank(bank: AffiliateBankAccount) {
  return {
    id: bank.id,
    bankName: bank.bankName,
    accountHolder: bank.accountHolder,
    lastFour: bank.lastFour,
    emailConfirmedAt: bank.emailConfirmedAt,
    verifiedAt: bank.verifiedAt,
    effectiveAt: bank.effectiveAt,
    disabledAt: bank.disabledAt,
    createdAt: bank.createdAt,
  };
}
export function projectProfile(p: AffiliateProfile) {
  return {
    id: p.id,
    displayName: p.displayName,
    phone: p.phone,
    promotionChannels: p.promotionChannels,
    code: p.code,
    status: p.status,
    reason: p.reason,
    payoutHold: p.payoutHold,
    version: p.version,
    termsVersion: p.termsVersion,
    createdAt: p.createdAt,
  };
}
@Injectable()
export class AffiliateProfileService {
  public constructor(
    @Inject(PrismaService) public readonly prisma: PrismaService,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AffiliateRuntime) public readonly runtime: AffiliateRuntime,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(NotificationDeliveryService) private readonly mail: NotificationDeliveryService,
  ) {}
  public async configuration(admin = false) {
    const policy = this.runtime.enabled
      ? await this.prisma.affiliatePolicy.findUnique({ where: { key: 'GLOBAL' } })
      : null;
    return {
      ready: this.runtime.enabled,
      environment: this.runtime.mode,
      enabled: policy?.enabled ?? false,
      rateBps: policy?.rateBps ?? null,
      termsVersion: AFFILIATE_TERMS,
      holdDays: 14,
      attributionDays: 30,
      minimumPayout: '200000',
      ...(admin
        ? {
            reserveAmount: policy?.reserveAmount?.toString() ?? null,
            minimumProfit: policy?.minimumProfit?.toString() ?? null,
            version: policy?.version ?? 0,
          }
        : {}),
    };
  }
  public async policy(input: AffiliatePolicyDto, actor: AuditActorContext) {
    this.runtime.assertEnabled();
    await this.transactions.run('affiliate.policy', async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(817244)`;
      const current = await tx.affiliatePolicy.findUnique({ where: { key: 'GLOBAL' } });
      if ((current?.version ?? 0) !== input.expectedVersion)
        throw new ApiError('CONCURRENT_MODIFICATION');
      const data = {
        enabled: input.enabled,
        rateBps: input.rateBps,
        reserveAmount: input.reserveAmount,
        minimumProfit: input.minimumProfit,
      };
      await tx.affiliatePolicy.upsert({
        where: { key: 'GLOBAL' },
        create: { ...data, version: 1 },
        update: { ...data, version: { increment: 1 } },
      });
      await this.audit.write(tx, actor, {
        action: 'affiliate.policy.updated',
        resourceType: 'AffiliatePolicy',
        metadata: { enabled: input.enabled, rateBps: input.rateBps },
      });
    });
    return this.configuration(true);
  }
  public async override(id: string, input: AffiliateOverrideDto, actor: AuditActorContext) {
    this.runtime.assertEnabled();
    return this.transactions.run('affiliate.override', async (tx) => {
      if (!(await tx.inventoryUnit.findUnique({ where: { id } })))
        throw new ApiError('RESOURCE_NOT_FOUND');
      const result = await tx.affiliateInventoryOverride.upsert({
        where: { inventoryUnitId: id },
        create: { inventoryUnitId: id, enabled: input.enabled, rateBps: input.rateBps ?? null },
        update: { enabled: input.enabled, rateBps: input.rateBps ?? null },
      });
      await this.audit.write(tx, actor, {
        action: 'affiliate.override.updated',
        resourceType: 'InventoryUnit',
        resourceId: id,
        metadata: { enabled: input.enabled, rateBps: input.rateBps ?? null },
      });
      return result;
    });
  }
  public async requireOwn(userId: string, tx: Prisma.TransactionClient = this.prisma) {
    this.runtime.assertEnabled();
    const p = await tx.affiliateProfile.findUnique({ where: { ownerUserId: userId } });
    if (!p) throw new ApiError('RESOURCE_NOT_FOUND', 'Bạn chưa đăng ký cộng tác viên.');
    return p;
  }
  public async own(userId: string) {
    this.runtime.assertEnabled();
    const p = await this.prisma.affiliateProfile.findUnique({
      where: { ownerUserId: userId },
      include: { banks: { orderBy: { createdAt: 'desc' }, take: 30 } },
    });
    return p ? { ...projectProfile(p), banks: p.banks.map(projectBank) } : null;
  }
  public async apply(input: AffiliateApplicationDto, actor: AuditActorContext) {
    this.runtime.assertEnabled();
    await this.transactions.run('affiliate.apply', async (tx) => {
      if (!(await tx.affiliatePolicy.findUnique({ where: { key: 'GLOBAL' } }))?.enabled)
        throw new ApiError('SERVICE_UNAVAILABLE', 'Chương trình đang tạm ngừng nhận đăng ký.');
      await tx.$queryRaw`SELECT id FROM users WHERE id=${actor.actorUserId}::uuid FOR UPDATE`;
      const existing = await tx.affiliateProfile.findUnique({
        where: { ownerUserId: actor.actorUserId },
      });
      if (existing && existing.status !== 'REJECTED') return;
      const data = {
        displayName: input.displayName,
        phone: input.phone,
        promotionChannels: input.promotionChannels,
        termsVersion: input.termsVersion,
        termsAcceptedAt: new Date(),
        status: 'PENDING',
        reason: null,
      };
      const profile = existing
        ? await tx.affiliateProfile.update({
            where: { id: existing.id },
            data: { ...data, version: { increment: 1 } },
          })
        : await tx.affiliateProfile.create({
            data: { ...data, ownerUserId: actor.actorUserId, code: randomBytes(8).toString('hex') },
          });
      await this.audit.write(tx, actor, {
        action: 'affiliate.applied',
        resourceType: 'AffiliateProfile',
        resourceId: profile.id,
      });
    });
    return this.own(actor.actorUserId);
  }
  public async transition(id: string, input: AffiliateTransitionDto, actor: AuditActorContext) {
    this.runtime.assertEnabled();
    return this.transactions.run('affiliate.transition', async (tx) => {
      const p = await lockAffiliate(tx, id);
      if (p.version !== input.expectedVersion) throw new ApiError('CONCURRENT_MODIFICATION');
      if (input.status === 'REJECTED' && p.status !== 'PENDING')
        throw new ApiError('INVALID_STATE_TRANSITION');
      const updated = await tx.affiliateProfile.update({
        where: { id },
        data: {
          status: input.status,
          reason: input.reason,
          payoutHold: input.payoutHold,
          version: { increment: 1 },
        },
      });
      await this.audit.write(tx, actor, {
        action: 'affiliate.status.changed',
        resourceType: 'AffiliateProfile',
        resourceId: id,
        changes: {
          before: { status: p.status, payoutHold: p.payoutHold },
          after: { status: input.status, payoutHold: input.payoutHold },
        },
        metadata: { reason: input.reason },
      });
      return projectProfile(updated);
    });
  }
  public async bank(input: AffiliateBankDto, actor: AuditActorContext) {
    this.runtime.assertEnabled();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.actorUserId } });
    if (
      !user.passwordHash ||
      !(await this.passwords.verify(user.passwordHash, input.currentPassword))
    )
      throw new ApiError('FORBIDDEN', 'Mật khẩu hiện tại không đúng.');
    const token = randomBytes(32).toString('base64url');
    const result = await this.transactions.run('affiliate.bank', async (tx) => {
      const p = await this.requireOwn(actor.actorUserId, tx);
      await lockAffiliate(tx, p.id);
      if (!['ACTIVE', 'SUSPENDED'].includes(p.status)) throw new ApiError('FORBIDDEN');
      const fingerprint = affiliateHash(
        JSON.stringify([
          input.bankName.toLowerCase(),
          input.accountNumber,
          input.accountHolder.toUpperCase(),
        ]),
      );
      const existing = await tx.affiliateBankAccount.findFirst({
        where: { affiliateId: p.id, accountFingerprint: fingerprint, disabledAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (existing?.emailConfirmedAt) return { bank: existing, send: false };
      const recent = await tx.affiliateBankAccount.findFirst({
        where: { affiliateId: p.id, confirmationSentAt: { gt: new Date(Date.now() - 60_000) } },
      });
      if (recent) {
        if (existing) return { bank: existing, send: false };
        throw new ApiError('VALIDATION_FAILED', 'Vui lòng chờ 60 giây trước khi gửi lại.');
      }
      const data = {
        confirmationHash: affiliateHash(token),
        confirmationExpiresAt: new Date(Date.now() + 30 * 60_000),
        confirmationSentAt: new Date(),
      };
      const bank = existing
        ? await tx.affiliateBankAccount.update({ where: { id: existing.id }, data })
        : await tx.affiliateBankAccount.create({
            data: {
              ...data,
              affiliateId: p.id,
              bankName: input.bankName,
              accountHolder: input.accountHolder,
              accountCiphertext: this.runtime.encrypt(input.accountNumber),
              accountFingerprint: fingerprint,
              lastFour: input.accountNumber.slice(-4),
            },
          });
      await this.audit.write(tx, actor, {
        action: 'affiliate.bank.requested',
        resourceType: 'AffiliateBankAccount',
        resourceId: bank.id,
      });
      return { bank, send: true };
    });
    const url = `${this.runtime.config.api.webPublicUrl}/affiliate#bank-token=${token}`;
    const emailStatus = result.send
      ? await this.mail.deliver({
          template: 'affiliate-bank-confirmation',
          resourceId: result.bank.id,
          message: {
            to: user.email,
            subject: 'rePhone: xác nhận tài khoản nhận hoa hồng',
            text: `Xác nhận trong 30 phút: ${url}`,
            html: `<p>Xác nhận tài khoản nhận hoa hồng trong 30 phút: <a href="${url}">Xác nhận</a>.</p>`,
          },
        })
      : 'EXISTING';
    return { bank: projectBank(result.bank), emailStatus };
  }
  public async confirmBank(token: string, actor: AuditActorContext) {
    return this.transactions.run('affiliate.bank.confirm', async (tx) => {
      const p = await this.requireOwn(actor.actorUserId, tx);
      await lockAffiliate(tx, p.id);
      const bank = await tx.affiliateBankAccount.findFirst({
        where: {
          affiliateId: p.id,
          confirmationHash: affiliateHash(token),
          confirmationExpiresAt: { gt: new Date() },
          disabledAt: null,
        },
      });
      if (!bank) throw new ApiError('ONE_TIME_TOKEN_INVALID');
      const result = await tx.affiliateBankAccount.update({
        where: { id: bank.id },
        data: { emailConfirmedAt: new Date(), confirmationHash: null, confirmationExpiresAt: null },
      });
      await this.audit.write(tx, actor, {
        action: 'affiliate.bank.confirmed',
        resourceType: 'AffiliateBankAccount',
        resourceId: bank.id,
      });
      return projectBank(result);
    });
  }
  public async verifyBank(id: string, actor: AuditActorContext) {
    this.runtime.assertEnabled();
    return this.transactions.run('affiliate.bank.verify', async (tx) => {
      const bank = await tx.affiliateBankAccount.findUnique({ where: { id } });
      if (!bank) throw new ApiError('RESOURCE_NOT_FOUND');
      await lockAffiliate(tx, bank.affiliateId);
      if (!bank.emailConfirmedAt || bank.disabledAt) throw new ApiError('INVALID_STATE_TRANSITION');
      if (bank.verifiedAt) return projectBank(bank);
      const previous = await tx.affiliateBankAccount.count({
        where: { affiliateId: bank.affiliateId, verifiedAt: { not: null } },
      });
      const result = await tx.affiliateBankAccount.update({
        where: { id },
        data: {
          verifiedAt: new Date(),
          effectiveAt: new Date(Date.now() + (previous ? 86400_000 : 0)),
        },
      });
      await this.audit.write(tx, actor, {
        action: 'affiliate.bank.verified',
        resourceType: 'AffiliateBankAccount',
        resourceId: id,
      });
      return projectBank(result);
    });
  }
  public async bankDetails(id: string, actor: AuditActorContext) {
    this.runtime.assertEnabled();
    return this.transactions.run('affiliate.bank.read', async (tx) => {
      const b = await tx.affiliateBankAccount.findUnique({ where: { id } });
      if (!b) throw new ApiError('RESOURCE_NOT_FOUND');
      await this.audit.write(tx, actor, {
        action: 'affiliate.bank.revealed',
        resourceType: 'AffiliateBankAccount',
        resourceId: id,
      });
      return { ...projectBank(b), accountNumber: this.runtime.decrypt(b.accountCiphertext) };
    });
  }
}
