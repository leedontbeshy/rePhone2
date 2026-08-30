import { describe, expect, it, vi } from 'vitest';
import {
  cancelBackofficeOrder,
  completePickup,
  createShipment,
  fulfillmentError,
  getBackofficeOrder,
  handOverShipment,
  listActiveReturnLocations,
  listBackofficeOrders,
  markShipmentDelivered,
  markShipmentFailed,
  markShipmentReturned,
  overrideShippingFee,
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
    shippingFeeOriginal: '0',
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
  refundableAmount: '0',
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

  it('drops deprecated and unknown actions instead of inventing an allowed command', async () => {
    const client = {
      GET: vi.fn().mockResolvedValue({
        data: {
          data: {
            ...ORDER,
            availableActions: ['CONFIRM_PICKUP', 'UNKNOWN_ACTION', 'CONFIRM'],
          },
        },
      }),
    };

    await expect(getBackofficeOrder(client, ORDER.id)).resolves.toMatchObject({
      availableActions: ['CONFIRM'],
    });
  });

  it.each([
    ['trạng thái đơn hàng', { status: 'UNKNOWN' }, 'Trạng thái đơn hàng'],
    ['tình trạng giao nhận', { fulfillmentStatus: 'UNKNOWN' }, 'Tình trạng giao nhận'],
    ['tình trạng thanh toán', { paymentStatus: 'UNKNOWN' }, 'Tình trạng thanh toán'],
    ['cách nhận hàng', { fulfillmentType: 'UNKNOWN' }, 'Cách nhận hàng'],
    ['tổng tiền', { pricing: { ...ORDER.pricing, grandTotal: 'không-hợp-lệ' } }, 'Tổng tiền'],
    ['số tiền còn có thể hoàn', { refundableAmount: '-1' }, 'Số tiền còn có thể hoàn'],
  ])('rejects a malformed required %s field', async (_label, override, expectedMessage) => {
    const client = {
      GET: vi.fn().mockResolvedValue({ data: { data: { ...ORDER, ...override } } }),
    };

    await expect(getBackofficeOrder(client, ORDER.id)).rejects.toThrow(expectedMessage);
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

  it('maps shipping actions, override metadata and only safe tracking URLs', async () => {
    const shipping = {
      ...ORDER,
      fulfillmentType: 'SHIPPING',
      fulfillmentStatus: 'IN_TRANSIT',
      pickupHoldUntil: null,
      pickupReadyAt: null,
      shippingAddress: { addressLine: '1 Nguyễn Huệ', province: 'TP.HCM' },
      pricing: {
        ...ORDER.pricing,
        shippingFeeOriginal: '30000',
        shippingFee: '50000',
        shippingFeeOverride: {
          reason: 'Điều chỉnh theo kích thước kiện hàng',
          overriddenAt: '2026-08-23T00:10:00.000Z',
          overriddenBy: {
            id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67ff',
            fullName: 'Nhân viên Demo',
            employeeCode: 'EMP001',
          },
        },
      },
      shipments: [
        {
          id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6700',
          orderId: ORDER.id,
          attemptNumber: 1,
          carrierName: 'Giao hàng demo',
          trackingCode: 'DEMO-001',
          trackingUrl: 'https://carrier-user:carrier-password@unsafe.example/DEMO-001',
          status: 'HANDED_TO_CARRIER',
          shippedAt: '2026-08-23T01:00:00.000Z',
          deliveredAt: null,
          failedAt: null,
          returnedAt: null,
          failureReason: null,
          returnedToLocation: null,
          returnNote: null,
          createdBy: {
            id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67ff',
            fullName: 'Nhân viên Demo',
            employeeCode: 'EMP001',
          },
        },
      ],
      availableActions: ['MARK_SHIPMENT_DELIVERED', 'MARK_SHIPMENT_FAILED'],
    };
    const client = { GET: vi.fn().mockResolvedValue({ data: { data: shipping } }) };

    const result = await getBackofficeOrder(client, ORDER.id);

    expect(result.fulfillmentType).toBe('SHIPPING');
    expect(result.pickupStore).toBeNull();
    expect(result.pricing.shippingFeeOriginal).toBe('30000');
    expect(result.pricing.shippingFeeOverride).toMatchObject({
      reason: 'Điều chỉnh theo kích thước kiện hàng',
      overriddenBy: { employeeCode: 'EMP001' },
    });
    expect(result.shipments[0]).toMatchObject({
      trackingCode: 'DEMO-001',
      trackingUrl: null,
      createdBy: { fullName: 'Nhân viên Demo' },
    });
    expect(result.availableActions).toEqual(['MARK_SHIPMENT_DELIVERED', 'MARK_SHIPMENT_FAILED']);
  });

  it('uses the six named shipping command contracts', async () => {
    const shipment = {
      id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6700',
      orderId: ORDER.id,
      attemptNumber: 1,
      carrierName: 'Giao hàng demo',
      trackingCode: 'DEMO-001',
      trackingUrl: 'https://tracking.example/DEMO-001',
      status: 'CREATED',
    };
    const client = {
      POST: vi
        .fn()
        .mockResolvedValueOnce({ data: { data: ORDER } })
        .mockResolvedValueOnce({ data: { data: shipment } })
        .mockResolvedValue({ data: { data: ORDER } }),
    };

    await overrideShippingFee(client, ORDER.id, {
      shippingFee: '50000',
      reason: 'Điều chỉnh theo kiện hàng',
    });
    await createShipment(client, ORDER.id, {
      carrierName: 'Giao hàng demo',
      trackingCode: 'DEMO-001',
      trackingUrl: 'https://tracking.example/DEMO-001',
    });
    await handOverShipment(client, shipment.id);
    await markShipmentDelivered(client, shipment.id, { confirmCodCollected: true });
    await markShipmentFailed(client, shipment.id, { reason: 'Khách không nhận hàng' });
    await markShipmentReturned(client, shipment.id, {
      returnedToLocationId: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e0',
      reason: 'Kho đã nhận và kiểm đếm kiện hoàn',
    });

    const calledPaths = client.POST.mock.calls.map((call) => String((call as unknown[])[0]));
    expect(calledPaths).toEqual([
      '/api/v1/backoffice/orders/{id}/override-shipping-fee',
      '/api/v1/backoffice/orders/{id}/shipment',
      '/api/v1/backoffice/shipments/{id}/hand-over',
      '/api/v1/backoffice/shipments/{id}/mark-delivered',
      '/api/v1/backoffice/shipments/{id}/mark-failed',
      '/api/v1/backoffice/shipments/{id}/mark-returned',
    ]);
  });

  it('offers only active inventory locations for a physical return', async () => {
    const client = {
      GET: vi.fn().mockResolvedValue({
        data: {
          data: [
            {
              id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e0',
              code: 'HCM-STORE-01',
              name: 'Cửa hàng Hồ Chí Minh',
              type: 'STORE',
              status: 'ACTIVE',
            },
            {
              id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e9',
              code: 'OLD-WH',
              name: 'Kho ngừng hoạt động',
              type: 'WAREHOUSE',
              status: 'INACTIVE',
            },
          ],
        },
      }),
    };

    await expect(listActiveReturnLocations(client)).resolves.toEqual([
      {
        id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e0',
        code: 'HCM-STORE-01',
        name: 'Cửa hàng Hồ Chí Minh',
        type: 'STORE',
      },
    ]);
    expect(client.GET).toHaveBeenCalledWith('/api/v1/backoffice/inventory-locations');
  });

  it('maps refund actions and uses the named staff cancellation command', async () => {
    const refundableOrder = {
      ...ORDER,
      refundableAmount: '1000000',
      availableActions: ['CANCEL_ORDER', 'CREATE_REFUND'],
    };
    const client = {
      GET: vi.fn().mockResolvedValue({ data: { data: refundableOrder } }),
      POST: vi.fn().mockResolvedValue({ data: { data: refundableOrder } }),
    };

    const detail = await getBackofficeOrder(client, ORDER.id);
    await cancelBackofficeOrder(client, ORDER.id, 'Khách hàng xác nhận hủy đơn');

    expect(detail.refundableAmount).toBe('1000000');
    expect(detail.availableActions).toEqual(['CANCEL_ORDER', 'CREATE_REFUND']);
    expect(client.POST).toHaveBeenCalledWith('/api/v1/backoffice/orders/{id}/cancel', {
      params: { path: { id: ORDER.id } },
      body: { reason: 'Khách hàng xác nhận hủy đơn' },
    });
  });
});
