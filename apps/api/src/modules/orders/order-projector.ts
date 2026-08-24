import { ApiError } from '../../common/errors/api-error.js';
import { safeHttpsUrl } from '../../common/security/safe-https-url.js';
import type { AppConfig } from '../../config/app-config.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { OrderDetailDto } from './order-response.dto.js';

export const customerOrderInclude = {
  items: {
    include: { warranty: true },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
  payments: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
  refunds: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
  pickupLocation: { select: { code: true, name: true } },
  shipments: { orderBy: { attemptNumber: 'desc' as const }, take: 1 },
  sourceCart: { select: { guestTokenHash: true, expiresAt: true, status: true } },
} satisfies Prisma.OrderInclude;

export type CustomerOrderRecord = Prisma.OrderGetPayload<{
  include: typeof customerOrderInclude;
}>;

export function projectOrder(
  order: CustomerOrderRecord,
  options: { now?: Date; config?: AppConfig } = {},
): OrderDetailDto {
  const now = options.now ?? new Date();
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    fulfillmentType: order.fulfillmentType,
    contact: {
      fullName: order.customerName,
      email: order.customerEmail,
      phone: order.customerPhone,
    },
    shippingAddress: order.shippingAddressSnapshot,
    ...(order.pickupLocation === null
      ? {}
      : {
          pickupStore: {
            code: order.pickupLocation.code,
            name: order.pickupLocation.name,
          },
        }),
    items: order.items.map((item) => ({
      id: item.id,
      productType: item.productTypeSnapshot,
      productName: item.productNameSnapshot,
      variantName: item.variantNameSnapshot,
      sku: item.skuSnapshot,
      inventoryCode: item.inventoryCodeSnapshot,
      configuration: item.configurationSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toString(),
      lineSubtotal: item.lineSubtotal.toString(),
      discountAmount: item.discountAmount.toString(),
      lineTotal: item.lineTotal.toString(),
      warrantyDays: item.warrantyDaysSnapshot,
      warrantyTerms: item.warrantyTermsSnapshot,
      warranty:
        item.warranty === null
          ? null
          : {
              warrantyCode: item.warranty.warrantyCode,
              status: item.warranty.status,
              startAt: item.warranty.startAt.toISOString(),
              endAt: item.warranty.endAt.toISOString(),
              isValid:
                item.warranty.status === 'ACTIVE' &&
                item.warranty.startAt <= now &&
                now < item.warranty.endAt,
              isExpired: item.warranty.endAt <= now,
            },
    })),
    pricing: {
      subtotal: order.subtotal.toString(),
      itemDiscountAmount: order.itemDiscountAmount.toString(),
      voucherDiscountAmount: order.voucherDiscountAmount.toString(),
      shippingFee: order.shippingFee.toString(),
      grandTotal: order.grandTotal.toString(),
      depositRequired: order.depositRequired.toString(),
      paidAmount: order.paidAmount.toString(),
      refundedAmount: order.refundedAmount.toString(),
      balanceDue: order.balanceDue.toString(),
    },
    voucherCode: order.voucherCodeSnapshot,
    paymentAttempts: order.payments.map((payment) => {
      const reviewSlaDueAt =
        payment.submittedAt === null || payment.reviewWindowMinutesSnapshot === null
          ? null
          : new Date(payment.submittedAt.getTime() + payment.reviewWindowMinutesSnapshot * 60_000);
      const bankQrUrl = publicStorageUrl(
        options.config,
        payment.bankQrBucketSnapshot,
        payment.bankQrObjectPathSnapshot,
      );
      const bankTransferInstructions =
        payment.method === 'BANK_TRANSFER' &&
        payment.bankNameSnapshot !== null &&
        payment.bankAccountNumberSnapshot !== null &&
        payment.bankAccountHolderSnapshot !== null &&
        payment.transferContent !== null
          ? {
              bankName: payment.bankNameSnapshot,
              accountNumber: payment.bankAccountNumberSnapshot,
              accountHolder: payment.bankAccountHolderSnapshot,
              qrUrl: bankQrUrl,
              transferContent: payment.transferContent,
            }
          : null;
      return {
        id: payment.id,
        purpose: payment.purpose,
        method: payment.method,
        status: payment.status,
        expectedAmount: payment.expectedAmount.toString(),
        receivedAmount: payment.receivedAmount?.toString() ?? null,
        transferContent: payment.transferContent,
        bankName: payment.bankNameSnapshot,
        bankAccountNumber: payment.bankAccountNumberSnapshot,
        bankAccountHolder: payment.bankAccountHolderSnapshot,
        bankQrUrl,
        bankTransferInstructions,
        expiresAt: payment.expiresAt?.toISOString() ?? null,
        submittedAt: payment.submittedAt?.toISOString() ?? null,
        reviewSlaDueAt: reviewSlaDueAt?.toISOString() ?? null,
        reviewOverdue:
          payment.status === 'UNDER_REVIEW' && reviewSlaDueAt !== null && reviewSlaDueAt <= now,
        rejectionReason: payment.status === 'REJECTED' ? payment.rejectionReason : null,
      };
    }),
    refunds: order.refunds.map((refund) => ({
      id: refund.id,
      amount: refund.amount.toString(),
      method: refund.method,
      status: refund.status,
      reason: refund.reason,
      terminalReason: refund.terminalReason,
      processingAt: refund.processingAt?.toISOString() ?? null,
      completedAt: refund.completedAt?.toISOString() ?? null,
      terminalAt: refund.terminalAt?.toISOString() ?? null,
      createdAt: refund.createdAt.toISOString(),
    })),
    shipment: projectPublicShipment(order.shipments[0]),
    customerNote: order.customerNote,
    placedAt: order.placedAt.toISOString(),
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    pickupHoldUntil: order.pickupHoldUntil?.toISOString() ?? null,
    pickupReadyAt: order.pickupReadyAt?.toISOString() ?? null,
    pickedUpAt: order.pickedUpAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    cancelReason: order.cancelReason,
    availableActions: [
      ...(canCancel(order) ? (['CANCEL'] as const) : []),
      ...(canSubmitPaymentProof(order, now) ? (['SUBMIT_PAYMENT_PROOF'] as const) : []),
    ],
  };
}

function projectPublicShipment(shipment: CustomerOrderRecord['shipments'][number] | undefined) {
  if (shipment === undefined) return null;
  return {
    carrierName: shipment.carrierName,
    trackingCode: shipment.trackingCode,
    trackingUrl: safeHttpsUrl(shipment.trackingUrl),
    status: shipment.status,
    shippedAt: shipment.shippedAt?.toISOString() ?? null,
    deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
    failedAt: shipment.failedAt?.toISOString() ?? null,
    returnedAt: shipment.returnedAt?.toISOString() ?? null,
  };
}

export function requireOrder(order: CustomerOrderRecord | null): CustomerOrderRecord {
  if (order === null) throw new ApiError('ORDER_NOT_FOUND');
  return order;
}

function canCancel(order: CustomerOrderRecord): boolean {
  return (
    order.status !== 'CANCELLED' &&
    order.status !== 'COMPLETED' &&
    !['IN_TRANSIT', 'COMPLETED', 'FAILED', 'RETURNED'].includes(order.fulfillmentStatus) &&
    !order.payments.some(({ status }) => status === 'UNDER_REVIEW')
  );
}

function canSubmitPaymentProof(order: CustomerOrderRecord, now: Date): boolean {
  return order.payments.some(
    (payment) =>
      payment.purpose === 'DEPOSIT' &&
      payment.method === 'BANK_TRANSFER' &&
      payment.status === 'AWAITING_PROOF' &&
      payment.expiresAt !== null &&
      now < payment.expiresAt,
  );
}

function publicStorageUrl(
  config: AppConfig | undefined,
  bucket: string | null,
  objectPath: string | null,
): string | null {
  if (config === undefined || bucket === null || objectPath === null) return null;
  const segments = objectPath.split('/');
  if (
    objectPath.startsWith('/') ||
    objectPath.endsWith('/') ||
    objectPath.includes('\\') ||
    segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    return null;
  }
  return `${config.storage.url.replace(/\/$/, '')}/storage/v1/object/public/${encodeURIComponent(bucket)}/${segments.map(encodeURIComponent).join('/')}`;
}
