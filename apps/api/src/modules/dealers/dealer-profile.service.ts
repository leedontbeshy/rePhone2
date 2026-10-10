import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { DealerBankAccount, DealerProfile, Prisma } from '../../generated/prisma/client.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import { PasswordService } from '../auth/password.service.js';
import { allowsDealerCapability } from '../dealer-core/dealer-access.policy.js';
import { DealerRuntime, dealerHash } from './dealer-runtime.service.js';
import type {
  DealerApplicationDto,
  DealerBankAccountDto,
  DealerCreateKeyDto,
  DealerTransitionDto,
  DealerRiskDto,
} from './dealer.dto.js';

@Injectable()
export class DealerProfileService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(DealerRuntime) private readonly runtime: DealerRuntime,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(NotificationDeliveryService)
    private readonly notifications: NotificationDeliveryService,
  ) {}

  public async own(userId: string) {
    this.runtime.assertEnabled();
    const dealer = await this.prisma.dealerProfile.findUnique({
      where: { ownerUserId: userId },
      include: {
        bankAccounts: { orderBy: { createdAt: 'desc' } },
        apiClients: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (dealer === null) return null;
    if (dealer.securityStatus === 'SECURITY_LOCKED') throw new ApiError('FORBIDDEN');
    return {
      ...projectDealerProfile(dealer),
      bankAccounts: dealer.bankAccounts.map(projectDealerBank),
      apiClients: dealer.apiClients.map((key) => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        scopes: key.scopes,
        environment: key.environment,
        expiresAt: key.expiresAt.toISOString(),
        revokedAt: key.revokedAt?.toISOString() ?? null,
      })),
    };
  }

  public async apply(input: DealerApplicationDto, actor: AuditActorContext) {
    this.runtime.assertEnabled();
    if (
      this.runtime.mode === 'LIVE' &&
      (input.businessType === 'INDIVIDUAL' || input.taxCode === undefined)
    )
      throw new ApiError(
        'VALIDATION_FAILED',
        'LIVE yêu cầu hộ kinh doanh hoặc doanh nghiệp có mã số thuế.',
      );
    const id = await this.transactions.run('dealer.apply', async (tx) => {
      const policy = await tx.dealerPricingPolicy.findUnique({ where: { key: 'GLOBAL' } });
      if (policy?.enabled !== true)
        throw new ApiError('SERVICE_UNAVAILABLE', 'Cổng đại lý đang tạm ngừng nhận hồ sơ mới.');
      await tx.$queryRaw`SELECT id FROM users WHERE id=${actor.actorUserId}::uuid FOR UPDATE`;
      const old = await tx.dealerProfile.findUnique({ where: { ownerUserId: actor.actorUserId } });
      if (old !== null && old.businessStatus !== 'REJECTED')
        throw new ApiError('DUPLICATE_RESOURCE');
      if (old?.securityStatus === 'SECURITY_LOCKED') throw new ApiError('FORBIDDEN');
      const data = {
        legalName: input.legalName,
        businessType: input.businessType,
        taxCode: input.taxCode ?? null,
        representativeName: input.representativeName,
        businessAddress: input.businessAddress,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        displayName: input.displayName,
        approvedDomains: [...new Set(input.approvedDomains.map((domain) => domain.toLowerCase()))],
        termsVersion: input.termsVersion,
        termsAcceptedAt: new Date(),
        businessStatus: 'PENDING' as const,
      };
      const profile =
        old === null
          ? await tx.dealerProfile.create({ data: { ...data, ownerUserId: actor.actorUserId } })
          : await tx.dealerProfile.update({
              where: { id: old.id },
              data: { ...data, version: { increment: 1 } },
            });
      await this.history(tx, profile, actor, 'APPLY', 'Đăng ký chương trình đại lý');
      return profile.id;
    });
    return this.get(id);
  }

  public async get(id: string) {
    const profile = await this.prisma.dealerProfile.findUnique({
      where: { id },
      include: {
        bankAccounts: { orderBy: { createdAt: 'desc' } },
        histories: { orderBy: { createdAt: 'desc' }, take: 30 },
      },
    });
    if (profile === null) throw new ApiError('RESOURCE_NOT_FOUND');
    const since = new Date(Date.now() - 30 * 86400_000);
    const [proofs, rejectedProofs, recentOrders, expiredOrders, held] = await Promise.all([
      this.prisma.dealerPaymentProof.count({
        where: { paymentRequest: { order: { dealerId: id } }, submittedAt: { gte: since } },
      }),
      this.prisma.dealerPaymentProof.count({
        where: {
          paymentRequest: { order: { dealerId: id } },
          status: 'REJECTED',
          submittedAt: { gte: since },
        },
      }),
      this.prisma.order.count({ where: { dealerId: id, createdAt: { gte: since } } }),
      this.prisma.order.count({
        where: {
          dealerId: id,
          createdAt: { gte: since },
          dealerPaymentRequests: { some: { status: 'EXPIRED' } },
        },
      }),
      this.prisma.order.findMany({
        where: { dealerId: id, status: 'PLACED' },
        select: { placedAt: true },
      }),
    ]);
    return {
      ...projectDealerProfile(profile),
      metrics: {
        periodDays: 30,
        proofs,
        rejectedProofs,
        recentOrders,
        expiredOrders,
        heldOrders: held.length,
        activeHoldMinutes: held.reduce(
          (sum, row) =>
            sum + Math.max(0, Math.floor((Date.now() - row.placedAt.getTime()) / 60000)),
          0,
        ),
      },
      bankAccounts: profile.bankAccounts.map(projectDealerBank),
      histories: profile.histories.map((row) => ({
        id: row.id,
        action: row.action,
        reason: row.reason,
        actorUserId: row.actorUserId,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  public async list(page: number, pageSize: number) {
    const [rows, total, statuses] = await Promise.all([
      this.prisma.dealerProfile.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.dealerProfile.count(),
      this.prisma.dealerProfile.groupBy({ by: ['businessStatus'], _count: { _all: true } }),
    ]);
    return {
      items: rows.map(projectDealerProfile),
      total,
      page,
      pageSize,
      summary: Object.fromEntries(
        statuses.map((status) => [status.businessStatus, status._count._all]),
      ),
    };
  }

  public async transition(id: string, input: DealerTransitionDto, actor: AuditActorContext) {
    await this.transactions.run('dealer.transition', async (tx) => {
      const profile = await lockDealer(tx, id);
      if (profile.version !== input.expectedVersion) throw new ApiError('CONCURRENT_MODIFICATION');
      const update: Prisma.DealerProfileUpdateInput = { version: { increment: 1 } };
      switch (input.action) {
        case 'APPROVE':
          if (
            profile.businessStatus !== 'PENDING' ||
            profile.termsVersion !== this.runtime.termsVersion
          )
            throw new ApiError('INVALID_STATE_TRANSITION');
          if (
            this.runtime.mode === 'LIVE' &&
            (profile.businessType === 'INDIVIDUAL' || profile.taxCode === null)
          )
            throw new ApiError('VALIDATION_FAILED');
          await currentDealerBank(tx, id);
          update.businessStatus = 'ACTIVE';
          update.approvedAt = new Date();
          update.approvedById = actor.actorUserId;
          break;
        case 'REJECT':
          if (profile.businessStatus !== 'PENDING') throw new ApiError('INVALID_STATE_TRANSITION');
          update.businessStatus = 'REJECTED';
          break;
        case 'SUSPEND':
          if (profile.businessStatus !== 'ACTIVE') throw new ApiError('INVALID_STATE_TRANSITION');
          update.businessStatus = 'BUSINESS_SUSPENDED';
          break;
        case 'RESUME':
          if (profile.businessStatus !== 'BUSINESS_SUSPENDED')
            throw new ApiError('INVALID_STATE_TRANSITION');
          update.businessStatus = 'ACTIVE';
          break;
        case 'CLOSE':
          if (!['ACTIVE', 'BUSINESS_SUSPENDED'].includes(profile.businessStatus))
            throw new ApiError('INVALID_STATE_TRANSITION');
          update.businessStatus = 'CLOSED';
          break;
        case 'LOCK':
          if (profile.securityStatus !== 'NORMAL') throw new ApiError('INVALID_STATE_TRANSITION');
          update.securityStatus = 'SECURITY_LOCKED';
          await tx.dealerApiClient.updateMany({
            where: { dealerId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          await tx.authSession.updateMany({
            where: { userId: profile.ownerUserId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          break;
        case 'UNLOCK':
          if (profile.securityStatus !== 'SECURITY_LOCKED')
            throw new ApiError('INVALID_STATE_TRANSITION');
          update.securityStatus = 'NORMAL';
          break;
        default:
          throw new ApiError('VALIDATION_FAILED');
      }
      const changed = await tx.dealerProfile.update({ where: { id }, data: update });
      await this.history(tx, changed, actor, input.action, input.reason);
    });
    return this.get(id);
  }

  public async reauthenticate(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, status: true },
    });
    if (
      user?.status !== 'ACTIVE' ||
      user.passwordHash === null ||
      !(await this.passwords.verify(user.passwordHash, password))
    )
      throw new ApiError('CURRENT_PASSWORD_INCORRECT');
  }

  public async bankDetails(id: string, actor: AuditActorContext) {
    return this.transactions.run('dealer.bank.view', async (tx) => {
      const bank = await tx.dealerBankAccount.findUnique({ where: { id } });
      if (bank === null) throw new ApiError('RESOURCE_NOT_FOUND');
      await this.audit.write(tx, actor, {
        action: 'dealer.bank.viewed',
        resourceType: 'DealerBankAccount',
        resourceId: id,
      });
      return {
        ...projectDealerBank(bank),
        accountNumber: this.runtime.decrypt(bank.accountNumberCiphertext),
      };
    });
  }

  public async risk(id: string, input: DealerRiskDto, actor: AuditActorContext) {
    await this.transactions.run('dealer.risk.update', async (tx) => {
      const profile = await lockDealer(tx, id);
      if (profile.version !== input.expectedVersion) throw new ApiError('CONCURRENT_MODIFICATION');
      const changed = await tx.dealerProfile.update({
        where: { id },
        data: {
          riskLevel: input.riskLevel,
          maximumUnfundedOrders: input.maximumUnfundedOrders,
          version: { increment: 1 },
        },
      });
      await this.history(tx, changed, actor, 'RISK_UPDATED', input.reason);
    });
    return this.get(id);
  }

  public async requestBank(input: DealerBankAccountDto, actor: AuditActorContext) {
    await this.reauthenticate(actor.actorUserId, input.currentPassword);
    const token = randomBytes(32).toString('base64url');
    const result = await this.transactions.run('dealer.bank.request', async (tx) => {
      const profile = await this.requireOwner(tx, actor.actorUserId);
      // Compare the complete account under the dealer lock; the masked suffix is not unique.
      const candidates = await tx.dealerBankAccount.findMany({
        where: {
          dealerId: profile.id,
          disabledAt: null,
          accountLastFour: input.accountNumber.slice(-4),
        },
        orderBy: { createdAt: 'desc' },
      });
      const existing = candidates.find(
        (bank) =>
          normalizeBankText(bank.bankName) === normalizeBankText(input.bankName) &&
          normalizeBankText(bank.accountHolder) === normalizeBankText(input.accountHolder) &&
          this.runtime.decrypt(bank.accountNumberCiphertext) === input.accountNumber,
      );
      if (existing) return { account: existing, created: false };
      const bank = await tx.dealerBankAccount.create({
        data: {
          dealerId: profile.id,
          bankName: input.bankName,
          accountNumberCiphertext: this.runtime.encrypt(input.accountNumber),
          accountLastFour: input.accountNumber.slice(-4),
          accountHolder: input.accountHolder,
          confirmationHash: dealerHash(token),
          confirmationExpiresAt: new Date(Date.now() + 30 * 60_000),
        },
      });
      await this.audit.write(tx, actor, {
        action: 'dealer.bank.requested',
        resourceType: 'DealerBankAccount',
        resourceId: bank.id,
        metadata: { dealerId: profile.id },
      });
      return { account: bank, created: true };
    });
    if (!result.created)
      return {
        ...projectDealerBank(result.account),
        emailDelivery: result.account.emailConfirmedAt ? 'NOT_REQUIRED' : 'EXISTING',
      };
    return this.sendBankConfirmation(result.account, token, actor.actorUserId);
  }

  public async resendBankConfirmation(id: string, password: string, actor: AuditActorContext) {
    await this.reauthenticate(actor.actorUserId, password);
    const token = randomBytes(32).toString('base64url');
    const account = await this.transactions.run('dealer.bank.resend', async (tx) => {
      const profile = await this.requireOwner(tx, actor.actorUserId);
      const bank = await tx.dealerBankAccount.findFirst({ where: { id, dealerId: profile.id } });
      if (!bank) throw new ApiError('RESOURCE_NOT_FOUND');
      if (bank.disabledAt || bank.emailConfirmedAt || bank.verifiedAt)
        throw new ApiError(
          'INVALID_STATE_TRANSITION',
          'Tài khoản đã xác nhận hoặc đã ngừng sử dụng.',
        );
      // Avoid simultaneous resends invalidating the link that is still being delivered.
      if (
        bank.confirmationExpiresAt &&
        bank.confirmationExpiresAt.getTime() > Date.now() + 29 * 60_000
      )
        throw new ApiError('RATE_LIMITED', 'Vui lòng đợi một phút trước khi gửi lại email.');
      const updated = await tx.dealerBankAccount.update({
        where: { id },
        data: {
          confirmationHash: dealerHash(token),
          confirmationExpiresAt: new Date(Date.now() + 30 * 60_000),
        },
      });
      await this.audit.write(tx, actor, {
        action: 'dealer.bank.confirmation_resent',
        resourceType: 'DealerBankAccount',
        resourceId: id,
      });
      return updated;
    });
    return this.sendBankConfirmation(account, token, actor.actorUserId);
  }

  private async sendBankConfirmation(account: DealerBankAccount, token: string, userId: string) {
    const owner = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });
    const link = `${this.runtime.config.api.webPublicUrl}/dealer#confirmBankToken=${token}`;
    const emailDelivery = await this.notifications.deliver({
      template: 'dealer.bank.confirmation',
      resourceId: account.id,
      message: {
        to: owner.email,
        subject: '[rePhone] Xác nhận tài khoản nhận hoàn của đại lý',
        text: `Xác nhận thay đổi trong 30 phút: ${link}`,
        html: `<p>Xác nhận thay đổi tài khoản nhận hoàn trong 30 phút: <a href="${link}">Xác nhận</a></p>`,
      },
    });
    return { ...projectDealerBank(account), emailDelivery };
  }

  public async confirmBank(token: string, actor: AuditActorContext) {
    const result = await this.transactions.run('dealer.bank.confirm', async (tx) => {
      const profile = await this.requireOwner(tx, actor.actorUserId);
      const bank = await tx.dealerBankAccount.findFirst({
        where: {
          dealerId: profile.id,
          confirmationHash: dealerHash(token),
          confirmationExpiresAt: { gt: new Date() },
          disabledAt: null,
        },
      });
      if (bank === null) throw new ApiError('ONE_TIME_TOKEN_INVALID');
      const updated = await tx.dealerBankAccount.update({
        where: { id: bank.id },
        data: { emailConfirmedAt: new Date(), confirmationHash: null, confirmationExpiresAt: null },
      });
      await this.audit.write(tx, actor, {
        action: 'dealer.bank.confirmed',
        resourceType: 'DealerBankAccount',
        resourceId: bank.id,
      });
      return updated;
    });
    return projectDealerBank(result);
  }

  public async verifyBank(id: string, actor: AuditActorContext) {
    const bank = await this.transactions.run('dealer.bank.verify', async (tx) => {
      let candidate = await tx.dealerBankAccount.findUnique({ where: { id } });
      if (candidate === null) throw new ApiError('RESOURCE_NOT_FOUND');
      await lockDealer(tx, candidate.dealerId);
      candidate = await tx.dealerBankAccount.findUnique({ where: { id } });
      if (candidate === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (
        candidate.emailConfirmedAt === null ||
        candidate.disabledAt !== null ||
        candidate.verifiedAt !== null
      )
        throw new ApiError('INVALID_STATE_TRANSITION');
      const previous = await tx.dealerBankAccount.count({
        where: { dealerId: candidate.dealerId, verifiedAt: { not: null } },
      });
      const updated = await tx.dealerBankAccount.update({
        where: { id },
        data: {
          verifiedAt: new Date(),
          verifiedById: actor.actorUserId,
          effectiveAt: new Date(Date.now() + (previous > 0 ? 24 * 60 * 60_000 : 0)),
        },
      });
      await this.audit.write(tx, actor, {
        action: 'dealer.bank.verified',
        resourceType: 'DealerBankAccount',
        resourceId: id,
      });
      return updated;
    });
    return projectDealerBank(bank);
  }

  public async disableBank(id: string, reason: string, actor: AuditActorContext) {
    await this.transactions.run('dealer.bank.disable', async (tx) => {
      const account = await tx.dealerBankAccount.findUnique({ where: { id } });
      if (account === null) throw new ApiError('RESOURCE_NOT_FOUND');
      await lockDealer(tx, account.dealerId);
      await tx.dealerBankAccount.update({ where: { id }, data: { disabledAt: new Date() } });
      await tx.refund.updateMany({
        where: { dealerBankAccountId: id, status: { in: ['REQUESTED', 'PROCESSING'] } },
        data: { payoutHold: true, payoutHoldReason: reason },
      });
      await this.audit.write(tx, actor, {
        action: 'dealer.bank.disabled',
        resourceType: 'DealerBankAccount',
        resourceId: id,
        metadata: { reason },
      });
    });
    return { id, disabled: true };
  }

  public async createKey(input: DealerCreateKeyDto, actor: AuditActorContext) {
    await this.reauthenticate(actor.actorUserId, input.currentPassword);
    const key = `rp_${this.runtime.mode.toLowerCase()}_${randomBytes(32).toString('base64url')}`;
    const saved = await this.transactions.run('dealer.key.create', async (tx) => {
      const profile = await this.requireOwner(tx, actor.actorUserId);
      if (!allowsDealerCapability(profile, 'ISSUE_API_KEY')) throw new ApiError('FORBIDDEN');
      if (
        (await tx.dealerApiClient.count({
          where: { dealerId: profile.id, revokedAt: null, expiresAt: { gt: new Date() } },
        })) >= 2
      )
        throw new ApiError('VALIDATION_FAILED', 'Mỗi đại lý có tối đa hai API key đang hoạt động.');
      const row = await tx.dealerApiClient.create({
        data: {
          dealerId: profile.id,
          name: input.name,
          keyHash: dealerHash(key),
          keyPrefix: key.slice(0, 16),
          environment: this.runtime.mode,
          scopes: [...new Set(input.scopes)],
          expiresAt: new Date(Date.now() + 90 * 86400_000),
        },
      });
      await this.audit.write(tx, actor, {
        action: 'dealer.key.created',
        resourceType: 'DealerApiClient',
        resourceId: row.id,
      });
      return row;
    });
    return {
      id: saved.id,
      key,
      keyPrefix: saved.keyPrefix,
      expiresAt: saved.expiresAt.toISOString(),
    };
  }

  public async revokeKey(id: string, actor: AuditActorContext) {
    await this.transactions.run('dealer.key.revoke', async (tx) => {
      const profile = await this.requireOwner(tx, actor.actorUserId);
      const key = await tx.dealerApiClient.findFirst({ where: { id, dealerId: profile.id } });
      if (key === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (key.revokedAt !== null) return;
      await tx.dealerApiClient.update({ where: { id }, data: { revokedAt: new Date() } });
      await this.audit.write(tx, actor, {
        action: 'dealer.key.revoked',
        resourceType: 'DealerApiClient',
        resourceId: id,
      });
    });
    return { id, revoked: true };
  }

  public async requireOwner(tx: Prisma.TransactionClient, userId: string) {
    this.runtime.assertEnabled();
    const profile = await tx.dealerProfile.findUnique({ where: { ownerUserId: userId } });
    if (profile === null) throw new ApiError('RESOURCE_NOT_FOUND');
    const locked = await lockDealer(tx, profile.id);
    if (locked.securityStatus === 'SECURITY_LOCKED') throw new ApiError('FORBIDDEN');
    return locked;
  }
  private async history(
    tx: Prisma.TransactionClient,
    profile: DealerProfile,
    actor: AuditActorContext,
    action: string,
    reason: string,
  ) {
    await tx.dealerApprovalHistory.create({
      data: {
        dealerId: profile.id,
        actorUserId: actor.actorUserId,
        action,
        reason,
        snapshot: {
          businessStatus: profile.businessStatus,
          securityStatus: profile.securityStatus,
          termsVersion: profile.termsVersion,
          version: profile.version,
        },
      },
    });
    await this.audit.write(tx, actor, {
      action: `dealer.${action.toLowerCase()}`,
      resourceType: 'DealerProfile',
      resourceId: profile.id,
      metadata: {
        reason,
        businessStatus: profile.businessStatus,
        securityStatus: profile.securityStatus,
      },
    });
  }
}

export async function lockDealer(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM dealer_profiles WHERE id=${id}::uuid FOR UPDATE`;
  const profile = await tx.dealerProfile.findUnique({ where: { id } });
  if (profile === null) throw new ApiError('RESOURCE_NOT_FOUND');
  return profile;
}
function normalizeBankText(value: string) {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('vi-VN');
}
export async function currentDealerBank(tx: Prisma.TransactionClient, dealerId: string) {
  const bank = await tx.dealerBankAccount.findFirst({
    where: {
      dealerId,
      disabledAt: null,
      verifiedAt: { not: null },
      effectiveAt: { lte: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (bank === null)
    throw new ApiError(
      'INVALID_STATE_TRANSITION',
      'Chưa có tài khoản nhận hoàn đã xác minh và có hiệu lực.',
    );
  return bank;
}
export function projectDealerBank(bank: DealerBankAccount) {
  return {
    id: bank.id,
    bankName: bank.bankName,
    accountLastFour: bank.accountLastFour,
    accountHolder: bank.accountHolder,
    emailConfirmedAt: bank.emailConfirmedAt?.toISOString() ?? null,
    verifiedAt: bank.verifiedAt?.toISOString() ?? null,
    effectiveAt: bank.effectiveAt?.toISOString() ?? null,
    disabledAt: bank.disabledAt?.toISOString() ?? null,
    createdAt: bank.createdAt.toISOString(),
  };
}
export function projectDealerProfile(profile: DealerProfile) {
  return {
    id: profile.id,
    legalName: profile.legalName,
    businessType: profile.businessType,
    taxCode: profile.taxCode,
    representativeName: profile.representativeName,
    businessAddress: profile.businessAddress,
    contactEmail: profile.contactEmail,
    contactPhone: profile.contactPhone,
    displayName: profile.displayName,
    logoUrl: profile.logoUrl,
    approvedDomains: profile.approvedDomains,
    businessStatus: profile.businessStatus,
    securityStatus: profile.securityStatus,
    termsVersion: profile.termsVersion,
    termsAcceptedAt: profile.termsAcceptedAt.toISOString(),
    riskLevel: profile.riskLevel,
    maximumUnfundedOrders: profile.maximumUnfundedOrders,
    version: profile.version,
    createdAt: profile.createdAt.toISOString(),
  };
}
