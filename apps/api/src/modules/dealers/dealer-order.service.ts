import { dealerNow } from './dealer-clock.js';
import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditWriteActorContext } from '../audit/audit.types.js';
import {
  allowsDealerCapability,
  type DealerCapability,
} from '../dealer-core/dealer-access.policy.js';
import { CheckoutInventoryGateway } from '../inventory/checkout-inventory.gateway.js';
import { generateOrderNumber, orderTransferContent } from '../orders/checkout-pricing.js';
import { DealerCatalogService } from './dealer-catalog.service.js';
import type { DealerContext } from './dealer-context.js';
import type { DealerCreateOrderDto, DealerPageQuery } from './dealer.dto.js';
import { currentDealerBank, lockDealer } from './dealer-profile.service.js';
import { canonicalDealerJson, dealerHash, DealerRuntime } from './dealer-runtime.service.js';
import { allocationLedgerInclude, projectAllocation } from './dealer-ledger.reader.js';
import { projectDealerOrderFunding } from '../dealer-core/dealer-finance.policy.js';

export const dealerOrderInclude = {
  dealerDetail: true,
  items: true,
  dealerAllocations: {
    include: {
      ...allocationLedgerInclude,
      bankTransaction: { select: { reconciliationHold: true } },
    },
  },
  shipments: { orderBy: { createdAt: 'desc' as const } },
  dealerPaymentRequests: {
    orderBy: { createdAt: 'asc' as const },
    include: { proofs: { orderBy: { submittedAt: 'desc' as const } } },
  },
  refunds: { where: { dealerId: { not: null } }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude;
export type DealerOrderRecord = Prisma.OrderGetPayload<{ include: typeof dealerOrderInclude }>;

@Injectable()
export class DealerOrderService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(DealerRuntime) private readonly runtime: DealerRuntime,
    @Inject(DealerCatalogService) private readonly catalog: DealerCatalogService,
    @Inject(CheckoutInventoryGateway) private readonly inventory: CheckoutInventoryGateway,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
  ) {}

  public async list(dealerId: string | undefined, query: DealerPageQuery, includePayments = true) {
    const where: Prisma.OrderWhereInput = {
      channel: 'DEALER',
      ...(dealerId === undefined ? {} : { dealerId }),
      ...(query.q
        ? {
            OR: [
              { orderNumber: { contains: query.q, mode: 'insensitive' } },
              { externalOrderId: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: dealerOrderInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      items: items.map((item) => projectDealerOrder(item, includePayments)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  public async get(id: string, dealerId?: string, includePayments = true) {
    const order = await this.prisma.order.findFirst({
      where: { id, channel: 'DEALER', ...(dealerId === undefined ? {} : { dealerId }) },
      include: dealerOrderInclude,
    });
    if (order === null) throw new ApiError('ORDER_NOT_FOUND');
    return projectDealerOrder(order, includePayments);
  }

  public async create(
    context: DealerContext,
    input: DealerCreateOrderDto,
    idempotencyKey: string | undefined,
    actor: AuditWriteActorContext,
  ) {
    this.runtime.assertEnabled();
    if (idempotencyKey === undefined || !/^[\x21-\x7e]{16,128}$/.test(idempotencyKey))
      throw new ApiError('VALIDATION_FAILED', 'Cần Idempotency-Key từ 16 đến 128 ký tự.');
    const keyHash = dealerHash(idempotencyKey);
    const payloadHash = dealerHash(canonicalDealerJson(input));
    const result = await this.transactions.run('dealer.order.create', async (tx) => {
      const dealer = await assertDealerContext(tx, context, 'CREATE_ORDER');
      const prior = await tx.dealerIdempotencyRecord.findUnique({
        where: {
          dealerId_operation_keyHash: { dealerId: dealer.id, operation: 'CREATE_ORDER', keyHash },
        },
      });
      if (prior !== null) {
        if (prior.payloadHash !== payloadHash)
          throw new ApiError(
            'CONCURRENT_MODIFICATION',
            'Idempotency-Key đã được dùng với nội dung khác.',
          );
        return { id: prior.resourceId, replayed: true };
      }
      const external = await tx.order.findUnique({
        where: {
          dealerId_externalOrderId: { dealerId: dealer.id, externalOrderId: input.externalOrderId },
        },
        include: { dealerDetail: true },
      });
      if (external !== null) {
        if (external.dealerDetail?.requestFingerprint !== payloadHash)
          throw new ApiError('CONCURRENT_MODIFICATION', 'Mã đơn của đại lý đã được sử dụng.');
        await tx.dealerIdempotencyRecord.create({
          data: {
            dealerId: dealer.id,
            operation: 'CREATE_ORDER',
            keyHash,
            payloadHash,
            resourceId: external.id,
          },
        });
        return { id: external.id, replayed: true };
      }
      const unfunded = await tx.order.count({
        where: {
          dealerId: dealer.id,
          status: { in: ['PLACED', 'CONFIRMED', 'PROCESSING'] },
          balanceDue: { gt: 0 },
        },
      });
      if (unfunded >= dealer.maximumUnfundedOrders)
        throw new ApiError('RATE_LIMITED', 'Đã đạt giới hạn đơn đang giữ máy chưa thanh toán đủ.');
      const bank = await currentDealerBank(tx, dealer.id);
      if (
        input.linkedOriginalOrderId !== undefined &&
        (await tx.order.count({
          where: { id: input.linkedOriginalOrderId, dealerId: dealer.id, channel: 'DEALER' },
        })) !== 1
      )
        throw new ApiError('ORDER_NOT_FOUND');
      const calculation = await this.catalog.calculate(dealer.id, input, tx);
      if (input.previewFingerprint !== calculation.preview.previewFingerprint)
        throw new ApiError(
          'CHECKOUT_REVIEW_REQUIRED',
          'Giá hoặc chính sách đã đổi. Vui lòng xem lại báo giá.',
        );
      const { line, warranty, policy, preview, settings } = calculation;
      const now = await dealerNow(tx);
      const dueAt = new Date(now.getTime() + policy.submissionMinutes * 60_000);
      const orderNumber = generateOrderNumber(now, settings.timezone);
      const order = await tx.order.create({
        data: {
          channel: 'DEALER',
          dealerId: dealer.id,
          externalOrderId: input.externalOrderId,
          orderNumber,
          customerName: input.contact.fullName,
          customerEmail: input.contact.email,
          customerPhone: input.contact.phone,
          fulfillmentType: 'SHIPPING',
          fulfillmentLocationId: calculation.allocation.location.id,
          shippingAddressSnapshot: input.shippingAddress as unknown as Prisma.InputJsonObject,
          subtotal: preview.dealerPrice,
          shippingFeeOriginal: preview.shippingFee,
          shippingFee: preview.shippingFee,
          grandTotal: preview.grandTotal,
          depositRequired: preview.grandTotal,
          balanceDue: preview.grandTotal,
          customerNote: input.note ?? null,
          dealerDetail: {
            create: {
              previewFingerprint: preview.previewFingerprint,
              requestFingerprint: payloadHash,
              publicPriceSnapshot: preview.publicReferencePrice,
              pricingPolicyVersion: policy.version,
              commercialSnapshot: {
                commercialModel: 'DEALER_RESALE',
                sellerOfRecord: 'DEALER',
                supplierOfRecord: 'REPHONE',
                fulfillmentOperator: 'REPHONE',
                warrantyOperator: 'REPHONE',
                customerPaymentCollector: 'DEALER',
                refundRecipient: 'DEALER',
                termsVersion: dealer.termsVersion,
                refundBankAccountId: bank.id,
                supportPhone: settings.storePhone,
              },
              brandSnapshot: {
                legalName: dealer.legalName,
                displayName: dealer.displayName,
                contactEmail: dealer.contactEmail,
                contactPhone: dealer.contactPhone,
                logoUrl: dealer.logoUrl,
              },
              shippingSnapshot: {
                fee: preview.shippingFee,
                province: input.shippingAddress.province,
                policyVersion: policy.version,
                quoteId: input.shippingQuoteId ?? null,
              },
              submissionDeadlineAt: dueAt,
              balanceMinutes: policy.balanceMinutes,
              reviewWarningMinutes: policy.reviewWarningMinutes,
              linkedOriginalOrderId: input.linkedOriginalOrderId ?? null,
            },
          },
          dealerPaymentRequests: {
            create: {
              purpose: 'FULL_PAYMENT',
              requiredAmount: preview.grandTotal,
              dueAt,
              transferContent: orderTransferContent(orderNumber),
              bankSnapshot: {
                bankName: settings.bankName,
                bankAccountNumber: settings.bankAccountNumber,
                bankAccountHolder: settings.bankAccountHolder,
              },
            },
          },
        },
      });
      const item = await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: line.productId,
          variantId: line.variantId,
          inventoryUnitId: line.inventoryUnitId,
          productTypeSnapshot: 'IPHONE',
          productNameSnapshot: line.productName,
          variantNameSnapshot: line.variantName,
          skuSnapshot: line.sku,
          inventoryCodeSnapshot: line.inventoryCode,
          configurationSnapshot: line.configurationSnapshot,
          quantity: 1,
          unitPrice: preview.dealerPrice,
          lineSubtotal: preview.dealerPrice,
          lineTotal: preview.dealerPrice,
          warrantyDaysSnapshot: warranty.days,
          warrantyTermsSnapshot: warranty.terms,
        },
      });
      await this.inventory.reserve(
        {
          orderId: order.id,
          orderItemIds: new Map([[line.cartItemId, item.id]]),
          allocation: calculation.allocation,
          holdReason: 'DEALER_PAYMENT',
          expiresAt: dueAt,
        },
        tx,
      );
      await tx.dealerIdempotencyRecord.create({
        data: {
          dealerId: dealer.id,
          operation: 'CREATE_ORDER',
          keyHash,
          payloadHash,
          resourceId: order.id,
        },
      });
      await this.audit.write(tx, actor, {
        action: 'dealer.order.created',
        resourceType: 'Order',
        resourceId: order.id,
        metadata: { dealerId: dealer.id, externalOrderId: input.externalOrderId },
      });
      return { id: order.id, replayed: false };
    });
    return {
      order: await this.get(
        result.id,
        context.dealerId,
        context.scopes === undefined || context.scopes.includes('payments:read'),
      ),
      replayed: result.replayed,
    };
  }
}

export async function assertDealerContext(
  tx: Prisma.TransactionClient,
  context: DealerContext,
  capability: DealerCapability,
) {
  const profile = await lockDealer(tx, context.dealerId);
  if (!allowsDealerCapability(profile, capability)) throw new ApiError('FORBIDDEN');
  if (capability === 'CREATE_ORDER' && profile.riskLevel === 'BLOCKED')
    throw new ApiError('FORBIDDEN', 'Đại lý đang chờ kiểm tra giới hạn giữ máy.');
  const user = await tx.user.findUnique({
    where: { id: profile.ownerUserId },
    select: { status: true },
  });
  if (user?.status !== 'ACTIVE') throw new ApiError('FORBIDDEN');
  if (context.apiClientId !== undefined) {
    const key = await tx.dealerApiClient.findFirst({
      where: {
        id: context.apiClientId,
        dealerId: profile.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (key === null) throw new ApiError('FORBIDDEN');
  } else if (context.userId !== profile.ownerUserId) throw new ApiError('FORBIDDEN');
  return profile;
}

export async function lockDealerOrder(tx: Prisma.TransactionClient, id: string, dealerId?: string) {
  await tx.$queryRaw`SELECT id FROM orders WHERE id=${id}::uuid FOR UPDATE`;
  const order = await tx.order.findFirst({
    where: { id, channel: 'DEALER', ...(dealerId === undefined ? {} : { dealerId }) },
    include: { dealerDetail: true },
  });
  if (order === null || order.dealerId === null || order.dealerDetail === null)
    throw new ApiError('ORDER_NOT_FOUND');
  return { ...order, dealerId: order.dealerId, dealerDetail: order.dealerDetail };
}

/** Explicit partner allowlist: never serialize Prisma relations or internal snapshots wholesale. */
export function projectDealerOrder(order: DealerOrderRecord, includePayments = true) {
  const funding = projectDealerOrderFunding(
    BigInt(order.grandTotal.toString()),
    order.dealerAllocations.map(projectAllocation),
  );
  const reconciliationHold =
    order.dealerDetail?.reconciliationHold === true ||
    order.dealerAllocations.some((row) => row.bankTransaction.reconciliationHold);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    externalOrderId: order.externalOrderId,
    dealerId: order.dealerId,
    resourceVersion: order.dealerResourceVersion,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    dealerPrice: order.subtotal.toString(),
    shippingFee: order.shippingFee.toString(),
    grandTotal: order.grandTotal.toString(),
    paidAmount: order.paidAmount.toString(),
    refundedAmount: order.refundedAmount.toString(),
    balanceDue: order.balanceDue.toString(),
    reconciliationHold,
    fundedAmount: funding.fundedAmount.toString(),
    refundObligationAmount: funding.refundObligationAmount.toString(),
    fundingShortfall: funding.fundingShortfall.toString(),
    fullyFunded: funding.fullyFunded && !reconciliationHold,
    returnSettlement: order.dealerDetail?.returnSettlement ?? null,
    recipient: order.shippingAddressSnapshot,
    customer: { name: order.customerName, email: order.customerEmail, phone: order.customerPhone },
    items: order.items.map((item) => ({
      id: item.id,
      inventoryUnitId: item.inventoryUnitId,
      inventoryCode: item.inventoryCodeSnapshot,
      productName: item.productNameSnapshot,
      variantName: item.variantNameSnapshot,
      configuration: item.configurationSnapshot,
      warrantyDays: item.warrantyDaysSnapshot,
      warrantyTerms: item.warrantyTermsSnapshot,
    })),
    paymentRequests: (includePayments ? order.dealerPaymentRequests : []).map((request) => ({
      id: request.id,
      purpose: request.purpose,
      requiredAmount: request.requiredAmount.toString(),
      dueAt: request.dueAt.toISOString(),
      status: request.status,
      transferContent: request.transferContent,
      bank: request.bankSnapshot,
      proofs: request.proofs.map((proof) => ({
        id: proof.id,
        status: proof.status,
        submittedAt: proof.submittedAt.toISOString(),
        reviewedAt: proof.reviewedAt?.toISOString() ?? null,
        reason: proof.reason,
      })),
    })),
    shipments: order.shipments.map((shipment) => ({
      id: shipment.id,
      status: shipment.status,
      carrierName: shipment.carrierName,
      trackingCode: shipment.trackingCode,
      trackingUrl: shipment.trackingUrl,
    })),
    refunds: (includePayments ? order.refunds : []).map((refund) => ({
      id: refund.id,
      status: refund.status,
      amount: refund.amount.toString(),
      payoutHold: refund.payoutHold,
      reason: refund.reason,
    })),
    submissionDeadlineAt: order.dealerDetail?.submissionDeadlineAt.toISOString() ?? null,
    balanceDeadlineAt: order.dealerDetail?.balanceDeadlineAt?.toISOString() ?? null,
    reviewStartedAt: order.dealerDetail?.reviewStartedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
