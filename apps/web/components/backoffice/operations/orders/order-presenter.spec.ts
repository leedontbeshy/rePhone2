import { describe, expect, it } from 'vitest';
import type { BackofficeOrderDetail } from '@/lib/fulfillment-api';
import {
  fulfillmentStatusLabel,
  isSafeTrackingUrl,
  orderActionLabel,
  orderDraftFromQuery,
  orderListHref,
  orderQueryFromDraft,
  orderSortDirectionLabels,
  orderStatusAxes,
  orderTimeline,
  parseOrderListQuery,
  primaryOrderAction,
} from './order-presenter';

describe('order operations presenter', () => {
  it('parses allow-listed URL filters and serializes a stable compact URL', () => {
    const query = parseOrderListQuery(
      new URLSearchParams(
        'q=RPH-2026&status=PROCESSING&fulfillmentType=SHIPPING&paymentStatus=PARTIALLY_PAID&page=3&sortBy=grandTotal&sortOrder=asc',
      ),
    );

    expect(query).toMatchObject({
      fulfillmentType: 'SHIPPING',
      page: 3,
      paymentStatus: 'PARTIALLY_PAID',
      q: 'RPH-2026',
      sortBy: 'grandTotal',
      sortOrder: 'asc',
      status: 'PROCESSING',
    });
    expect(orderListHref(query)).toBe(
      '/backoffice/orders?q=RPH-2026&status=PROCESSING&paymentStatus=PARTIALLY_PAID&fulfillmentType=SHIPPING&sortBy=grandTotal&sortOrder=asc&page=3',
    );
  });

  it('rejects unsupported query values instead of forwarding them', () => {
    const query = parseOrderListQuery(
      new URLSearchParams('status=INTERNAL&fulfillmentStatus=UNKNOWN&page=-4&sortBy=secret'),
    );

    expect(query).toMatchObject({
      fulfillmentStatus: '',
      page: 1,
      sortBy: 'placedAt',
      status: '',
    });
  });

  it('removes pickup-only filters when switching to delivery', () => {
    const pickupQuery = parseOrderListQuery(
      new URLSearchParams(
        'fulfillmentType=PICKUP&pickupOverdue=true&sortBy=pickupHoldUntil&sortOrder=asc',
      ),
    );
    const shippingDraft = {
      ...orderDraftFromQuery(pickupQuery),
      fulfillmentType: 'SHIPPING' as const,
    };

    expect(orderQueryFromDraft(shippingDraft)).toMatchObject({
      fulfillmentType: 'SHIPPING',
      sortBy: 'placedAt',
    });
    expect(orderQueryFromDraft(shippingDraft)).not.toHaveProperty('pickupOverdue');
  });

  it('uses direction labels that match the selected sort field', () => {
    expect(orderSortDirectionLabels('placedAt')).toEqual({
      asc: 'Cũ nhất trước',
      desc: 'Mới nhất trước',
    });
    expect(orderSortDirectionLabels('grandTotal')).toEqual({
      asc: 'Giá trị thấp đến cao',
      desc: 'Giá trị cao đến thấp',
    });
    expect(orderSortDirectionLabels('pickupHoldUntil')).toEqual({
      asc: 'Hạn sớm nhất trước',
      desc: 'Hạn muộn nhất trước',
    });
  });

  it('uses natural Vietnamese labels and chooses the next operational action', () => {
    expect(fulfillmentStatusLabel('IN_TRANSIT')).toBe('Đang giao hàng');
    expect(orderActionLabel('MARK_SHIPMENT_RETURNED')).toBe('Xác nhận hàng hoàn đã về');
    expect(
      primaryOrderAction(['CANCEL_ORDER', 'MARK_SHIPMENT_FAILED', 'MARK_SHIPMENT_DELIVERED']),
    ).toBe('MARK_SHIPMENT_DELIVERED');
  });

  it('accepts only credential-free HTTPS tracking URLs', () => {
    expect(isSafeTrackingUrl('https://tracking.example/RPH-01')).toBe(true);
    expect(isSafeTrackingUrl('http://tracking.example/RPH-01')).toBe(false);
    expect(isSafeTrackingUrl('https://staff:secret@tracking.example/RPH-01')).toBe(false);
    expect(isSafeTrackingUrl('not-a-url')).toBe(false);
  });

  it('presents three independent status axes and a shipping journey', () => {
    const detail = orderDetail();
    expect(orderStatusAxes(detail).map(({ label, value }) => ({ label, value }))).toEqual([
      { label: 'Đơn hàng', value: 'Đang xử lý' },
      { label: 'Giao nhận', value: 'Đang giao hàng' },
      { label: 'Thanh toán', value: 'Đã thanh toán một phần' },
    ]);
    expect(orderTimeline(detail).map((item) => item.label)).toEqual([
      'Đã đặt hàng',
      'Đã xác nhận thanh toán cọc',
      'Đã tạo vận đơn',
      'Đã bàn giao vận chuyển',
      'Đang giao hàng',
    ]);
    expect(orderTimeline(detail).at(-1)).toMatchObject({ at: null, state: 'current' });

    const delivered: BackofficeOrderDetail = {
      ...detail,
      completedAt: '2026-08-28T06:00:00.000Z',
      fulfillmentStatus: 'COMPLETED',
      shipments: detail.shipments.map((shipment) => ({
        ...shipment,
        deliveredAt: '2026-08-28T05:00:00.000Z',
        status: 'DELIVERED',
      })),
      status: 'COMPLETED',
    };
    expect(orderTimeline(delivered).map((item) => item.label)).toContain('Đã giao hàng');
  });
});

function orderDetail(): BackofficeOrderDetail {
  return {
    availableActions: ['MARK_SHIPMENT_DELIVERED', 'MARK_SHIPMENT_FAILED'],
    cancelReason: null,
    cancelledAt: null,
    completedAt: null,
    confirmedAt: '2026-08-28T02:00:00.000Z',
    contact: { email: 'khach@example.com', fullName: 'Khách Demo', phone: '0900000000' },
    customerNote: null,
    fulfillmentStatus: 'IN_TRANSIT',
    fulfillmentType: 'SHIPPING',
    id: 'order-1',
    internalNote: null,
    items: [],
    location: null,
    orderNumber: 'RPH-20260828-ABC12345',
    paymentAttempts: [],
    paymentStatus: 'PARTIALLY_PAID',
    pickedUpAt: null,
    pickupHoldUntil: null,
    pickupReadyAt: null,
    pickupStore: null,
    placedAt: '2026-08-28T01:00:00.000Z',
    pricing: {
      balanceDue: '1000000',
      depositRequired: '500000',
      grandTotal: '1500000',
      paidAmount: '500000',
      refundedAmount: '0',
      shippingFee: '30000',
      shippingFeeOriginal: '30000',
      shippingFeeOverride: null,
      subtotal: '1470000',
      voucherDiscountAmount: '0',
    },
    refundableAmount: '500000',
    refunds: [],
    reservations: [],
    shipments: [
      {
        attemptNumber: 1,
        carrierName: 'Giao hàng Demo',
        createdAt: '2026-08-28T03:00:00.000Z',
        createdBy: null,
        deliveredAt: null,
        failedAt: null,
        failureReason: null,
        id: 'shipment-1',
        orderId: 'order-1',
        returnedAt: null,
        returnedToLocation: null,
        returnNote: null,
        shippedAt: '2026-08-28T04:00:00.000Z',
        status: 'HANDED_TO_CARRIER',
        trackingCode: 'DEMO-01',
        trackingUrl: 'https://tracking.example/DEMO-01',
        updatedAt: null,
      },
    ],
    shippingAddress: null,
    status: 'PROCESSING',
  };
}
