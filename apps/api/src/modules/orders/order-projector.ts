import { ApiError } from '../../common/errors/api-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { OrderDetailDto } from './order-response.dto.js';

export const customerOrderInclude = {
  items: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
  payments: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
  refunds: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
  pickupLocation: { select: { code: true, name: true } },
  shipments: { orderBy: { attemptNumber: 'desc' as const }, take: 1 },
} satisfies Prisma.OrderInclude;

export type CustomerOrderRecord = Prisma.OrderGetPayload<{
  include: typeof customerOrderInclude;
}>;

export function projectOrder(order: CustomerOrderRecord): OrderDetailDto {
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
    })),
    pricing: {
      subtotal: order.subtotal.toString(),
      itemDiscountAmount: order.itemDiscountAmount.toString(),
      voucherDiscountAmount: order.voucherDiscountAmount.toString(),
      shippingFee: order.shippingFee.toString(),
      grandTotal: order.grandTotal.toString(),
      depositRequired: order.depositRequired.toString(),
      balanceDue: order.balanceDue.toString(),
    },
    voucherCode: order.voucherCodeSnapshot,
    paymentAttempts: order.payments.map((payment) => ({
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
      expiresAt: payment.expiresAt?.toISOString() ?? null,
    })),
    refunds: order.refunds.map((refund) => ({
      id: refund.id,
      amount: refund.amount.toString(),
      status: refund.status,
      reason: refund.reason,
      createdAt: refund.createdAt.toISOString(),
    })),
    customerNote: order.customerNote,
    placedAt: order.placedAt.toISOString(),
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    cancelReason: order.cancelReason,
    availableActions: canCancel(order) ? ['CANCEL'] : [],
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
