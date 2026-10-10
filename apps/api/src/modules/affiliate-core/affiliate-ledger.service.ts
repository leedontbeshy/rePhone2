import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApiError } from '../../common/errors/api-error.js';
import { AffiliateRuntime } from './affiliate-runtime.service.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import {
  AFFILIATE_COOKIE,
  AFFILIATE_HOLD_MS,
  affiliateHash,
  commissionAmount,
  money,
  normalizePhone,
  readAllocations,
  type RefundAllocation,
} from './affiliate.policy.js';

@Injectable()
export class AffiliateLedgerService {
  public constructor(
    @Inject(AffiliateRuntime) private readonly runtime: AffiliateRuntime,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
  ) {}

  public async capture(
    tx: Prisma.TransactionClient,
    orderId: string,
    request: Request,
  ): Promise<void> {
    if (!this.runtime.enabled) return;
    const cookie = request.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${AFFILIATE_COOKIE}=`))
      ?.slice(AFFILIATE_COOKIE.length + 1);
    if (!cookie || !/^[\w-]{43}$/.test(cookie)) return;
    const referral = await tx.affiliateReferral.findUnique({
      where: { tokenHash: affiliateHash(cookie) },
      include: { affiliate: { include: { owner: true } } },
    });
    if (
      !referral ||
      referral.expiresAt <= new Date() ||
      referral.affiliate.status !== 'ACTIVE' ||
      referral.affiliate.owner.status !== 'ACTIVE'
    )
      return;
    const policy = await tx.affiliatePolicy.findUnique({ where: { key: 'GLOBAL' } });
    if (
      !policy?.enabled ||
      policy.rateBps === null ||
      policy.minimumProfit === null ||
      policy.reserveAmount === null
    )
      return;
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: { include: { inventoryUnit: { include: { affiliateOverride: true } } } } },
    });
    if (
      order.channel !== 'STOREFRONT' ||
      order.customerId === referral.affiliate.ownerUserId ||
      order.customerEmail.trim().toLowerCase() ===
        referral.affiliate.owner.email.trim().toLowerCase() ||
      normalizePhone(order.customerPhone) === normalizePhone(referral.affiliate.phone) ||
      (referral.affiliate.owner.phone &&
        normalizePhone(order.customerPhone) === normalizePhone(referral.affiliate.owner.phone))
    )
      return;
    const lines = order.items.flatMap((item) => {
      const unit = item.inventoryUnit;
      if (
        item.productTypeSnapshot !== 'IPHONE' ||
        !unit ||
        unit.acquisitionCost === null ||
        unit.affiliateOverride?.enabled === false
      )
        return [];
      const rateBps = unit.affiliateOverride?.rateBps ?? policy.rateBps ?? 0;
      const base = money(item.lineTotal);
      const floor =
        money(unit.acquisitionCost) +
        money(unit.additionalCost) +
        money(policy.reserveAmount ?? 0) +
        money(policy.minimumProfit ?? 0);
      const amount = commissionAmount(base, floor, rateBps);
      return amount === 0n
        ? []
        : [
            {
              orderId,
              orderItemId: item.id,
              rateBps,
              baseAmount: base.toString(),
              floorAmount: floor.toString(),
              originalAmount: amount.toString(),
              amount: amount.toString(),
            },
          ];
    });
    if (!lines.length) return;
    await tx.affiliateAttribution.create({
      data: {
        orderId,
        affiliateId: referral.affiliateId,
        referredAt: referral.createdAt,
        policyVersion: policy.version,
      },
    });
    await tx.affiliateCommission.createMany({ data: lines });
  }

  // All callers lock orders before affiliate/payout rows. Refunds use the same order lock.
  public async lockOrders(tx: Prisma.TransactionClient, ids: string[]): Promise<void> {
    for (const id of [...new Set(ids)].sort())
      await tx.$queryRaw`SELECT id FROM orders WHERE id=${id}::uuid FOR UPDATE`;
  }

  public async cancellationAllocations(
    tx: Prisma.TransactionClient,
    orderId: string,
    amount: bigint,
  ): Promise<RefundAllocation[] | undefined> {
    if (
      !this.runtime.enabled ||
      !(await tx.affiliateAttribution.findUnique({ where: { orderId } }))
    )
      return undefined;
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        items: { orderBy: { id: 'asc' } },
        refunds: { where: { status: { in: ['REQUESTED', 'PROCESSING', 'COMPLETED'] } } },
      },
    });
    // A late verified payment may precede the order's paidAmount projection.
    const verified = await tx.payment.aggregate({
      where: { orderId, status: 'VERIFIED' },
      _sum: { receivedAmount: true },
    });
    const received = money(verified._sum.receivedAmount ?? 0);
    const caps: Array<{ kind: RefundAllocation['kind']; orderItemId?: string; cap: bigint }> = [
      {
        kind: 'OVERPAYMENT',
        cap: received > money(order.grandTotal) ? received - money(order.grandTotal) : 0n,
      },
      ...order.items.map((i) => ({
        kind: 'ITEM' as const,
        orderItemId: i.id,
        cap: money(i.lineTotal),
      })),
      { kind: 'SHIPPING', cap: money(order.shippingFee) },
    ];
    const allocations: RefundAllocation[] = [];
    let remaining = amount;
    for (const line of caps) {
      const covered = order.refunds
        .flatMap((r) => readAllocations(r.affiliateAllocations))
        .filter((a) => a.kind === line.kind && a.orderItemId === line.orderItemId)
        .reduce((sum, a) => sum + BigInt(a.amount), 0n);
      const available = line.cap - covered;
      const take = available > remaining ? remaining : available;
      if (take > 0n) {
        allocations.push({
          kind: line.kind,
          ...(line.orderItemId ? { orderItemId: line.orderItemId } : {}),
          amount: take.toString(),
        });
        remaining -= take;
      }
    }
    if (remaining !== 0n)
      throw new ApiError('INVALID_STATE_TRANSITION', 'Cần đối soát phân bổ khoản hoàn của đơn.');
    return allocations;
  }

  public async validateRefund(
    tx: Prisma.TransactionClient,
    orderId: string,
    amount: string,
    allocations?: RefundAllocation[],
  ): Promise<void> {
    if (
      !this.runtime.enabled ||
      !(await tx.affiliateAttribution.findUnique({ where: { orderId } }))
    )
      return;
    if (!allocations?.length)
      throw new ApiError(
        'VALIDATION_FAILED',
        'Đơn có hoa hồng: hãy phân bổ tiền hoàn cho từng sản phẩm, phí giao hoặc tiền chuyển thừa.',
      );
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        items: true,
        refunds: { where: { status: { in: ['REQUESTED', 'PROCESSING', 'COMPLETED'] } } },
      },
    });
    const capacity = new Map<string, bigint>(order.items.map((i) => [i.id, money(i.lineTotal)]));
    capacity.set('SHIPPING', money(order.shippingFee));
    capacity.set(
      'OVERPAYMENT',
      money(order.paidAmount) > money(order.grandTotal)
        ? money(order.paidAmount) - money(order.grandTotal)
        : 0n,
    );
    const previous = order.refunds.flatMap((r) => readAllocations(r.affiliateAllocations));
    if (order.refunds.some((r) => r.affiliateAllocations === null))
      throw new ApiError(
        'INVALID_STATE_TRANSITION',
        'Khoản hoàn trước chưa được phân bổ; cần đối soát trước khi tạo khoản mới.',
      );
    if (allocations.reduce((sum, a) => sum + BigInt(a.amount), 0n) !== BigInt(amount))
      throw new ApiError('VALIDATION_FAILED', 'Tổng phân bổ phải bằng số tiền hoàn.');
    for (const a of [...previous, ...allocations]) {
      if ((a.kind === 'ITEM') !== Boolean(a.orderItemId))
        throw new ApiError('VALIDATION_FAILED', 'Phân bổ sản phẩm cần mã dòng hàng.');
      const key = a.kind === 'ITEM' ? (a.orderItemId ?? '') : a.kind;
      const left = capacity.get(key);
      if (left === undefined || BigInt(a.amount) <= 0n || left < BigInt(a.amount))
        throw new ApiError(
          'VALIDATION_FAILED',
          'Phân bổ vượt số tiền còn được hoàn của dòng hàng.',
        );
      capacity.set(key, left - BigInt(a.amount));
    }
  }

  public async reconcile(
    tx: Prisma.TransactionClient,
    orderId: string,
    now = new Date(),
  ): Promise<void> {
    const attribution = await tx.affiliateAttribution.findUnique({
      where: { orderId },
      include: {
        commissions: {
          include: { payoutItems: { where: { active: true }, include: { payout: true } } },
        },
        order: {
          include: {
            payments: { where: { status: 'VERIFIED' }, orderBy: { reviewedAt: 'asc' } },
            refunds: true,
            items: { include: { afterSalesRequests: true } },
          },
        },
      },
    });
    if (!attribution) return;
    const order = attribution.order;
    let funded = 0n;
    let fullyPaidAt: Date | null = money(order.grandTotal) === 0n ? order.placedAt : null;
    for (const p of order.payments) {
      funded += p.receivedAmount === null ? 0n : money(p.receivedAmount);
      if (fullyPaidAt === null && funded >= money(order.grandTotal)) fullyPaidAt = p.reviewedAt;
    }
    const pendingRefund = order.refunds.some((r) => ['REQUESTED', 'PROCESSING'].includes(r.status));
    const unknownAllocation = order.refunds.some(
      (r) =>
        ['REQUESTED', 'PROCESSING', 'COMPLETED'].includes(r.status) &&
        r.affiliateAllocations === null,
    );
    const afterSales = order.items.some((i) =>
      i.afterSalesRequests.some((a) => !['RESOLVED', 'REJECTED', 'CANCELLED'].includes(a.status)),
    );
    const availableAt =
      order.completedAt && fullyPaidAt
        ? new Date(Math.max(order.completedAt.getTime(), fullyPaidAt.getTime()) + AFFILIATE_HOLD_MS)
        : null;
    for (const c of attribution.commissions) {
      const refunded = order.refunds
        .filter((r) => r.status === 'COMPLETED')
        .flatMap((r) => readAllocations(r.affiliateAllocations))
        .filter((a) => a.kind === 'ITEM' && a.orderItemId === c.orderItemId)
        .reduce((sum, a) => sum + BigInt(a.amount), 0n);
      const target =
        order.status === 'CANCELLED'
          ? 0n
          : commissionAmount(money(c.baseAmount) - refunded, money(c.floorAmount), c.rateBps);
      const paid = money(c.paidAmount);
      const holdReason = unknownAllocation
        ? 'REFUND_RECONCILIATION'
        : pendingRefund
          ? 'REFUND_PENDING'
          : afterSales
            ? 'AFTER_SALES'
            : null;
      const reservation = c.payoutItems[0];
      const invalidatesPayout =
        target !== money(c.amount) ||
        holdReason !== null ||
        order.status !== 'COMPLETED' ||
        !availableAt ||
        availableAt > now;
      if (
        reservation &&
        !['PAID', 'NEEDS_REVIEW'].includes(reservation.payout.status) &&
        invalidatesPayout
      ) {
        await tx.affiliatePayout.update({
          where: { id: reservation.payoutId },
          data: { status: 'NEEDS_REVIEW', note: 'Đơn nguồn thay đổi; cần đối soát khoản chi.' },
        });
        await this.audit.write(
          tx,
          { actorType: 'SYSTEM', requestId: 'affiliate.reconcile', ipAddress: 'internal' },
          {
            action: 'affiliate.payout.source_changed',
            resourceType: 'AffiliatePayout',
            resourceId: reservation.payoutId,
            changes: {
              before: { status: reservation.payout.status },
              after: { status: 'NEEDS_REVIEW' },
            },
            metadata: { orderId, holdReason },
          },
        );
      }
      const status =
        paid > 0n
          ? 'PAID'
          : reservation
            ? 'RESERVED'
            : target === 0n
              ? 'VOID'
              : holdReason
                ? 'HELD'
                : order.status === 'COMPLETED' && availableAt && availableAt <= now
                  ? 'AVAILABLE'
                  : 'PENDING';
      if (target !== money(c.amount))
        await tx.affiliateAdjustment.create({
          data: {
            commissionId: c.id,
            sourceKey: `${c.id}:${c.updatedAt.toISOString()}:${target.toString()}`,
            amount: (target - money(c.amount)).toString(),
            reason: 'ORDER_RECONCILIATION',
          },
        });
      await tx.affiliateCommission.update({
        where: { id: c.id },
        data: {
          amount: target.toString(),
          absorbedLoss: (paid > target ? paid - target : 0n).toString(),
          status,
          holdReason,
          availableAt,
        },
      });
    }
  }
}
