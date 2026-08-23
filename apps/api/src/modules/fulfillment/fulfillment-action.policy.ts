import type { FulfillmentAction } from './fulfillment-response.dto.js';

export interface FulfillmentActionOrder {
  status: 'PLACED' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
  fulfillmentStatus:
    | 'PENDING'
    | 'PREPARING'
    | 'READY'
    | 'IN_TRANSIT'
    | 'COMPLETED'
    | 'FAILED'
    | 'RETURNED'
    | 'CANCELLED';
  fulfillmentType: 'PICKUP' | 'SHIPPING';
  pickupHoldUntil: Date | null;
  payments: ReadonlyArray<{
    purpose: 'DEPOSIT' | 'BALANCE' | 'FULL_PAYMENT';
    method: 'BANK_TRANSFER' | 'CASH' | 'COD' | 'OTHER';
    status: 'AWAITING_PROOF' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
    submittedAt: Date | null;
    expiresAt: Date | null;
  }>;
  shipments: ReadonlyArray<{
    status: 'CREATED' | 'HANDED_TO_CARRIER' | 'DELIVERED' | 'FAILED' | 'RETURNED' | 'CANCELLED';
  }>;
}

const TERMINAL_FULFILLMENT = ['COMPLETED', 'CANCELLED', 'IN_TRANSIT', 'FAILED', 'RETURNED'];

export function availableFulfillmentActions(
  order: FulfillmentActionOrder,
  now: Date,
): FulfillmentAction[] {
  if (order.status === 'COMPLETED' || order.status === 'CANCELLED') return [];
  return order.fulfillmentType === 'PICKUP'
    ? availablePickupActions(order, now)
    : availableShippingActions(order, now);
}

function availablePickupActions(order: FulfillmentActionOrder, now: Date): FulfillmentAction[] {
  const pickupValid = order.pickupHoldUntil !== null && now < order.pickupHoldUntil;
  if (!pickupValid) return [];
  const actions: FulfillmentAction[] = [];
  if (order.status === 'PLACED' && order.fulfillmentStatus === 'PENDING') {
    actions.push('CONFIRM');
  }
  if (order.status === 'CONFIRMED' && order.fulfillmentStatus === 'PENDING') {
    actions.push('START_PREPARING');
  }
  if (order.status === 'PROCESSING' && order.fulfillmentStatus === 'PREPARING') {
    actions.push('MARK_PICKUP_READY');
  }
  if (!TERMINAL_FULFILLMENT.includes(order.fulfillmentStatus)) {
    actions.push('EXTEND_PICKUP_HOLD');
  }
  if (order.status === 'PROCESSING' && order.fulfillmentStatus === 'READY') {
    actions.push('COMPLETE_PICKUP');
  }
  return actions;
}

function availableShippingActions(order: FulfillmentActionOrder, now: Date): FulfillmentAction[] {
  const actions: FulfillmentAction[] = [];
  if (canOverrideShippingFee(order, now)) actions.push('OVERRIDE_SHIPPING_FEE');
  if (order.status === 'CONFIRMED' && ['PENDING', 'PREPARING'].includes(order.fulfillmentStatus)) {
    actions.push('START_PREPARING');
  }
  const shipment = order.shipments[0];
  if (order.status === 'PROCESSING' && order.fulfillmentStatus === 'PREPARING') {
    if (shipment === undefined) actions.push('CREATE_SHIPMENT');
    else if (shipment.status === 'CREATED') actions.push('HAND_OVER_SHIPMENT');
  }
  if (
    order.status === 'PROCESSING' &&
    order.fulfillmentStatus === 'IN_TRANSIT' &&
    shipment?.status === 'HANDED_TO_CARRIER'
  ) {
    actions.push('MARK_SHIPMENT_DELIVERED', 'MARK_SHIPMENT_FAILED');
  }
  if (
    order.status === 'PROCESSING' &&
    order.fulfillmentStatus === 'FAILED' &&
    shipment?.status === 'FAILED'
  ) {
    actions.push('MARK_SHIPMENT_RETURNED');
  }
  return actions;
}

function canOverrideShippingFee(order: FulfillmentActionOrder, now: Date): boolean {
  if (
    order.status !== 'PLACED' ||
    order.fulfillmentStatus !== 'PENDING' ||
    order.shipments.length !== 0
  ) {
    return false;
  }
  const deposits = order.payments.filter(
    ({ purpose, method }) => purpose === 'DEPOSIT' && method === 'BANK_TRANSFER',
  );
  return (
    deposits.length === 1 &&
    deposits[0]?.status === 'AWAITING_PROOF' &&
    deposits[0].submittedAt === null &&
    deposits[0].expiresAt !== null &&
    now < deposits[0].expiresAt &&
    order.payments.every(({ status }) => status === 'AWAITING_PROOF')
  );
}
