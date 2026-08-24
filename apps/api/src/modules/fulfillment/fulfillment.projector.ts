import type {
  FulfillmentOrderListRecord,
  FulfillmentOrderRecord,
} from '../order-transaction-ports/fulfillment-order.gateway.js';
import type {
  BackofficeOrderDetailDto,
  BackofficeOrderListItemDto,
  BackofficeOrderShipmentDto,
} from './fulfillment-response.dto.js';
import { availableFulfillmentActions } from './fulfillment-action.policy.js';
import type { ShipmentRecord } from './shipment.gateway.js';

export function projectBackofficeOrderDetail(
  order: FulfillmentOrderRecord,
  now: Date,
): BackofficeOrderDetailDto {
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
    location: {
      id: order.fulfillmentLocation.id,
      code: order.fulfillmentLocation.code,
      name: order.fulfillmentLocation.name,
      type: order.fulfillmentLocation.type,
    },
    items: order.items.map((item) => ({
      id: item.id,
      productType: item.productTypeSnapshot,
      productName: item.productNameSnapshot,
      variantName: item.variantNameSnapshot,
      sku: item.skuSnapshot,
      inventoryCode: item.inventoryCodeSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toString(),
      lineTotal: item.lineTotal.toString(),
      warrantyDays: item.warrantyDaysSnapshot,
      warranty:
        item.warranty === null
          ? null
          : {
              warrantyCode: item.warranty.warrantyCode,
              status: item.warranty.status,
              startAt: item.warranty.startAt.toISOString(),
              endAt: item.warranty.endAt.toISOString(),
            },
    })),
    pricing: {
      subtotal: order.subtotal.toString(),
      voucherDiscountAmount: order.voucherDiscountAmount.toString(),
      shippingFeeOriginal: order.shippingFeeOriginal.toString(),
      shippingFee: order.shippingFee.toString(),
      shippingFeeOverride:
        order.shippingFeeOverrideReason === null ||
        order.shippingFeeOverriddenAt === null ||
        order.shippingFeeOverriddenBy === null
          ? null
          : {
              reason: order.shippingFeeOverrideReason,
              overriddenAt: order.shippingFeeOverriddenAt.toISOString(),
              overriddenBy: {
                id: order.shippingFeeOverriddenBy.id,
                fullName: order.shippingFeeOverriddenBy.fullName,
                employeeCode: order.shippingFeeOverriddenBy.employeeCode,
              },
            },
      grandTotal: order.grandTotal.toString(),
      depositRequired: order.depositRequired.toString(),
      paidAmount: order.paidAmount.toString(),
      refundedAmount: order.refundedAmount.toString(),
      balanceDue: order.balanceDue.toString(),
    },
    reservations: order.reservations.map((reservation) => ({
      id: reservation.id,
      status: reservation.status,
      holdReason: reservation.holdReason,
      targetType: reservation.inventoryUnitId === null ? 'STOCK_LEVEL' : 'INVENTORY_UNIT',
      quantity: reservation.quantity,
      expiresAt: reservation.expiresAt?.toISOString() ?? null,
      releasedAt: reservation.releasedAt?.toISOString() ?? null,
      consumedAt: reservation.consumedAt?.toISOString() ?? null,
    })),
    paymentAttempts: order.payments.map((payment) => ({
      id: payment.id,
      purpose: payment.purpose,
      method: payment.method,
      status: payment.status,
      expectedAmount: payment.expectedAmount.toString(),
      receivedAmount: payment.receivedAmount?.toString() ?? null,
      reviewedAt: payment.reviewedAt?.toISOString() ?? null,
      reviewerName: payment.reviewedBy?.fullName ?? null,
    })),
    refunds: order.refunds.map((refund) => ({
      id: refund.id,
      amount: refund.amount.toString(),
      status: refund.status,
      createdAt: refund.createdAt.toISOString(),
    })),
    shipments: order.shipments.map(projectBackofficeShipment),
    voucherCode: order.voucherCodeSnapshot,
    customerNote: order.customerNote,
    internalNote: order.internalNote,
    placedAt: order.placedAt.toISOString(),
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    pickupHoldUntil: order.pickupHoldUntil?.toISOString() ?? null,
    pickupReadyAt: order.pickupReadyAt?.toISOString() ?? null,
    pickedUpAt: order.pickedUpAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    cancelReason: order.cancelReason,
    pickupOverdue: isPickupOverdue(order, now),
    availableActions: availableFulfillmentActions(order, now),
  };
}

export function projectBackofficeShipment(shipment: ShipmentRecord): BackofficeOrderShipmentDto {
  return {
    id: shipment.id,
    orderId: shipment.orderId,
    attemptNumber: shipment.attemptNumber,
    carrierName: shipment.carrierName,
    trackingCode: shipment.trackingCode,
    trackingUrl: shipment.trackingUrl,
    status: shipment.status,
    shippedAt: shipment.shippedAt?.toISOString() ?? null,
    deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
    failedAt: shipment.failedAt?.toISOString() ?? null,
    returnedAt: shipment.returnedAt?.toISOString() ?? null,
    failureReason: shipment.failureReason,
    returnedToLocation:
      shipment.returnedToLocation === null
        ? null
        : {
            id: shipment.returnedToLocation.id,
            code: shipment.returnedToLocation.code,
            name: shipment.returnedToLocation.name,
            type: shipment.returnedToLocation.type,
          },
    returnNote: shipment.returnNote,
    createdBy: {
      id: shipment.createdBy.id,
      fullName: shipment.createdBy.fullName,
      employeeCode: shipment.createdBy.employeeCode,
    },
    createdAt: shipment.createdAt.toISOString(),
    updatedAt: shipment.updatedAt.toISOString(),
  };
}

export function projectBackofficeOrderListItem(
  order: FulfillmentOrderListRecord,
  now: Date,
): BackofficeOrderListItemDto {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    fulfillmentType: order.fulfillmentType,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    firstItemName: order.items[0]?.productNameSnapshot ?? '',
    totalItemQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
    grandTotal: order.grandTotal.toString(),
    balanceDue: order.balanceDue.toString(),
    location: {
      id: order.fulfillmentLocation.id,
      code: order.fulfillmentLocation.code,
      name: order.fulfillmentLocation.name,
      type: order.fulfillmentLocation.type,
    },
    pickupHoldUntil: order.pickupHoldUntil?.toISOString() ?? null,
    pickupOverdue: isPickupOverdue(order, now),
    placedAt: order.placedAt.toISOString(),
    availableActions: availableFulfillmentActions(order, now),
  };
}

function isPickupOverdue(
  order: Pick<FulfillmentOrderRecord, 'fulfillmentType' | 'pickupHoldUntil' | 'status'>,
  now: Date,
): boolean {
  return (
    order.fulfillmentType === 'PICKUP' &&
    order.pickupHoldUntil !== null &&
    order.pickupHoldUntil <= now &&
    order.status !== 'COMPLETED' &&
    order.status !== 'CANCELLED'
  );
}
