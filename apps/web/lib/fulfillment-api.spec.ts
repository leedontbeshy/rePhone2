import { describe, expect, it, vi } from 'vitest';
import {
  completePickup,
  fulfillmentError,
  getBackofficeOrder,
  listBackofficeOrders,
} from './fulfillment-api';

const ORDER = {
  id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e1',
  orderNumber: 'RPH-20260823-23456789',
  status: 'PROCESSING',
  fulfillmentStatus: 'READY',
  paymentStatus: 'UNPAID',
  fulfillmentType: 'PICKUP',
  contact: {
    fullName: 'Khách Pickup',
    email: 'pickup@example.com',
    phone: '0900000000',
  },
  location: {
    id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e0',
    code: 'HCM-STORE-01',
    name: 'Cửa hàng Hồ Chí Minh',
    type: 'STORE',
  },
  items: [
    {
      id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e2',
      productName: 'iPhone 13',
      variantName: '128 GB Midnight',
      sku: 'IP13-128-MID',
      inventoryCode: 'IP13-MID-001',
      quantity: 1,
      unitPrice: '10990000',
      lineTotal: '10990000',
      warrantyDays: 90,
      warranty: null,
    },
  ],
  pricing: {
    subtotal: '10990000',
    voucherDiscountAmount: '0',
    shippingFee: '0',
    grandTotal: '10990000',
    depositRequired: '0',
    paidAmount: '0',
    refundedAmount: '0',
    balanceDue: '10990000',
  },
  reservations: [
    {
      id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e3',
      status: 'ACTIVE',
      holdReason: 'PICKUP',
      targetType: 'INVENTORY_UNIT',
      quantity: 1,
      expiresAt: '2026-08-24T00:00:00.000Z',
      releasedAt: null,
      consumedAt: null,
    },
  ],
  paymentAttempts: [],
  refunds: [],
  shipments: [],
  customerNote: null,
  internalNote: 'Gọi khách trước khi giao máy',
  placedAt: '2026-08-23T00:00:00.000Z',
  confirmedAt: '2026-08-23T00:05:00.000Z',
  pickupHoldUntil: '2026-08-24T00:00:00.000Z',
  pickupReadyAt: '2026-08-23T00:30:00.000Z',
  pickedUpAt: null,
  completedAt: null,
  cancelledAt: null,
  availableActions: ['EXTEND_PICKUP_HOLD', 'COMPLETE_PICKUP'],
  evidenceObjectPath: 'must-not-be-read',
};

describe('fulfillment api adapter', () => {
  it('compacts list filters and maps the paginated pickup queue', async () => {
    const client = {
      GET: vi.fn().mockResolvedValue({
        data: {
          data: [
            {
              ...ORDER,
              customerName: 'Khách Pickup',
              firstItemName: 'iPhone 13',
              totalItemQuantity: 1,
              pickupOverdue: false,
              grandTotal: '10990000',
              balanceDue: '10990000',
            },
          ],
          meta: { pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } },
        },
      }),
    };

    const result = await listBackofficeOrders(client, {
      q: '',
      status: '',
      fulfillmentStatus: 'READY',
      paymentStatus: '',
      fulfillmentType: 'PICKUP',
      page: 1,
      pageSize: 20,
      sortBy: 'placedAt',
      sortOrder: 'desc',
    });

    expect(client.GET).toHaveBeenCalledWith('/api/v1/backoffice/orders', {
      params: {
        query: {
          fulfillmentStatus: 'READY',
          fulfillmentType: 'PICKUP',
          page: 1,
          pageSize: 20,
          sortBy: 'placedAt',
          sortOrder: 'desc',
        },
      },
    });
    expect(result.pagination.totalItems).toBe(1);
    expect(result.data[0]).toMatchObject({
      orderNumber: ORDER.orderNumber,
      contactName: 'Khách Pickup',
      availableActions: ['EXTEND_PICKUP_HOLD', 'COMPLETE_PICKUP'],
    });
    expect(result.data[0]).not.toHaveProperty('evidenceObjectPath');
  });

  it('maps pickup detail, reservations and issued warranty safely', async () => {
    const completed = {
      ...ORDER,
      status: 'COMPLETED',
      fulfillmentStatus: 'COMPLETED',
      paymentStatus: 'PAID',
      pickedUpAt: '2026-08-23T01:00:00.000Z',
      completedAt: '2026-08-23T01:00:00.000Z',
      availableActions: [],
      items: [
        {
          ...ORDER.items[0],
          warranty: {
            warrantyCode: 'RPH-W-20260823-23456789',
            status: 'ACTIVE',
            startAt: '2026-08-23T01:00:00.000Z',
            endAt: '2026-11-21T01:00:00.000Z',
          },
        },
      ],
    };
    const client = { GET: vi.fn().mockResolvedValue({ data: { data: completed } }) };

    const result = await getBackofficeOrder(client, ORDER.id);

    expect(result.items[0]?.warranty).toMatchObject({
      warrantyCode: 'RPH-W-20260823-23456789',
      status: 'ACTIVE',
    });
    expect(result.pickupStore).toEqual({
      code: 'HCM-STORE-01',
      name: 'Cửa hàng Hồ Chí Minh',
    });
    expect(result.reservations[0]).toMatchObject({ holdReason: 'PICKUP', quantity: 1 });
    expect(result).not.toHaveProperty('evidenceObjectPath');
  });

  it('posts only the cash confirmation flag and maps stable domain conflicts', async () => {
    const client = {
      POST: vi.fn().mockResolvedValue({ data: { data: ORDER } }),
    };

    await completePickup(client, ORDER.id, { confirmCashCollected: true });

    expect(client.POST).toHaveBeenCalledWith('/api/v1/backoffice/orders/{id}/complete-pickup', {
      params: { path: { id: ORDER.id } },
      body: { confirmCashCollected: true },
    });
    expect(
      fulfillmentError(
        { error: { code: 'ORDER_NOT_FULLY_PAID', message: 'unsafe provider detail' } },
        'fallback',
      ),
    ).toBe('Đơn chưa được xác nhận thu đủ số tiền còn lại.');
  });
});
