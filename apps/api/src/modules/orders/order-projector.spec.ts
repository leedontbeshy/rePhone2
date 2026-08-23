import { describe, expect, it } from 'vitest';
import { projectOrder, type CustomerOrderRecord } from './order-projector.js';

describe('customer order projector', () => {
  it('exposes only customer-safe tracking fields from the latest shipment', () => {
    const now = new Date('2026-08-23T05:00:00.000Z');
    const shipment = {
      id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6700',
      orderId: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6701',
      attemptNumber: 2,
      carrierName: 'Giao hàng demo',
      trackingCode: 'DEMO-002',
      trackingUrl: 'https://tracking.example/DEMO-002',
      status: 'RETURNED',
      shippedAt: new Date('2026-08-23T01:00:00.000Z'),
      deliveredAt: null,
      failedAt: new Date('2026-08-23T02:00:00.000Z'),
      returnedAt: new Date('2026-08-23T04:00:00.000Z'),
      failureReason: 'Customer phone was unreachable',
      returnNote: 'Internal warehouse inspection note',
      returnedToLocationId: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6702',
      createdById: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6703',
    };
    const order = {
      id: shipment.orderId,
      orderNumber: 'RPH-20260823-DEMO0002',
      status: 'PROCESSING',
      fulfillmentStatus: 'RETURNED',
      paymentStatus: 'PARTIALLY_PAID',
      fulfillmentType: 'SHIPPING',
      customerName: 'Khach Hang',
      customerEmail: 'customer@example.com',
      customerPhone: '0900000000',
      shippingAddressSnapshot: { province: 'TP HCM' },
      pickupLocation: null,
      items: [],
      subtotal: 1_000_000n,
      itemDiscountAmount: 0n,
      voucherDiscountAmount: 0n,
      shippingFee: 30_000n,
      grandTotal: 1_030_000n,
      depositRequired: 200_000n,
      paidAmount: 200_000n,
      refundedAmount: 0n,
      balanceDue: 830_000n,
      voucherCodeSnapshot: null,
      payments: [],
      refunds: [],
      shipments: [shipment],
      sourceCart: null,
      customerNote: null,
      placedAt: new Date('2026-08-23T00:00:00.000Z'),
      confirmedAt: new Date('2026-08-23T00:30:00.000Z'),
      pickupHoldUntil: null,
      pickupReadyAt: null,
      pickedUpAt: null,
      completedAt: null,
      cancelledAt: null,
      cancelReason: null,
    } as unknown as CustomerOrderRecord;

    const result = projectOrder(order, { now });

    expect(result.shipment).toEqual({
      carrierName: 'Giao hàng demo',
      trackingCode: 'DEMO-002',
      trackingUrl: 'https://tracking.example/DEMO-002',
      status: 'RETURNED',
      shippedAt: '2026-08-23T01:00:00.000Z',
      deliveredAt: null,
      failedAt: '2026-08-23T02:00:00.000Z',
      returnedAt: '2026-08-23T04:00:00.000Z',
    });
    expect(result.shipment).not.toHaveProperty('id');
    expect(result.shipment).not.toHaveProperty('failureReason');
    expect(result.shipment).not.toHaveProperty('returnNote');
    expect(result.shipment).not.toHaveProperty('returnedToLocationId');
    expect(result.shipment).not.toHaveProperty('createdById');
  });
});
