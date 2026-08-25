import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { ApiError } from '../../common/errors/api-error.js';
import type { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { AfterSalesNotificationService } from '../notifications/after-sales-notification.service.js';
import type {
  AfterSalesOrderGateway,
  AfterSalesOrderItemContext,
} from '../order-transaction-ports/after-sales-order.gateway.js';
import type { OrderOwnershipPolicy } from '../order-transaction-ports/order-ownership.policy.js';
import type { CheckoutSettingsReader } from '../settings/checkout-settings.reader.js';
import { AfterSalesCommandService } from './after-sales-command.service.js';
import type { AfterSalesPublicRecord } from './after-sales.repository.js';
import type { AfterSalesRepository } from './after-sales.repository.js';

describe('AfterSalesCommandService', () => {
  it('writes the accepted create audit action and stores omitted requestedResolution as null', async () => {
    const fixture = setup();

    await fixture.service.create(fixture.request, {
      orderItemId: fixture.item.id,
      type: 'RETURN',
      issueDescription: 'Thiết bị có lỗi màn hình cần kiểm tra.',
    });

    expect(fixture.repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ requestedResolution: null, warrantyId: null }),
      fixture.transaction,
    );
    expect(fixture.audit.write).toHaveBeenCalledWith(
      fixture.transaction,
      expect.any(Object),
      expect.objectContaining({ action: 'after_sales.created' }),
    );
    expect(fixture.notifications.sendUpdated).toHaveBeenCalledOnce();
  });

  it('maps the open-case unique race without consuming request-number collision retries', async () => {
    const fixture = setup();
    fixture.repository.create.mockRejectedValueOnce({
      code: 'P2002',
      meta: { target: ['order_item_id'] },
    });

    await expect(
      fixture.service.create(fixture.request, {
        orderItemId: fixture.item.id,
        type: 'RETURN',
        issueDescription: 'Thiết bị có lỗi màn hình cần kiểm tra.',
      }),
    ).rejects.toMatchObject({
      code: 'AFTER_SALES_REQUEST_ALREADY_OPEN',
    } satisfies Partial<ApiError>);
    expect(fixture.notifications.sendUpdated).not.toHaveBeenCalled();
  });
});

function setup() {
  const now = new Date('2026-08-25T10:00:00.000Z');
  const transaction = {};
  const item = orderItem(now);
  const created = record(now);
  const repository = {
    findOpenForOrderItem: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(created),
    findByRequestNumber: vi.fn(),
    lockById: vi.fn(),
    update: vi.fn(),
  };
  const audit = { write: vi.fn().mockResolvedValue(undefined) };
  const notifications = { sendUpdated: vi.fn().mockResolvedValue(undefined) };
  const service = new AfterSalesCommandService(
    {
      run: vi.fn(async (_operation, work) =>
        (work as (tx: unknown) => Promise<unknown>)(transaction),
      ),
    } as unknown as SerializableTransactionRunner,
    {
      findItemContext: vi.fn().mockResolvedValue(item),
      lockCompletedItem: vi.fn().mockResolvedValue(item),
    } as unknown as AfterSalesOrderGateway,
    repository as unknown as AfterSalesRepository,
    { assertAccess: vi.fn() } as unknown as OrderOwnershipPolicy,
    {
      read: vi.fn().mockResolvedValue({ timezone: 'Asia/Ho_Chi_Minh' }),
    } as unknown as CheckoutSettingsReader,
    audit,
    notifications as unknown as AfterSalesNotificationService,
    { now: () => now },
  );
  return {
    service,
    repository,
    audit,
    notifications,
    transaction,
    item,
    request: request(),
  };
}

function orderItem(now: Date): AfterSalesOrderItemContext {
  return {
    id: '00000000-0000-4000-8000-000000000020',
    orderId: '00000000-0000-4000-8000-000000000070',
    productId: '00000000-0000-4000-8000-000000000040',
    variantId: '00000000-0000-4000-8000-000000000050',
    inventoryUnitId: '00000000-0000-4000-8000-000000000060',
    productTypeSnapshot: 'IPHONE',
    productNameSnapshot: 'iPhone 15',
    variantNameSnapshot: '128GB',
    inventoryCodeSnapshot: 'RPH-DEMO-001',
    quantity: 1,
    lineTotal: 20_000_000n as never,
    warranty: null,
    order: {
      id: '00000000-0000-4000-8000-000000000070',
      orderNumber: 'RPH-20260825-23456789',
      customerId: '00000000-0000-4000-8000-000000000030',
      guestAccessTokenHash: null,
      status: 'COMPLETED',
      completedAt: now,
      sourceCart: { status: 'CONVERTED', guestTokenHash: null, expiresAt: null },
    },
  };
}

function record(now: Date): AfterSalesPublicRecord {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    requestNumber: 'RPH-AS-20260825-234567',
    warrantyId: null,
    orderItemId: '00000000-0000-4000-8000-000000000020',
    customerId: '00000000-0000-4000-8000-000000000030',
    type: 'RETURN',
    issueDescription: 'Thiết bị có lỗi màn hình cần kiểm tra.',
    requestedResolution: null,
    status: 'REQUESTED',
    attachments: [],
    decisionNote: null,
    resolutionType: null,
    resolutionNote: null,
    cancelReason: null,
    requestedAt: now,
    receivedAt: null,
    inspectedAt: null,
    decidedAt: null,
    resolvedAt: null,
    returnedAt: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
    warranty: null,
    orderItem: {
      id: '00000000-0000-4000-8000-000000000020',
      productId: '00000000-0000-4000-8000-000000000040',
      variantId: '00000000-0000-4000-8000-000000000050',
      inventoryUnitId: '00000000-0000-4000-8000-000000000060',
      productTypeSnapshot: 'IPHONE',
      productNameSnapshot: 'iPhone 15',
      variantNameSnapshot: '128GB',
      inventoryCodeSnapshot: 'RPH-DEMO-001',
      quantity: 1,
      order: {
        id: '00000000-0000-4000-8000-000000000070',
        orderNumber: 'RPH-20260825-23456789',
        customerId: '00000000-0000-4000-8000-000000000030',
        guestAccessTokenHash: null,
        customerEmail: 'customer@example.com',
        status: 'COMPLETED',
        completedAt: now,
        sourceCart: { status: 'CONVERTED', guestTokenHash: null, expiresAt: null },
      },
    },
  };
}

function request(): Request {
  return {
    auth: {
      userId: '00000000-0000-4000-8000-000000000030',
      role: 'CUSTOMER',
      sessionId: 'session-1',
    },
    id: 'request-1',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    get: () => undefined,
  } as unknown as Request;
}
