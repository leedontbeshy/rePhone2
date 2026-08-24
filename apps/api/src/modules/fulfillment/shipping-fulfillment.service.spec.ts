/* eslint-disable @typescript-eslint/require-await */
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { ApiError } from '../../common/errors/api-error.js';
import type { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import type {
  FulfillmentInventoryGateway,
  FulfillmentReservation,
} from '../inventory/fulfillment-inventory.gateway.js';
import type { OrderNotificationService } from '../notifications/order-notification.service.js';
import type {
  FulfillmentOrderGateway,
  FulfillmentOrderRecord,
} from '../order-transaction-ports/fulfillment-order.gateway.js';
import type {
  FulfillmentPaymentGateway,
  LockedOrderFinance,
} from '../payments/fulfillment-payment.gateway.js';
import type { CheckoutSettingsReader } from '../settings/checkout-settings.reader.js';
import type { FulfillmentVoucherGateway } from '../vouchers/fulfillment-voucher.gateway.js';
import { ShipmentFinalizationService } from './shipment-finalization.service.js';
import { ShipmentPreparationService } from './shipment-preparation.service.js';
import type { ShipmentGateway, ShipmentRecord } from './shipment.gateway.js';

const NOW = new Date('2026-08-23T10:30:00.000Z');
const SHIPPED_AT = new Date('2026-08-23T10:00:00.000Z');
const ORDER_ID = cryptoId(1);
const SHIPMENT_ID = cryptoId(2);
const LOCATION_ID = cryptoId(3);
const ITEM_ID = cryptoId(4);
const VARIANT_ID = cryptoId(5);
const USER_ID = cryptoId(6);
const request = {
  id: 'request-slice09-unit',
  ip: '127.0.0.1',
  socket: { remoteAddress: '127.0.0.1' },
  get: vi.fn(() => undefined),
} as unknown as Request;
const auth = { userId: USER_ID } as AuthContext;
const createInput = {
  carrierName: 'Giao Hang Nhanh',
  trackingCode: 'GHN-001',
  trackingUrl: 'https://tracking.example/GHN-001',
};

describe('ShipmentPreparationService', () => {
  it('locks finance before reservation proof and returns 201 metadata for a new shipment', async () => {
    const sequence: string[] = [];
    const order = shippingOrder();
    const createdShipment = shipment();
    const transaction = {} as Prisma.TransactionClient;
    const lockFinance = vi.fn(async () => {
      sequence.push('finance');
      return verifiedDepositFinance();
    });
    const lockActiveReservations = vi.fn(async () => {
      sequence.push('reservations');
      return [reservation('ACTIVE', null)];
    });
    const create = vi.fn(async () => {
      sequence.push('shipment-create');
      return createdShipment;
    });
    const service = preparationService({
      orders: {
        lock: vi.fn(async () => {
          sequence.push('order');
          return order;
        }),
        findById: vi.fn(async () => order),
      },
      shipments: { create, findById: vi.fn(async () => createdShipment) },
      payments: { lockFinance },
      inventory: {
        lockActiveReservations,
        assertShippingHold: vi.fn(() => sequence.push('reservation-proof')),
      },
      transactions: transactionRunner(transaction),
      audit: {
        write: vi.fn(async () => {
          sequence.push('audit');
        }),
      },
    });

    await expect(service.create(ORDER_ID, createInput, auth, request)).resolves.toMatchObject({
      created: true,
      shipment: { id: SHIPMENT_ID, status: 'CREATED' },
    });
    expect(sequence).toEqual([
      'order',
      'finance',
      'reservations',
      'reservation-proof',
      'shipment-create',
      'audit',
    ]);
  });

  it('replays only an exact CREATED shipment and rejects a later-state duplicate', async () => {
    const exact = shipment();
    const lockFinance = vi.fn();
    const exactService = preparationService({
      orders: {
        lock: vi.fn(async () => shippingOrder({ shipments: [exact] })),
      },
      shipments: { findById: vi.fn(async () => exact) },
      payments: { lockFinance },
    });
    await expect(exactService.create(ORDER_ID, createInput, auth, request)).resolves.toMatchObject({
      created: false,
      shipment: { id: SHIPMENT_ID },
    });
    expect(lockFinance).not.toHaveBeenCalled();

    const progressed = shipment({ status: 'HANDED_TO_CARRIER', shippedAt: SHIPPED_AT });
    const progressedService = preparationService({
      orders: {
        lock: vi.fn(async () => shippingOrder({ shipments: [progressed] })),
      },
    });
    await expect(
      progressedService.create(ORDER_ID, createInput, auth, request),
    ).rejects.toMatchObject({ code: 'DUPLICATE_RESOURCE' } satisfies Partial<ApiError>);
  });

  it('reads a concurrent unique-index winner as an exact 200 replay', async () => {
    const winner = shipment();
    const service = preparationService({
      shipments: { findByOrderId: vi.fn(async () => winner) },
      transactions: {
        run: vi.fn(async () =>
          Promise.reject(Object.assign(new Error('unique conflict'), { code: 'P2002' })),
        ),
      },
    });

    await expect(service.create(ORDER_ID, createInput, auth, request)).resolves.toMatchObject({
      created: false,
      shipment: { id: SHIPMENT_ID, status: 'CREATED' },
    });
  });

  it('rejects creation before reservation reads when the deposit is not verified', async () => {
    const lockActiveReservations = vi.fn();
    const service = preparationService({
      orders: { lock: vi.fn(async () => shippingOrder()) },
      payments: { lockFinance: vi.fn(async () => ({ payments: [], refunds: [] })) },
      inventory: { lockActiveReservations },
    });

    await expect(service.create(ORDER_ID, createInput, auth, request)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    } satisfies Partial<ApiError>);
    expect(lockActiveReservations).not.toHaveBeenCalled();
  });

  it('keeps handover locks ordered Order, Shipment, finance, reservations and targets', async () => {
    const sequence: string[] = [];
    const created = shipment();
    const preparing = shippingOrder({ shipments: [created] });
    const handed = shipment({ status: 'HANDED_TO_CARRIER', shippedAt: SHIPPED_AT });
    const inTransit = shippingOrder({ fulfillmentStatus: 'IN_TRANSIT', shipments: [handed] });
    const transaction = {
      shipment: { updateMany: vi.fn(async () => ({ count: 1 })) },
      order: { updateMany: vi.fn(async () => ({ count: 1 })) },
    } as unknown as Prisma.TransactionClient;
    const sendShipmentHandedOver = vi.fn(async () => undefined);
    const service = preparationService({
      orders: {
        lock: vi.fn(async () => {
          sequence.push('order');
          return preparing;
        }),
        findById: vi.fn(async () => inTransit),
      },
      shipments: {
        findOrderId: vi.fn(async () => ({ orderId: ORDER_ID })),
        lock: vi.fn(async () => {
          sequence.push('shipment');
          return created;
        }),
      },
      payments: {
        lockFinance: vi.fn(async () => {
          sequence.push('finance');
          return verifiedDepositFinance();
        }),
      },
      inventory: {
        lockActiveReservations: vi.fn(async () => {
          sequence.push('reservations');
          return [reservation('ACTIVE', null)];
        }),
        assertShippingHold: vi.fn(),
        handoverShipping: vi.fn(async () => {
          sequence.push('targets');
        }),
      },
      transactions: transactionRunner(transaction),
      audit: { write: vi.fn(async () => sequence.push('audit')) },
      notifications: { sendShipmentHandedOver },
    });

    await expect(service.handOver(SHIPMENT_ID, auth, request)).resolves.toMatchObject({
      fulfillmentStatus: 'IN_TRANSIT',
    });
    expect(sequence.slice(0, 5)).toEqual([
      'order',
      'shipment',
      'finance',
      'reservations',
      'targets',
    ]);
    expect(sendShipmentHandedOver).toHaveBeenCalledOnce();
  });
});

describe('ShipmentFinalizationService', () => {
  it('revalidates consumed handover proof before COD, inventory, voucher and warranty writes', async () => {
    const sequence: string[] = [];
    const handed = shipment({ status: 'HANDED_TO_CARRIER', shippedAt: SHIPPED_AT });
    const inTransit = shippingOrder({ fulfillmentStatus: 'IN_TRANSIT', shipments: [handed] });
    const delivered = shipment({
      status: 'DELIVERED',
      shippedAt: SHIPPED_AT,
      deliveredAt: NOW,
    });
    const completed = shippingOrder({
      status: 'COMPLETED',
      fulfillmentStatus: 'COMPLETED',
      paymentStatus: 'PAID',
      balanceDue: 0n,
      paidAmount: 1_000n,
      completedAt: NOW,
      shipments: [delivered],
    });
    const finance = verifiedDepositFinance();
    const proof = { reservations: [reservation('CONSUMED', SHIPPED_AT)], movements: [] };
    const transaction = {
      shipment: { updateMany: vi.fn(async () => ({ count: 1 })) },
      order: { updateMany: vi.fn(async () => ({ count: 1 })) },
    } as unknown as Prisma.TransactionClient;
    const createVerifiedCod = vi.fn(async () => {
      sequence.push('cod');
    });
    const assertShippingCompletionProof = vi.fn(() => sequence.push('reservation-proof'));
    const sendCompleted = vi.fn(async () => undefined);
    const service = finalizationService({
      orders: {
        lock: vi.fn(async () => {
          sequence.push('order');
          return inTransit;
        }),
        findById: vi.fn(async () => completed),
      },
      shipments: {
        findOrderId: vi.fn(async () => ({ orderId: ORDER_ID })),
        lock: vi.fn(async () => {
          sequence.push('shipment');
          return handed;
        }),
      },
      payments: {
        lockFinance: vi.fn(async () => {
          sequence.push('finance');
          return finance;
        }),
        project: projectFinance,
        createVerifiedCod,
      },
      inventory: {
        lockShippingCompletionProof: vi.fn(async () => {
          sequence.push('reservations');
          return proof;
        }),
        assertShippingCompletionProof,
        completeShipping: vi.fn(async () => {
          sequence.push('targets');
        }),
      },
      vouchers: {
        consume: vi.fn(async () => {
          sequence.push('voucher');
        }),
      },
      settings: { read: vi.fn(async () => ({ timezone: 'Asia/Ho_Chi_Minh' })) },
      warranties: {
        issueForOrder: vi.fn(async () => {
          sequence.push('warranty');
          return [];
        }),
      },
      transactions: transactionRunner(transaction),
      audit: { write: vi.fn(async () => sequence.push('audit')) },
      notifications: { sendCompleted },
    });

    await expect(
      service.markDelivered(SHIPMENT_ID, { confirmCodCollected: true }, auth, request),
    ).resolves.toMatchObject({ status: 'COMPLETED', fulfillmentStatus: 'COMPLETED' });
    expect(sequence.slice(0, 8)).toEqual([
      'order',
      'shipment',
      'finance',
      'reservations',
      'reservation-proof',
      'cod',
      'targets',
      'voucher',
    ]);
    expect(assertShippingCompletionProof).toHaveBeenCalledWith(
      proof.reservations,
      proof.movements,
      ORDER_ID,
      inTransit.items,
      LOCATION_ID,
      SHIPPED_AT,
    );
    expect(createVerifiedCod).toHaveBeenCalledWith(ORDER_ID, 900n, USER_ID, NOW, transaction);
    expect(sequence).toContain('warranty');
    expect(sendCompleted).toHaveBeenCalledOnce();
  });

  it('replays delivered state without creating a second COD payment or audit record', async () => {
    const delivered = shipment({
      status: 'DELIVERED',
      shippedAt: SHIPPED_AT,
      deliveredAt: NOW,
    });
    const completed = shippingOrder({
      status: 'COMPLETED',
      fulfillmentStatus: 'COMPLETED',
      paymentStatus: 'PAID',
      paidAmount: 1_000n,
      balanceDue: 0n,
      completedAt: NOW,
      shipments: [delivered],
    });
    const createVerifiedCod = vi.fn();
    const auditWrite = vi.fn();
    const sendCompleted = vi.fn();
    const lockFinance = vi.fn();
    const service = finalizationService({
      orders: { lock: vi.fn(async () => completed), findById: vi.fn(async () => completed) },
      shipments: {
        findOrderId: vi.fn(async () => ({ orderId: ORDER_ID })),
        lock: vi.fn(async () => delivered),
      },
      payments: { lockFinance, createVerifiedCod },
      audit: { write: auditWrite },
      notifications: { sendCompleted },
    });

    await expect(
      service.markDelivered(SHIPMENT_ID, { confirmCodCollected: true }, auth, request),
    ).resolves.toMatchObject({ status: 'COMPLETED' });
    expect(lockFinance).not.toHaveBeenCalled();
    expect(createVerifiedCod).not.toHaveBeenCalled();
    expect(auditWrite).not.toHaveBeenCalled();
    expect(sendCompleted).not.toHaveBeenCalled();
  });

  it('rejects COD confirmation on a zero-balance shipment', async () => {
    const handed = shipment({ status: 'HANDED_TO_CARRIER', shippedAt: SHIPPED_AT });
    const zero = shippingOrder({
      fulfillmentStatus: 'IN_TRANSIT',
      grandTotal: 0n,
      depositRequired: 0n,
      balanceDue: 0n,
      shipments: [handed],
    });
    const service = finalizationService({
      orders: { lock: vi.fn(async () => zero) },
      shipments: {
        findOrderId: vi.fn(async () => ({ orderId: ORDER_ID })),
        lock: vi.fn(async () => handed),
      },
      payments: {
        lockFinance: vi.fn(async () => ({ payments: [], refunds: [] })),
        project: projectFinance,
      },
      inventory: {
        lockShippingCompletionProof: vi.fn(async () => ({
          reservations: [reservation('CONSUMED', SHIPPED_AT)],
          movements: [],
        })),
        assertShippingCompletionProof: vi.fn(),
      },
    });

    await expect(
      service.markDelivered(SHIPMENT_ID, { confirmCodCollected: true }, auth, request),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [expect.objectContaining({ code: 'COD_NOT_REQUIRED' })],
    });
  });

  it('rejects a returned shipment target outside STORE or WAREHOUSE before inventory writes', async () => {
    const failed = shipment({
      status: 'FAILED',
      shippedAt: SHIPPED_AT,
      failedAt: NOW,
      failureReason: 'Khach khong nhan hang',
    });
    const failedOrder = shippingOrder({ fulfillmentStatus: 'FAILED', shipments: [failed] });
    const returnShipping = vi.fn();
    const transaction = {
      inventoryLocation: {
        findUnique: vi.fn(async () => ({
          id: LOCATION_ID,
          status: 'ACTIVE',
          type: 'SERVICE_CENTER',
        })),
      },
    } as unknown as Prisma.TransactionClient;
    const service = finalizationService({
      orders: { lock: vi.fn(async () => failedOrder) },
      shipments: {
        findOrderId: vi.fn(async () => ({ orderId: ORDER_ID })),
        lock: vi.fn(async () => failed),
      },
      inventory: { returnShipping },
      transactions: transactionRunner(transaction),
    });

    await expect(
      service.markReturned(
        SHIPMENT_ID,
        { returnedToLocationId: LOCATION_ID, reason: 'Khach khong nhan hang' },
        auth,
        request,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' } satisfies Partial<ApiError>);
    expect(returnShipping).not.toHaveBeenCalled();
  });
});

interface PreparationOverrides {
  orders?: object;
  shipments?: object;
  payments?: object;
  inventory?: object;
  transactions?: object;
  audit?: object;
  notifications?: object;
}

function preparationService(overrides: PreparationOverrides): ShipmentPreparationService {
  const transaction = {} as Prisma.TransactionClient;
  return new ShipmentPreparationService(
    {
      lock: vi.fn(async () => shippingOrder()),
      findById: vi.fn(async () => shippingOrder()),
      ...overrides.orders,
    } as unknown as FulfillmentOrderGateway,
    {
      findOrderId: vi.fn(async () => ({ orderId: ORDER_ID })),
      findById: vi.fn(async () => shipment()),
      findByOrderId: vi.fn(async () => null),
      lock: vi.fn(async () => shipment()),
      create: vi.fn(async () => shipment()),
      ...overrides.shipments,
    } as unknown as ShipmentGateway,
    {
      lockFinance: vi.fn(async () => verifiedDepositFinance()),
      ...overrides.payments,
    } as unknown as FulfillmentPaymentGateway,
    {
      lockActiveReservations: vi.fn(async () => [reservation('ACTIVE', null)]),
      assertShippingHold: vi.fn(),
      handoverShipping: vi.fn(async () => undefined),
      ...overrides.inventory,
    } as unknown as FulfillmentInventoryGateway,
    {
      ...transactionRunner(transaction),
      ...overrides.transactions,
    } as unknown as SerializableTransactionRunner,
    { write: vi.fn(async () => undefined), ...overrides.audit } as unknown as AuditWriter,
    {
      sendShipmentHandedOver: vi.fn(async () => undefined),
      ...overrides.notifications,
    } as unknown as OrderNotificationService,
    { now: () => NOW },
  );
}

interface FinalizationOverrides {
  orders?: object;
  shipments?: object;
  payments?: object;
  inventory?: object;
  vouchers?: object;
  warranties?: object;
  settings?: object;
  transactions?: object;
  audit?: object;
  notifications?: object;
}

function finalizationService(overrides: FinalizationOverrides): ShipmentFinalizationService {
  const transaction = {
    shipment: { updateMany: vi.fn(async () => ({ count: 1 })) },
    order: { updateMany: vi.fn(async () => ({ count: 1 })) },
  } as unknown as Prisma.TransactionClient;
  return new ShipmentFinalizationService(
    {
      lock: vi.fn(async () => shippingOrder({ fulfillmentStatus: 'IN_TRANSIT' })),
      findById: vi.fn(async () => shippingOrder()),
      ...overrides.orders,
    } as unknown as FulfillmentOrderGateway,
    {
      findOrderId: vi.fn(async () => ({ orderId: ORDER_ID })),
      lock: vi.fn(async () => shipment({ status: 'HANDED_TO_CARRIER', shippedAt: SHIPPED_AT })),
      ...overrides.shipments,
    } as unknown as ShipmentGateway,
    {
      lockFinance: vi.fn(async () => verifiedDepositFinance()),
      project: projectFinance,
      createVerifiedCod: vi.fn(async () => undefined),
      ...overrides.payments,
    } as unknown as FulfillmentPaymentGateway,
    {
      lockShippingCompletionProof: vi.fn(async () => ({
        reservations: [reservation('CONSUMED', SHIPPED_AT)],
        movements: [],
      })),
      assertShippingCompletionProof: vi.fn(),
      completeShipping: vi.fn(async () => undefined),
      returnShipping: vi.fn(async () => undefined),
      ...overrides.inventory,
    } as unknown as FulfillmentInventoryGateway,
    {
      consume: vi.fn(async () => undefined),
      ...overrides.vouchers,
    } as unknown as FulfillmentVoucherGateway,
    {
      issueForOrder: vi.fn(async () => []),
      ...overrides.warranties,
    },
    {
      read: vi.fn(async () => ({ timezone: 'Asia/Ho_Chi_Minh' })),
      ...overrides.settings,
    } as unknown as CheckoutSettingsReader,
    {
      ...transactionRunner(transaction),
      ...overrides.transactions,
    } as unknown as SerializableTransactionRunner,
    { write: vi.fn(async () => undefined), ...overrides.audit } as unknown as AuditWriter,
    {
      sendCompleted: vi.fn(async () => undefined),
      ...overrides.notifications,
    } as unknown as OrderNotificationService,
    { now: () => NOW },
  );
}

function transactionRunner(transaction: Prisma.TransactionClient) {
  return {
    run: vi.fn(
      async (
        _operation: string,
        work: (client: Prisma.TransactionClient) => Promise<unknown>,
      ): Promise<unknown> => work(transaction),
    ),
  };
}

function verifiedDepositFinance(): LockedOrderFinance {
  return {
    payments: [
      {
        id: cryptoId(7),
        purpose: 'DEPOSIT',
        method: 'BANK_TRANSFER',
        status: 'VERIFIED',
        expectedAmount: '100',
        receivedAmount: '100',
      },
    ],
    refunds: [],
  };
}

function projectFinance(grandTotal: bigint, finance: LockedOrderFinance) {
  const paidAmount = finance.payments
    .filter(({ status }) => status === 'VERIFIED')
    .reduce((sum, payment) => sum + BigInt(payment.receivedAmount ?? payment.expectedAmount), 0n);
  const balanceDue = grandTotal > paidAmount ? grandTotal - paidAmount : 0n;
  return {
    paidAmount,
    refundedAmount: 0n,
    balanceDue,
    paymentStatus: balanceDue === 0n ? ('PAID' as const) : ('PARTIALLY_PAID' as const),
  };
}

function shippingOrder(overrides: Record<string, unknown> = {}): FulfillmentOrderRecord {
  return {
    id: ORDER_ID,
    orderNumber: 'RPH-20260823-SHIP0001',
    customerId: null,
    customerName: 'Nguyen Van Test',
    customerEmail: 'customer@example.com',
    customerPhone: '0900000000',
    fulfillmentType: 'SHIPPING',
    fulfillmentStatus: 'PREPARING',
    fulfillmentLocationId: LOCATION_ID,
    shippingAddressSnapshot: { city: 'Ho Chi Minh' },
    pickupLocationId: null,
    pickupHoldUntil: null,
    pickupReadyAt: null,
    pickedUpAt: null,
    status: 'PROCESSING',
    paymentStatus: 'PARTIALLY_PAID',
    subtotal: 900n,
    itemDiscountAmount: 0n,
    voucherDiscountAmount: 0n,
    shippingFeeOriginal: 100n,
    shippingFee: 100n,
    shippingFeeOverrideReason: null,
    shippingFeeOverriddenById: null,
    shippingFeeOverriddenAt: null,
    grandTotal: 1_000n,
    depositRequired: 100n,
    paidAmount: 100n,
    refundedAmount: 0n,
    balanceDue: 900n,
    voucherCodeSnapshot: null,
    customerNote: null,
    internalNote: null,
    cancelReason: null,
    placedAt: new Date('2026-08-23T08:00:00.000Z'),
    confirmedAt: new Date('2026-08-23T09:00:00.000Z'),
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-08-23T08:00:00.000Z'),
    updatedAt: new Date('2026-08-23T09:00:00.000Z'),
    fulfillmentLocation: {
      id: LOCATION_ID,
      code: 'HCM-WH-01',
      name: 'Kho HCM',
      type: 'WAREHOUSE',
      status: 'ACTIVE',
    },
    pickupLocation: null,
    shippingFeeOverriddenBy: null,
    items: [
      {
        id: ITEM_ID,
        orderId: ORDER_ID,
        productId: cryptoId(8),
        variantId: VARIANT_ID,
        inventoryUnitId: null,
        productTypeSnapshot: 'ACCESSORY',
        productNameSnapshot: 'Op lung',
        variantNameSnapshot: 'Den',
        skuSnapshot: 'CASE-001',
        inventoryCodeSnapshot: null,
        configurationSnapshot: null,
        quantity: 1,
        unitPrice: 900n,
        lineSubtotal: 900n,
        discountAmount: 0n,
        lineTotal: 900n,
        warrantyDaysSnapshot: 0,
        warrantyTermsSnapshot: null,
        createdAt: new Date('2026-08-23T08:00:00.000Z'),
        warranty: null,
      },
    ],
    payments: [],
    refunds: [],
    reservations: [],
    shipments: [],
    voucherUsage: null,
    ...overrides,
  } as unknown as FulfillmentOrderRecord;
}

function shipment(overrides: Record<string, unknown> = {}): ShipmentRecord {
  return {
    id: SHIPMENT_ID,
    orderId: ORDER_ID,
    attemptNumber: 1,
    carrierName: createInput.carrierName,
    trackingCode: createInput.trackingCode,
    trackingUrl: createInput.trackingUrl,
    status: 'CREATED',
    shippedAt: null,
    deliveredAt: null,
    failedAt: null,
    returnedAt: null,
    failureReason: null,
    returnedToLocationId: null,
    returnNote: null,
    createdById: USER_ID,
    createdAt: new Date('2026-08-23T09:30:00.000Z'),
    updatedAt: new Date('2026-08-23T09:30:00.000Z'),
    createdBy: {
      id: USER_ID,
      fullName: 'Nhan vien Test',
      employeeCode: 'EMP-001',
    },
    returnedToLocation: null,
    ...overrides,
  };
}

function reservation(
  status: FulfillmentReservation['status'],
  consumedAt: Date | null,
): FulfillmentReservation {
  return {
    id: cryptoId(9),
    orderId: ORDER_ID,
    orderItemId: ITEM_ID,
    inventoryUnitId: null,
    stockLevelId: cryptoId(10),
    quantity: 1,
    status,
    holdReason: 'FULFILLMENT',
    expiresAt: null,
    consumedAt,
    orderItem: {
      id: ITEM_ID,
      orderId: ORDER_ID,
      inventoryUnitId: null,
      variantId: VARIANT_ID,
      quantity: 1,
    },
    inventoryUnit: null,
    stockLevel: { locationId: LOCATION_ID, variantId: VARIANT_ID },
  };
}

function cryptoId(suffix: number): string {
  return `0198e5a0-0000-7000-8000-${suffix.toString().padStart(12, '0')}`;
}
