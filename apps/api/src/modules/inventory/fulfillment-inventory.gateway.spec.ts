import { describe, expect, it } from 'vitest';
import { ApiError } from '../../common/errors/api-error.js';
import {
  FulfillmentInventoryGateway,
  type FulfillmentReservation,
} from './fulfillment-inventory.gateway.js';

const ORDER_ID = '0198e5a0-0000-7000-8000-000000000001';
const ITEM_ID = '0198e5a0-0000-7000-8000-000000000002';
const VARIANT_ID = '0198e5a0-0000-7000-8000-000000000003';
const STOCK_ID = '0198e5a0-0000-7000-8000-000000000004';
const LOCATION_ID = '0198e5a0-0000-7000-8000-000000000005';
const HOLD_UNTIL = new Date('2026-08-24T00:00:00.000Z');

describe('FulfillmentInventoryGateway reservation policy', () => {
  const gateway = new FulfillmentInventoryGateway();
  const item = {
    id: ITEM_ID,
    inventoryUnitId: null,
    variantId: VARIANT_ID,
    quantity: 2,
  };

  it('accepts a complete pickup hold whose owner, item and stock target all align', () => {
    expect(() => {
      gateway.assertPickupHold([accessoryReservation()], ORDER_ID, [item], LOCATION_ID, HOLD_UNTIL);
    }).not.toThrow();
  });

  it.each([
    [
      'cross-order item',
      { orderItem: { ...accessoryReservation().orderItem, orderId: cryptoId(9) } },
    ],
    ['wrong stock location', { stockLevel: { locationId: cryptoId(8), variantId: VARIANT_ID } }],
    ['wrong quantity', { quantity: 1 }],
  ] satisfies Array<[string, Partial<FulfillmentReservation>]>)(
    'rejects a %s reservation before inventory mutation',
    (_label, override) => {
      const reservation = { ...accessoryReservation(), ...override };
      expect(() => {
        gateway.assertPickupHold([reservation], ORDER_ID, [item], LOCATION_ID, HOLD_UNTIL);
      }).toThrow(ApiError);
    },
  );
});

function accessoryReservation(): FulfillmentReservation {
  return {
    id: '0198e5a0-0000-7000-8000-000000000006',
    orderId: ORDER_ID,
    orderItemId: ITEM_ID,
    inventoryUnitId: null,
    stockLevelId: STOCK_ID,
    quantity: 2,
    holdReason: 'PICKUP',
    expiresAt: HOLD_UNTIL,
    orderItem: {
      id: ITEM_ID,
      orderId: ORDER_ID,
      inventoryUnitId: null,
      variantId: VARIANT_ID,
      quantity: 2,
    },
    inventoryUnit: null,
    stockLevel: { locationId: LOCATION_ID, variantId: VARIANT_ID },
  };
}

function cryptoId(suffix: number): string {
  return `0198e5a0-0000-7000-8000-${suffix.toString().padStart(12, '0')}`;
}
