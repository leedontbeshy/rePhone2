import { describe, expect, it } from 'vitest';
import type { ApiError } from '../../common/errors/api-error.js';
import type { FulfillmentOrderRecord } from '../order-transaction-ports/fulfillment-order.gateway.js';
import { assertPickupDeadline, validatePickupHoldExtension } from './pickup-fulfillment.policy.js';
import { availableFulfillmentActions } from './fulfillment-action.policy.js';

type PolicyOrder = Pick<
  FulfillmentOrderRecord,
  | 'status'
  | 'fulfillmentStatus'
  | 'fulfillmentType'
  | 'pickupHoldUntil'
  | 'fulfillmentLocationId'
  | 'pickupLocationId'
  | 'fulfillmentLocation'
  | 'payments'
  | 'shipments'
>;

const now = new Date('2026-08-23T03:00:00.000Z');
const currentHold = new Date('2026-08-24T03:00:00.000Z');

function order(overrides: Partial<PolicyOrder> = {}): FulfillmentOrderRecord {
  const fixture: PolicyOrder = {
    status: 'PROCESSING',
    fulfillmentStatus: 'READY',
    fulfillmentType: 'PICKUP',
    pickupHoldUntil: currentHold,
    fulfillmentLocationId: '0198e5a0-0000-7000-8000-000000000001',
    pickupLocationId: '0198e5a0-0000-7000-8000-000000000001',
    fulfillmentLocation: {
      id: '0198e5a0-0000-7000-8000-000000000001',
      code: 'HCM-STORE-01',
      name: 'rePhone Hồ Chí Minh',
      type: 'STORE',
      status: 'ACTIVE',
    },
    payments: [],
    shipments: [],
    ...overrides,
  };
  return fixture as FulfillmentOrderRecord;
}

describe('pickup fulfillment policy', () => {
  it('accepts pickup strictly before the deadline and expires it at the boundary', () => {
    expect(assertPickupDeadline(order(), new Date(currentHold.getTime() - 1))).toBe(currentHold);
    expect(() => assertPickupDeadline(order(), currentHold)).toThrow(
      expect.objectContaining({ code: 'RESERVATION_EXPIRED' }) as ApiError,
    );
    expect(() =>
      assertPickupDeadline(order({ fulfillmentType: 'SHIPPING', pickupHoldUntil: null }), now),
    ).toThrow(expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }) as ApiError);
  });

  it.each([
    [
      'placed pickup',
      { status: 'PLACED', fulfillmentStatus: 'PENDING' },
      ['CONFIRM', 'EXTEND_PICKUP_HOLD'],
    ],
    [
      'confirmed pickup',
      { status: 'CONFIRMED', fulfillmentStatus: 'PENDING' },
      ['START_PREPARING', 'EXTEND_PICKUP_HOLD'],
    ],
    [
      'preparing pickup',
      { status: 'PROCESSING', fulfillmentStatus: 'PREPARING' },
      ['MARK_PICKUP_READY', 'EXTEND_PICKUP_HOLD'],
    ],
    [
      'ready pickup',
      { status: 'PROCESSING', fulfillmentStatus: 'READY' },
      ['EXTEND_PICKUP_HOLD', 'COMPLETE_PICKUP'],
    ],
    [
      'confirmed shipping',
      {
        status: 'CONFIRMED',
        fulfillmentStatus: 'PENDING',
        fulfillmentType: 'SHIPPING',
        pickupHoldUntil: null,
      },
      ['START_PREPARING'],
    ],
    [
      'legacy confirmed/preparing shipping',
      {
        status: 'CONFIRMED',
        fulfillmentStatus: 'PREPARING',
        fulfillmentType: 'SHIPPING',
        pickupHoldUntil: null,
      },
      ['START_PREPARING'],
    ],
  ] satisfies Array<[string, Partial<PolicyOrder>, string[]]>)(
    'returns ordered actions for %s',
    (_label, overrides, expected) => {
      expect(availableFulfillmentActions(order(overrides), now)).toEqual(expected);
    },
  );

  it('returns no actions after the deadline or for a terminal order', () => {
    expect(
      availableFulfillmentActions(
        order({ status: 'PLACED', fulfillmentStatus: 'PENDING' }),
        currentHold,
      ),
    ).toEqual([]);
    expect(availableFulfillmentActions(order({ status: 'COMPLETED' }), now)).toEqual([]);
    expect(availableFulfillmentActions(order({ status: 'CANCELLED' }), now)).toEqual([]);
  });

  it('exposes fee override only while the awaiting deposit deadline is still open', () => {
    const deposit = shippingDeposit();
    const shipping = order({
      status: 'PLACED',
      fulfillmentStatus: 'PENDING',
      fulfillmentType: 'SHIPPING',
      pickupHoldUntil: null,
      payments: [deposit],
    });
    expect(availableFulfillmentActions(shipping, now)).toEqual(['OVERRIDE_SHIPPING_FEE']);
    expect(availableFulfillmentActions(shipping, deposit.expiresAt as Date)).toEqual([]);
  });

  it.each([
    [
      'preparing without shipment',
      { status: 'PROCESSING', fulfillmentStatus: 'PREPARING', shipments: [] },
      ['CREATE_SHIPMENT'],
    ],
    [
      'created shipment',
      {
        status: 'PROCESSING',
        fulfillmentStatus: 'PREPARING',
        shipments: [shipment('CREATED')],
      },
      ['HAND_OVER_SHIPMENT'],
    ],
    [
      'in transit shipment',
      {
        status: 'PROCESSING',
        fulfillmentStatus: 'IN_TRANSIT',
        shipments: [shipment('HANDED_TO_CARRIER')],
      },
      ['MARK_SHIPMENT_DELIVERED', 'MARK_SHIPMENT_FAILED'],
    ],
    [
      'failed shipment',
      {
        status: 'PROCESSING',
        fulfillmentStatus: 'FAILED',
        shipments: [shipment('FAILED')],
      },
      ['MARK_SHIPMENT_RETURNED'],
    ],
  ] satisfies Array<[string, Partial<PolicyOrder>, string[]]>)(
    'returns shipping action for %s',
    (_label, overrides, expected) => {
      expect(
        availableFulfillmentActions(
          order({
            fulfillmentType: 'SHIPPING',
            pickupHoldUntil: null,
            ...overrides,
          }),
          now,
        ),
      ).toEqual(expected);
    },
  );

  it('recognizes an equal hold extension as a replay', () => {
    expect(validatePickupHoldExtension(order(), currentHold, now)).toEqual({
      replayed: true,
      current: currentHold,
    });
  });

  it('accepts an extension exactly seven days from now', () => {
    expect(validatePickupHoldExtension(order(), new Date('2026-08-30T03:00:00.000Z'), now)).toEqual(
      { replayed: false, current: currentHold },
    );
  });

  it.each([
    ['before the current hold', new Date(currentHold.getTime() - 1)],
    ['more than seven days from now', new Date('2026-08-30T03:00:00.001Z')],
  ])('rejects an extension %s', (_label, requested) => {
    expect(() => validatePickupHoldExtension(order(), requested, now)).toThrow(
      expect.objectContaining({
        code: 'VALIDATION_FAILED',
        details: [expect.objectContaining({ code: 'PICKUP_HOLD_RANGE_INVALID' })],
      }) as ApiError,
    );
  });
});

function shippingDeposit(): FulfillmentOrderRecord['payments'][number] {
  return {
    id: cryptoId(10),
    purpose: 'DEPOSIT',
    method: 'BANK_TRANSFER',
    status: 'AWAITING_PROOF',
    submittedAt: null,
    expiresAt: new Date('2026-08-23T04:00:00.000Z'),
  } as FulfillmentOrderRecord['payments'][number];
}

function shipment(
  status: FulfillmentOrderRecord['shipments'][number]['status'],
): FulfillmentOrderRecord['shipments'][number] {
  return { id: cryptoId(11), status } as FulfillmentOrderRecord['shipments'][number];
}

function cryptoId(suffix: number): string {
  return `0198e5a0-0000-7000-8000-${suffix.toString().padStart(12, '0')}`;
}
