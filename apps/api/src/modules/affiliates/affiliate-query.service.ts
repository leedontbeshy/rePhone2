import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Response } from 'express';
import { PrismaService } from '../../database/prisma.service.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import { AffiliateLedgerService } from '../affiliate-core/affiliate-ledger.service.js';
import { AffiliateRuntime } from '../affiliate-core/affiliate-runtime.service.js';
import {
  AFFILIATE_COOKIE,
  AFFILIATE_WINDOW_MS,
  affiliateHash,
  commissionAmount,
  money,
} from '../affiliate-core/affiliate.policy.js';
import {
  AffiliateProfileService,
  projectBank,
  projectProfile,
} from './affiliate-profile.service.js';
import { projectPayout } from './affiliate-payout.service.js';
import type { AffiliateListDto } from './affiliate.dto.js';

@Injectable()
export class AffiliateQueryService {
  private cursor: string | undefined;
  private running = false;
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AffiliateRuntime) private readonly runtime: AffiliateRuntime,
    @Inject(AffiliateLedgerService) private readonly ledger: AffiliateLedgerService,
    @Inject(AffiliateProfileService) private readonly profiles: AffiliateProfileService,
  ) {}
  public async refer(code: string, response: Response) {
    if (!this.runtime.enabled) return { captured: false };
    const token = randomBytes(32).toString('base64url');
    const captured = await this.transactions.run('affiliate.referral', async (tx) => {
      const policy = await tx.affiliatePolicy.findUnique({ where: { key: 'GLOBAL' } });
      if (!policy?.enabled) return false;
      const affiliate = await tx.affiliateProfile.findUnique({
        where: { code },
        include: { owner: { select: { status: true } } },
      });
      if (affiliate?.status !== 'ACTIVE' || affiliate.owner.status !== 'ACTIVE') return false;
      await tx.affiliateReferral.create({
        data: {
          affiliateId: affiliate.id,
          tokenHash: affiliateHash(token),
          expiresAt: new Date(Date.now() + AFFILIATE_WINDOW_MS),
        },
      });
      return true;
    });
    if (captured)
      response.cookie(AFFILIATE_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: new URL(this.runtime.config.api.publicUrl).protocol === 'https:',
        path: '/api/v1',
        maxAge: AFFILIATE_WINDOW_MS,
      });
    return { captured };
  }
  public async dashboard(userId?: string, query: AffiliateListDto = { page: 1 }) {
    this.runtime.assertEnabled();
    const p = userId ? await this.profiles.requireOwn(userId) : null;
    const scope = p ? { attribution: { affiliateId: p.id } } : {};
    const [commissions, totals, payouts, clicks, reserved] = await Promise.all([
      this.prisma.affiliateCommission.findMany({
        where: scope,
        include: {
          orderItem: { select: { productNameSnapshot: true } },
          attribution: { select: { affiliateId: true, order: { select: { orderNumber: true } } } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * 25,
        take: 26,
      }),
      this.prisma.affiliateCommission.groupBy({
        by: ['status'],
        where: scope,
        _sum: { amount: true, paidAmount: true, absorbedLoss: true },
        _count: true,
      }),
      this.prisma.affiliatePayout.findMany({
        where: p ? { affiliateId: p.id } : {},
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * 25,
        take: 26,
      }),
      this.prisma.affiliateReferral.count({ where: p ? { affiliateId: p.id } : {} }),
      this.prisma.affiliatePayout.aggregate({
        where: {
          ...(p ? { affiliateId: p.id } : {}),
          status: { in: ['REQUESTED', 'PROCESSING', 'NEEDS_REVIEW'] },
        },
        _sum: { amount: true },
      }),
    ]);
    return {
      clicks,
      reservedAmount: reserved._sum.amount?.toString() ?? '0',
      totals: totals.map((t) => ({
        status: t.status,
        amount: t._sum.amount?.toString() ?? '0',
        paidAmount: t._sum.paidAmount?.toString() ?? '0',
        ...(p ? {} : { absorbedLoss: t._sum.absorbedLoss?.toString() ?? '0' }),
        count: t._count,
      })),
      commissions: commissions.slice(0, 25).map((c) => ({
        id: c.id,
        orderNumber: c.attribution.order.orderNumber,
        productName: c.orderItem.productNameSnapshot,
        amount: c.amount.toString(),
        paidAmount: c.paidAmount.toString(),
        status: c.status,
        holdReason: c.holdReason,
        createdAt: c.createdAt,
        availableAt: c.availableAt,
        ...(p
          ? {}
          : { affiliateId: c.attribution.affiliateId, absorbedLoss: c.absorbedLoss.toString() }),
      })),
      payouts: payouts.slice(0, 25).map(projectPayout),
      page: query.page,
      hasMore: commissions.length > 25 || payouts.length > 25,
    };
  }
  public async members(query: AffiliateListDto) {
    this.runtime.assertEnabled();
    const items = await this.prisma.affiliateProfile.findMany({
      where: query.search
        ? {
            OR: [
              { displayName: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search } },
            ],
          }
        : {},
      include: { banks: { orderBy: { createdAt: 'desc' }, take: 10 } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * 25,
      take: 26,
    });
    return {
      items: items
        .slice(0, 25)
        .map((p) => ({ ...projectProfile(p), banks: p.banks.map(projectBank) })),
      page: query.page,
      hasMore: items.length > 25,
    };
  }
  public async offers(query: AffiliateListDto, userId?: string) {
    this.runtime.assertEnabled();
    const p = userId ? await this.profiles.requireOwn(userId) : null;
    const policy = await this.prisma.affiliatePolicy.findUnique({ where: { key: 'GLOBAL' } });
    if (p && (!policy?.enabled || p.status !== 'ACTIVE'))
      return { items: [], page: query.page, hasMore: false };
    const units = await this.prisma.inventoryUnit.findMany({
      where: {
        lifecycleStatus: 'AVAILABLE',
        salePrice: { not: null },
        variant: {
          status: 'ACTIVE',
          product: {
            status: 'ACTIVE',
            type: 'IPHONE',
            ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
          },
        },
        reservations: { none: { status: 'ACTIVE' } },
      },
      include: { variant: { include: { product: true } }, affiliateOverride: true },
      orderBy: { id: 'asc' },
      take: 26,
      skip: (query.page - 1) * 25,
    });
    return {
      items: units.slice(0, 25).map((u) => {
        const rate = u.affiliateOverride?.rateBps ?? policy?.rateBps ?? 0;
        const ready =
          u.acquisitionCost !== null &&
          policy?.reserveAmount != null &&
          policy.minimumProfit !== null &&
          u.affiliateOverride?.enabled !== false;
        const estimated = ready
          ? commissionAmount(
              money(u.salePrice ?? 0),
              money(u.acquisitionCost ?? 0) +
                money(u.additionalCost) +
                money(policy.reserveAmount ?? 0) +
                money(policy.minimumProfit ?? 0),
              rate,
            )
          : 0n;
        const destination = `/products/${u.variant.product.slug}/units/${u.inventoryCode}`;
        return {
          id: u.id,
          inventoryCode: u.inventoryCode,
          productName: u.variant.product.name,
          variantName: u.variant.displayName,
          price: (u.salePrice ?? 0).toString(),
          estimatedCommission: estimated.toString(),
          rateBps: rate,
          destination,
          sharePath: p ? `/r/${p.code}?to=${encodeURIComponent(destination)}` : null,
          ...(p
            ? {}
            : {
                enabled: u.affiliateOverride?.enabled ?? true,
                overrideRateBps: u.affiliateOverride?.rateBps ?? null,
                eligible: ready,
              }),
        };
      }),
      page: query.page,
      hasMore: units.length > 25,
    };
  }
  @Cron(CronExpression.EVERY_MINUTE, { name: 'affiliateMaturity', timeZone: 'UTC' })
  public async tick(): Promise<void> {
    if (!this.runtime.enabled || !this.runtime.config.scheduler.enabled || this.running) return;
    this.running = true;
    try {
      await this.reconcileBatch();
    } finally {
      this.running = false;
    }
  }
  public async reconcileBatch() {
    this.runtime.assertEnabled();
    const rows = await this.prisma.affiliateAttribution.findMany({
      where: this.cursor ? { orderId: { gt: this.cursor } } : {},
      orderBy: { orderId: 'asc' },
      take: 100,
    });
    for (const row of rows)
      await this.transactions.run('affiliate.reconcile', async (tx) => {
        await this.ledger.lockOrders(tx, [row.orderId]);
        await this.ledger.reconcile(tx, row.orderId);
      });
    this.cursor = rows.length === 100 ? rows.at(-1)?.orderId : undefined;
    await this.prisma.affiliateReferral.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - AFFILIATE_WINDOW_MS) } },
    });
    return { processed: rows.length, hasMore: this.cursor !== undefined };
  }
}
