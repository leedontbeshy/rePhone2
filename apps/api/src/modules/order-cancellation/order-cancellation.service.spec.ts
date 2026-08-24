/* eslint-disable @typescript-eslint/require-await */
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { ApiError } from '../../common/errors/api-error.js';
import type { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import type { CheckoutInventoryGateway } from '../inventory/checkout-inventory.gateway.js';
import type { OrderNotificationService } from '../notifications/order-notification.service.js';
import type { OrderOwnershipPolicy } from '../order-transaction-ports/order-ownership.policy.js';
import type { RefundOrderGateway } from '../order-transaction-ports/refund-order.gateway.js';
import type { RefundCoreGateway } from '../refunds/refund-core.gateway.js';
import type { CheckoutVoucherGateway } from '../vouchers/checkout-voucher.gateway.js';
import { OrderCancellationService } from './order-cancellation.service.js';

const ORDER_ID = cryptoId(1);
const STAFF_ID = cryptoId(2);
const CUSTOMER_ID = cryptoId(3);
const NOW = new Date('2026-08-24T04:00:00.000Z');
const REASON = 'Khách thay đổi nhu cầu nhận hàng';

describe('OrderCancellationService', () => {
  it('cancels an eligible pre-hand-over order and releases every held resource once', async () => {
    const fixture = cancellationFixture(order());

    await expect(
      fixture.service.cancelByStaff(ORDER_ID, REASON, staffAuth(), staffRequest()),
    ).resolves.toEqual({ orderId: ORDER_ID, changed: true });

    expect(fixture.refunds.prepareCancellationRefund).toHaveBeenCalledWith(
      {
        orderId: ORDER_ID,
        reason: REASON,
        now: NOW,
        actor: { requesterType: 'STAFF', requesterId: STAFF_ID },
      },
      fixture.transaction,
    );
    expect(fixture.inventory.releaseOrderReservations).toHaveBeenCalledOnce();
    expect(fixture.vouchers.release).toHaveBeenCalledOnce();
    expect(fixture.orders.markCancelled).toHaveBeenCalledWith(
      ORDER_ID,
      REASON,
      NOW,
      fixture.transaction,
    );
    expect(fixture.audit.write.mock.calls[0]?.[0]).toBe(fixture.transaction);
    expect(fixture.audit.write.mock.calls[0]?.[1]).toMatchObject({ actorUserId: STAFF_ID });
    expect(fixture.audit.write.mock.calls[0]?.[2]).toMatchObject({
      action: 'order.cancelled',
      metadata: {
        reason: REASON,
        refundId: cryptoId(20),
        refundAmount: '500000',
      },
    });
    expect(fixture.notifications.sendCancelled).toHaveBeenCalledOnce();
  });

  it('allows only staff to cancel a returned shipping order', async () => {
    const returned = order({
      status: 'PROCESSING',
      fulfillmentType: 'SHIPPING',
      fulfillmentStatus: 'RETURNED',
      shipments: [{ id: cryptoId(10), status: 'RETURNED' }],
    });
    const staffFixture = cancellationFixture(returned);
    await expect(
      staffFixture.service.cancelByStaff(ORDER_ID, REASON, staffAuth(), staffRequest()),
    ).resolves.toEqual({ orderId: ORDER_ID, changed: true });

    const ownerFixture = cancellationFixture(returned);
    await expect(
      ownerFixture.service.cancelOwned(customerRequest(), 'RPH-20260824-CANCEL01', REASON),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' } satisfies Partial<ApiError>);
    expect(ownerFixture.refunds.prepareCancellationRefund).not.toHaveBeenCalled();
    expect(ownerFixture.inventory.releaseOrderReservations).not.toHaveBeenCalled();
  });

  it.each([
    [
      'shipment in transit',
      order({
        status: 'PROCESSING',
        fulfillmentType: 'SHIPPING',
        fulfillmentStatus: 'IN_TRANSIT',
        shipments: [{ id: cryptoId(10), status: 'HANDED_TO_CARRIER' }],
      }),
    ],
    [
      'failed shipment that has not returned',
      order({
        status: 'PROCESSING',
        fulfillmentType: 'SHIPPING',
        fulfillmentStatus: 'FAILED',
        shipments: [{ id: cryptoId(10), status: 'FAILED' }],
      }),
    ],
    ['completed order', order({ status: 'COMPLETED', fulfillmentStatus: 'COMPLETED' })],
  ])('rejects staff cancellation for %s before any finance mutation', async (_label, record) => {
    const fixture = cancellationFixture(record);

    await expect(
      fixture.service.cancelByStaff(ORDER_ID, REASON, staffAuth(), staffRequest()),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' } satisfies Partial<ApiError>);

    expect(fixture.refunds.prepareCancellationRefund).not.toHaveBeenCalled();
    expect(fixture.orders.markCancelled).not.toHaveBeenCalled();
    expect(fixture.audit.write).not.toHaveBeenCalled();
  });

  it('replays an already cancelled order without releasing, auditing or notifying twice', async () => {
    const fixture = cancellationFixture(
      order({ status: 'CANCELLED', fulfillmentStatus: 'CANCELLED' }),
    );

    await expect(
      fixture.service.cancelByStaff(ORDER_ID, REASON, staffAuth(), staffRequest()),
    ).resolves.toEqual({ orderId: ORDER_ID, changed: false });

    expect(fixture.refunds.prepareCancellationRefund).not.toHaveBeenCalled();
    expect(fixture.inventory.releaseOrderReservations).not.toHaveBeenCalled();
    expect(fixture.vouchers.release).not.toHaveBeenCalled();
    expect(fixture.audit.write).not.toHaveBeenCalled();
    expect(fixture.notifications.sendCancelled).not.toHaveBeenCalled();
  });

  it('uses a guest audit actor and customer refund requester without persisting a raw credential', async () => {
    const request = guestRequest();
    const fixture = cancellationFixture(order());

    await fixture.service.cancelOwned(request, 'RPH-20260824-CANCEL01', REASON);

    expect(fixture.ownership.assertAccess).toHaveBeenCalledTimes(2);
    expect(fixture.refunds.prepareCancellationRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { requesterType: 'CUSTOMER', requesterId: null },
      }),
      fixture.transaction,
    );
    expect(fixture.audit.write).toHaveBeenCalledWith(
      fixture.transaction,
      expect.objectContaining({ actorType: 'GUEST', requestId: 'request-guest' }),
      expect.anything(),
    );
    expect(JSON.stringify(fixture.audit.write.mock.calls)).not.toContain('guest-secret');
  });
});

type TestOrder = ReturnType<typeof order>;

function cancellationFixture(record: TestOrder) {
  const shipmentUpdateMany = vi.fn(async () => ({ count: 1 }));
  const transaction = {
    $queryRaw: vi.fn(async () => []),
    order: {
      findUnique: vi.fn(async () => record),
    },
    cart: {
      findUnique: vi.fn(async () => record.sourceCart),
    },
    shipment: {
      findMany: vi.fn(
        async (input: { select: { id?: boolean; status?: boolean } }) =>
          input.select.id === true
            ? record.shipments.map(({ id }) => ({ id }))
            : record.shipments.map(({ status }) => ({ status })),
      ),
      updateMany: shipmentUpdateMany,
    },
  } as unknown as Prisma.TransactionClient;
  const transactions = {
    run: vi.fn(
      async (
        _operation: string,
        work: (client: Prisma.TransactionClient) => Promise<unknown>,
      ): Promise<unknown> => work(transaction),
    ),
  };
  const prisma = {
    order: {
      findUnique: vi.fn(async (input: { include?: unknown; select?: unknown }) =>
        input.include === undefined
          ? {
              id: ORDER_ID,
              orderNumber: record.orderNumber,
              customerEmail: record.customerEmail,
              cancelReason: REASON,
              refunds: [{ status: 'REQUESTED', amount: 500_000n }],
            }
          : record,
      ),
    },
  };
  const ownership = { assertAccess: vi.fn() };
  const orders = {
    lockById: vi.fn(async () => ({
      id: ORDER_ID,
      orderNumber: record.orderNumber,
      status: record.status,
      grandTotal: '1000000',
    })),
    markCancelled: vi.fn(async () => ({ count: 1 })),
  };
  const inventory = { releaseOrderReservations: vi.fn(async () => undefined) };
  const vouchers = { release: vi.fn(async () => undefined) };
  const refunds = {
    prepareCancellationRefund: vi.fn(async () => ({ id: cryptoId(20), amount: '500000' })),
  };
  const audit = {
    write: vi.fn(async (auditTransaction: unknown, actor: unknown, entry: unknown) => {
      void auditTransaction;
      void actor;
      void entry;
    }),
  };
  const notifications = { sendCancelled: vi.fn(async () => undefined) };
  const service = new OrderCancellationService(
    prisma as unknown as PrismaService,
    transactions as unknown as SerializableTransactionRunner,
    ownership as unknown as OrderOwnershipPolicy,
    orders as unknown as RefundOrderGateway,
    inventory as unknown as CheckoutInventoryGateway,
    vouchers as unknown as CheckoutVoucherGateway,
    refunds as unknown as RefundCoreGateway,
    audit as unknown as AuditWriter,
    notifications as unknown as OrderNotificationService,
    { now: () => NOW },
  );
  return {
    service,
    transaction,
    transactions,
    prisma,
    ownership,
    orders,
    inventory,
    vouchers,
    refunds,
    audit,
    notifications,
    shipmentUpdateMany,
  };
}

function order(
  overrides: Partial<{
    status: 'PLACED' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
    fulfillmentType: 'PICKUP' | 'SHIPPING';
    fulfillmentStatus:
      | 'PENDING'
      | 'PREPARING'
      | 'READY'
      | 'IN_TRANSIT'
      | 'COMPLETED'
      | 'FAILED'
      | 'RETURNED'
      | 'CANCELLED';
    shipments: Array<{ id: string; status: string }>;
  }> = {},
) {
  return {
    id: ORDER_ID,
    orderNumber: 'RPH-20260824-CANCEL01',
    sourceCartId: cryptoId(30),
    sourceCart: {
      status: 'CONVERTED',
      guestTokenHash: null,
      expiresAt: null,
    },
    customerId: CUSTOMER_ID,
    guestAccessTokenHash: null,
    customerEmail: 'customer@example.com',
    status: 'PLACED' as const,
    fulfillmentType: 'PICKUP' as const,
    fulfillmentStatus: 'PENDING' as const,
    shipments: [] as Array<{ id: string; status: string }>,
    ...overrides,
  };
}

function staffAuth(): AuthContext {
  return { userId: STAFF_ID, role: 'EMPLOYEE' } as AuthContext;
}

function staffRequest(): Request {
  return request('request-staff', { userId: STAFF_ID, role: 'EMPLOYEE' } as AuthContext);
}

function customerRequest(): Request {
  return request('request-customer', {
    userId: CUSTOMER_ID,
    role: 'CUSTOMER',
  } as AuthContext);
}

function guestRequest(): Request {
  return request('request-guest');
}

function request(id: string, auth?: AuthContext): Request {
  return {
    id,
    auth,
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    get: vi.fn((name: string) => (name === 'user-agent' ? 'vitest' : undefined)),
  } as unknown as Request;
}

function cryptoId(suffix: number): string {
  return `0198e5a0-0000-7000-8000-${suffix.toString().padStart(12, '0')}`;
}
