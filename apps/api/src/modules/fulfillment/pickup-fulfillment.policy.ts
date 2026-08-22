import { ApiError } from '../../common/errors/api-error.js';
import type { FulfillmentOrderRecord } from '../order-transaction-ports/fulfillment-order.gateway.js';
import type { FulfillmentAction } from './fulfillment-response.dto.js';

const TERMINAL_FULFILLMENT = ['COMPLETED', 'CANCELLED', 'IN_TRANSIT', 'FAILED', 'RETURNED'];

export function assertPickupDeadline(order: FulfillmentOrderRecord, now: Date): Date {
  if (order.fulfillmentType !== 'PICKUP' || order.pickupHoldUntil === null) {
    throw new ApiError('INVALID_STATE_TRANSITION');
  }
  if (now >= order.pickupHoldUntil) throw new ApiError('RESERVATION_EXPIRED');
  return order.pickupHoldUntil;
}

export function validatePickupHoldExtension(
  order: FulfillmentOrderRecord,
  requested: Date,
  now: Date,
): { replayed: boolean; current: Date } {
  if (
    order.status === 'COMPLETED' ||
    order.status === 'CANCELLED' ||
    TERMINAL_FULFILLMENT.includes(order.fulfillmentStatus)
  ) {
    throw new ApiError('INVALID_STATE_TRANSITION');
  }
  const current = assertPickupDeadline(order, now);
  if (requested.getTime() === current.getTime()) return { replayed: true, current };
  if (requested <= current || requested > new Date(now.getTime() + 7 * 86_400_000)) {
    throw new ApiError('VALIDATION_FAILED', undefined, [
      {
        field: 'holdUntil',
        code: 'PICKUP_HOLD_RANGE_INVALID',
        message: 'Hạn mới phải sau hạn hiện tại và không quá 7 ngày kể từ hiện tại.',
      },
    ]);
  }
  return { replayed: false, current };
}

export function availableFulfillmentActions(
  order: FulfillmentOrderRecord,
  now: Date,
): FulfillmentAction[] {
  if (order.status === 'COMPLETED' || order.status === 'CANCELLED') return [];
  const pickupValid =
    order.fulfillmentType === 'PICKUP' &&
    order.pickupHoldUntil !== null &&
    now < order.pickupHoldUntil;
  const actions: FulfillmentAction[] = [];
  if (pickupValid && order.status === 'PLACED' && order.fulfillmentStatus === 'PENDING') {
    actions.push('CONFIRM');
  }
  if (
    order.status === 'CONFIRMED' &&
    ['PENDING', 'PREPARING'].includes(order.fulfillmentStatus) &&
    (order.fulfillmentType === 'SHIPPING' || pickupValid)
  ) {
    actions.push('START_PREPARING');
  }
  if (pickupValid && order.status === 'PROCESSING' && order.fulfillmentStatus === 'PREPARING') {
    actions.push('MARK_PICKUP_READY');
  }
  if (pickupValid && !TERMINAL_FULFILLMENT.includes(order.fulfillmentStatus)) {
    actions.push('EXTEND_PICKUP_HOLD');
  }
  if (pickupValid && order.status === 'PROCESSING' && order.fulfillmentStatus === 'READY') {
    actions.push('COMPLETE_PICKUP');
  }
  return actions;
}
