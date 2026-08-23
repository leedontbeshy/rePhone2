import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../common/errors/api-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  FulfillmentInventoryGateway,
  type FulfillmentReservation,
  type FulfillmentStockMovement,
} from './fulfillment-inventory.gateway.js';

const ORDER_ID = '0198e5a0-0000-7000-8000-000000000001';
const ITEM_ID = '0198e5a0-0000-7000-8000-000000000002';
const VARIANT_ID = '0198e5a0-0000-7000-8000-000000000003';
const STOCK_ID = '0198e5a0-0000-7000-8000-000000000004';
const LOCATION_ID = '0198e5a0-0000-7000-8000-000000000005';
const HOLD_UNTIL = new Date('2026-08-24T00:00:00.000Z');
const SHIPPED_AT = new Date('2026-08-23T10:00:00.000Z');

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

  it('accepts consumed shipping proof whose accessory sale movement aligns exactly', () => {
    expect(() => {
      gateway.assertShippingCompletionProof(
        [consumedAccessoryReservation()],
        [accessorySaleMovement()],
        ORDER_ID,
        [item],
        LOCATION_ID,
        SHIPPED_AT,
      );
    }).not.toThrow();
  });

  it.each([
    [
      'consumed timestamp differs from handover',
      [{ ...consumedAccessoryReservation(), consumedAt: new Date(SHIPPED_AT.getTime() + 1) }],
      [accessorySaleMovement()],
    ],
    ['sale movement is missing', [consumedAccessoryReservation()], []],
    [
      'sale movement targets another variant',
      [consumedAccessoryReservation()],
      [{ ...accessorySaleMovement(), variantId: cryptoId(12) }],
    ],
  ] satisfies Array<[string, FulfillmentReservation[], FulfillmentStockMovement[]]>)(
    'rejects shipping completion when %s',
    (_label, reservations, movements) => {
      expect(() => {
        gateway.assertShippingCompletionProof(
          reservations,
          movements,
          ORDER_ID,
          [item],
          LOCATION_ID,
          SHIPPED_AT,
        );
      }).toThrow(ApiError);
    },
  );

  it('does not auto-restock accessories when a shipment is marked returned', async () => {
    const unitUpdate = vi.fn();
    const levelUpsert = vi.fn();
    const levelUpdate = vi.fn();
    const movementCreate = vi.fn();
    const transaction = {
      $queryRaw: vi.fn(),
      inventoryUnit: { updateMany: unitUpdate },
      stockLevel: { upsert: levelUpsert, updateMany: levelUpdate },
      stockMovement: { create: movementCreate },
    } as unknown as Prisma.TransactionClient;

    await expect(
      gateway.returnShipping([item], LOCATION_ID, cryptoId(13), transaction),
    ).resolves.toBeUndefined();
    expect(unitUpdate).not.toHaveBeenCalled();
    expect(levelUpsert).not.toHaveBeenCalled();
    expect(levelUpdate).not.toHaveBeenCalled();
    expect(movementCreate).not.toHaveBeenCalled();
  });
});

function accessoryReservation(): FulfillmentReservation {
  return {
    id: '0198e5a0-0000-7000-8000-000000000006',
    orderId: ORDER_ID,
    orderItemId: ITEM_ID,
    inventoryUnitId: null,
    stockLevelId: STOCK_ID,
    quantity: 2,
    status: 'ACTIVE',
    holdReason: 'PICKUP',
    expiresAt: HOLD_UNTIL,
    consumedAt: null,
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

function consumedAccessoryReservation(): FulfillmentReservation {
  return {
    ...accessoryReservation(),
    status: 'CONSUMED',
    holdReason: 'FULFILLMENT',
    expiresAt: null,
    consumedAt: SHIPPED_AT,
  };
}

function accessorySaleMovement(): FulfillmentStockMovement {
  return {
    id: cryptoId(7),
    variantId: VARIANT_ID,
    fromLocationId: LOCATION_ID,
    toLocationId: null,
    type: 'SALE',
    quantity: 2,
    referenceType: 'INVENTORY_RESERVATION',
    referenceId: consumedAccessoryReservation().id,
  };
}

function cryptoId(suffix: number): string {
  return `0198e5a0-0000-7000-8000-${suffix.toString().padStart(12, '0')}`;
}
