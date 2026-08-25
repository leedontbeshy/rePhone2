/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it, vi } from 'vitest';
import type { ApiError } from '../../common/errors/api-error.js';
import type { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import type { AfterSalesInventoryGateway } from '../inventory/after-sales-inventory.gateway.js';
import type {
  AfterSalesOrderGateway,
  AfterSalesOrderItemContext,
} from '../order-transaction-ports/after-sales-order.gateway.js';
import type { AfterSalesRefundGateway } from '../refunds/after-sales-refund.gateway.js';
import type { WarrantyTransactionGateway } from '../warranty/warranty-transaction.gateway.js';
import { AfterSalesBackofficeCommandService } from './after-sales-backoffice-command.service.js';
import type {
  AfterSalesCommandRecord,
  AfterSalesCommandRepository,
} from './after-sales-command.repository.js';

const CASE_ID = id(1);
const ITEM_ID = id(2);
const ORDER_ID = id(3);
const ORIGINAL_UNIT_ID = id(4);
const REPLACEMENT_UNIT_ID = id(5);
const WARRANTY_ID = id(6);
const REFUND_ID = id(7);
const LOCATION_ID = id(8);
const EMPLOYEE_ID = id(9);
const NOW = new Date('2026-08-25T09:00:00.000Z');
const actor = { actorUserId: EMPLOYEE_ID, requestId: 'request-slice11' } as AuditActorContext;

describe('AfterSalesBackofficeCommandService', () => {
  it('locks the Order root before the case and assigns only an active EMPLOYEE', async () => {
    const fixture = serviceFixture();

    await fixture.service.assignAfterSalesRequest(CASE_ID, { employeeId: EMPLOYEE_ID }, actor);

    expect(fixture.repository.findActiveEmployee).toHaveBeenCalledWith(
      EMPLOYEE_ID,
      fixture.transaction,
    );
    expect(fixture.repository.assign).toHaveBeenCalledWith(
      CASE_ID,
      EMPLOYEE_ID,
      NOW,
      fixture.transaction,
    );
    expect(
      fixture.orders.lockCompletedItem.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    ).toBeLessThan(fixture.repository.lockById.mock.invocationCallOrder[0] ?? 0);

    fixture.repository.findActiveEmployee.mockResolvedValueOnce(null);
    await expect(
      fixture.service.assignAfterSalesRequest(CASE_ID, { employeeId: id(10) }, actor),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' } satisfies Partial<ApiError>);
  });

  it('receives an iPhone by moving SOLD to INSPECTING before persisting the case', async () => {
    const fixture = serviceFixture();
    const outcome = await fixture.service.receiveAfterSalesRequest(
      CASE_ID,
      { receivedLocationId: LOCATION_ID, note: '  Máy và phụ kiện đi kèm đầy đủ.  ' },
      actor,
    );

    expect(fixture.inventory.receiveSoldUnit).toHaveBeenCalledWith(
      { unitId: ORIGINAL_UNIT_ID, receivedLocationId: LOCATION_ID, originalSoldAt: NOW },
      fixture.transaction,
    );
    expect(fixture.repository.receive).toHaveBeenCalledWith(
      expect.objectContaining({
        id: CASE_ID,
        receivedLocationId: LOCATION_ID,
        receivedById: EMPLOYEE_ID,
        receiveNote: 'Máy và phụ kiện đi kèm đầy đủ.',
        receivedAt: NOW,
      }),
      fixture.transaction,
    );
    expect(fixture.audit.write).toHaveBeenCalledOnce();
    expect(outcome.changed).toBe(true);
  });

  it('creates a typed DRAFT inspection for iPhone and no inspection for accessory', async () => {
    const iphone = serviceFixture({ request: request({ status: 'RECEIVED', type: 'EXCHANGE' }) });
    await iphone.service.startAfterSalesInspection(CASE_ID, actor);
    expect(iphone.inventory.createInspectionDraft).toHaveBeenCalledWith(
      {
        unitId: ORIGINAL_UNIT_ID,
        inspectionType: 'RETURN',
        inspectorId: EMPLOYEE_ID,
      },
      iphone.transaction,
    );
    expect(iphone.repository.startInspection).toHaveBeenCalledWith(
      { id: CASE_ID, inventoryInspectionId: id(20), inspectedAt: NOW },
      iphone.transaction,
    );

    const accessory = serviceFixture({
      request: request({ status: 'RECEIVED', type: 'RETURN', warrantyId: null }),
      item: accessoryItem(),
    });
    await accessory.service.startAfterSalesInspection(CASE_ID, actor);
    expect(accessory.inventory.createInspectionDraft).not.toHaveBeenCalled();
    expect(accessory.repository.startInspection).toHaveBeenCalledWith(
      { id: CASE_ID, inventoryInspectionId: null, inspectedAt: NOW },
      accessory.transaction,
    );
  });

  it('records the accessory inspection summary but rejects the same command for iPhone', async () => {
    const accessory = serviceFixture({
      request: request({
        status: 'INSPECTING',
        warrantyId: null,
        inventoryInspectionId: null,
      }),
      item: accessoryItem(),
    });
    await accessory.service.recordAfterSalesInspectionSummary(
      CASE_ID,
      { inspectionSummary: '  Phụ kiện hoạt động ổn định sau kiểm tra.  ' },
      actor,
    );
    expect(accessory.repository.recordInspectionSummary).toHaveBeenCalledWith(
      CASE_ID,
      'Phụ kiện hoạt động ổn định sau kiểm tra.',
      NOW,
      accessory.transaction,
    );

    const iphone = serviceFixture({ request: request({ status: 'INSPECTING' }) });
    await expect(
      iphone.service.recordAfterSalesInspectionSummary(
        CASE_ID,
        { inspectionSummary: 'Không được dùng summary thay checklist iPhone.' },
        actor,
      ),
    ).rejects.toMatchObject({
      code: 'AFTER_SALES_RESOLUTION_REQUIREMENTS_NOT_MET',
    } satisfies Partial<ApiError>);
  });

  it('requires a completed typed inspection before approving an iPhone case', async () => {
    const fixture = serviceFixture({
      request: request({ status: 'INSPECTING' }),
      inspection: { status: 'DRAFT', inspectedAt: null },
    });

    await expect(
      fixture.service.approveAfterSalesRequest(
        CASE_ID,
        { note: 'Đồng ý tiếp nhận bảo hành thiết bị.' },
        actor,
      ),
    ).rejects.toMatchObject({
      code: 'AFTER_SALES_RESOLUTION_REQUIREMENTS_NOT_MET',
    } satisfies Partial<ApiError>);
    expect(fixture.repository.approve).not.toHaveBeenCalled();
  });

  it('rejects an inspected iPhone and returns it to SOLD atomically', async () => {
    const fixture = serviceFixture({ request: request({ status: 'INSPECTING' }) });

    await fixture.service.rejectAfterSalesRequest(
      CASE_ID,
      {
        reason: 'Không phát hiện lỗi thuộc phạm vi bảo hành.',
        returnNote: 'Đã trả nguyên máy cho khách tại quầy.',
      },
      actor,
    );

    expect(fixture.inventory.returnUnitToCustomer).toHaveBeenCalledWith(
      { unitId: ORIGINAL_UNIT_ID, originalSoldAt: NOW },
      fixture.transaction,
    );
    expect(fixture.repository.reject).toHaveBeenCalledWith(
      expect.objectContaining({
        returnNote: 'Đã trả nguyên máy cho khách tại quầy.',
        returnedAt: NOW,
      }),
      fixture.transaction,
    );
  });

  it('allocates a same-product replacement and moves the existing Warranty once', async () => {
    const fixture = serviceFixture({ request: request({ status: 'APPROVED' }) });

    await fixture.service.resolveAfterSalesReplaced(
      CASE_ID,
      {
        replacementInventoryUnitId: REPLACEMENT_UNIT_ID,
        resolutionNote: 'Đổi thiết bị cùng dòng sản phẩm cho khách.',
      },
      actor,
    );

    expect(fixture.inventory.allocateReplacement).toHaveBeenCalledWith(
      { unitId: REPLACEMENT_UNIT_ID, expectedProductId: 'product-iphone', now: NOW },
      fixture.transaction,
    );
    expect(fixture.warranties.moveToReplacementUnit).toHaveBeenCalledWith(
      {
        id: WARRANTY_ID,
        originalInventoryUnitId: ORIGINAL_UNIT_ID,
        replacementInventoryUnitId: REPLACEMENT_UNIT_ID,
      },
      fixture.transaction,
    );
    expect(fixture.inventory.returnUnitToCustomer).not.toHaveBeenCalled();
  });

  it('links only a positive completed same-order Refund and voids an active Warranty', async () => {
    const fixture = serviceFixture({ request: request({ status: 'APPROVED' }) });

    await fixture.service.resolveAfterSalesRefunded(
      CASE_ID,
      { refundId: REFUND_ID, resolutionNote: 'Hoàn tiền theo kết quả xử lý hậu mãi.' },
      actor,
    );

    expect(fixture.refunds.lockCompletedForOrder).toHaveBeenCalledWith(
      REFUND_ID,
      ORDER_ID,
      fixture.transaction,
    );
    expect(fixture.warranties.voidActive).toHaveBeenCalledWith(
      expect.objectContaining({ id: WARRANTY_ID, actorUserId: EMPLOYEE_ID, now: NOW }),
      fixture.transaction,
    );
    expect(fixture.repository.resolve).toHaveBeenCalledWith(
      CASE_ID,
      expect.objectContaining({ resolutionType: 'REFUNDED', refundId: REFUND_ID }),
      fixture.transaction,
    );
  });

  it('returns an exact terminal replay without repeating inventory, audit or warranty effects', async () => {
    const fixture = serviceFixture({
      request: request({
        status: 'RESOLVED',
        resolutionType: 'REPAIRED',
        resolutionNote: 'Đã sửa và trả thiết bị cho khách.',
        resolvedById: EMPLOYEE_ID,
        returnNote: 'Đã sửa và trả thiết bị cho khách.',
        returnedAt: NOW,
        resolvedAt: NOW,
      }),
    });

    const replay = await fixture.service.resolveAfterSalesRepaired(
      CASE_ID,
      { resolutionNote: 'Đã sửa và trả thiết bị cho khách.' },
      actor,
    );
    expect(fixture.inventory.returnUnitToCustomer).not.toHaveBeenCalled();
    expect(fixture.repository.resolve).not.toHaveBeenCalled();
    expect(fixture.audit.write).not.toHaveBeenCalled();
    expect(replay.changed).toBe(false);

    await expect(
      fixture.service.resolveAfterSalesRepaired(
        CASE_ID,
        { resolutionNote: 'Payload replay đã bị thay đổi.' },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' } satisfies Partial<ApiError>);
  });

  it('keeps OTHER resolution ADMIN-only and free of automatic inventory effects', async () => {
    const employee = serviceFixture({ request: request({ status: 'APPROVED' }) });
    let forbidden: unknown;
    try {
      void employee.service.resolveAfterSalesOther(
        CASE_ID,
        { resolutionNote: 'Xử lý ngoại lệ đã được phê duyệt.' },
        actor,
        'EMPLOYEE',
      );
    } catch (error) {
      forbidden = error;
    }
    expect(forbidden).toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<ApiError>);

    const admin = serviceFixture({ request: request({ status: 'APPROVED' }) });
    await admin.service.resolveAfterSalesOther(
      CASE_ID,
      { resolutionNote: 'Xử lý ngoại lệ đã được phê duyệt.' },
      actor,
      'ADMIN',
    );
    expect(admin.repository.resolve).toHaveBeenCalledWith(
      CASE_ID,
      expect.objectContaining({ resolutionType: 'OTHER' }),
      admin.transaction,
    );
    expect(admin.inventory.returnUnitToCustomer).not.toHaveBeenCalled();
    expect(admin.inventory.allocateReplacement).not.toHaveBeenCalled();
  });
});

function serviceFixture(
  overrides: {
    request?: AfterSalesCommandRecord;
    item?: AfterSalesOrderItemContext;
    inspection?: Partial<{
      status: 'DRAFT' | 'COMPLETED';
      inspectedAt: Date | null;
    }>;
  } = {},
) {
  const transaction = {} as Prisma.TransactionClient;
  const currentRequest = overrides.request ?? request();
  const currentItem = overrides.item ?? iphoneItem();
  const repository = {
    findOrderItemId: vi.fn(async () => ({ orderItemId: ITEM_ID })),
    lockById: vi.fn(async () => currentRequest),
    findActiveEmployee: vi
      .fn<
        (employeeId: string, client: Prisma.TransactionClient) => Promise<{ id: string } | null>
      >()
      .mockResolvedValue({ id: EMPLOYEE_ID }),
    assign: vi.fn(async () => request({ assignedToId: EMPLOYEE_ID })),
    receive: vi.fn(async () => request({ status: 'RECEIVED' })),
    startInspection: vi.fn(async () => request({ status: 'INSPECTING' })),
    recordInspectionSummary: vi.fn(async () => request({ status: 'INSPECTING' })),
    approve: vi.fn(async () => request({ status: 'APPROVED' })),
    reject: vi.fn(async () => request({ status: 'REJECTED' })),
    resolve: vi.fn(async () => request({ status: 'RESOLVED' })),
  };
  const orders = { lockCompletedItem: vi.fn(async () => currentItem) };
  const inspection = {
    id: id(20),
    inventoryUnitId: ORIGINAL_UNIT_ID,
    inspectionType: currentRequest.type === 'WARRANTY' ? 'WARRANTY' : 'RETURN',
    status: overrides.inspection?.status ?? 'COMPLETED',
    overallResult: 'FAILED',
    inspectorId: EMPLOYEE_ID,
    inspectedAt:
      overrides.inspection === undefined ? NOW : (overrides.inspection.inspectedAt ?? null),
    isCurrent: true,
  };
  const inventory = {
    findActiveLocation: vi.fn(async () => ({ id: LOCATION_ID, status: 'ACTIVE' })),
    receiveSoldUnit: vi.fn(async () => ({ id: ORIGINAL_UNIT_ID })),
    createInspectionDraft: vi.fn(async () => ({
      ...inspection,
      status: 'DRAFT',
      inspectedAt: null,
    })),
    lockInspection: vi.fn(async () => inspection),
    returnUnitToCustomer: vi.fn(async () => ({ id: ORIGINAL_UNIT_ID, lifecycleStatus: 'SOLD' })),
    lockUnit: vi.fn(async () => inventoryUnit('INSPECTING')),
    allocateReplacement: vi.fn(async () => ({
      ...inventoryUnit('SOLD'),
      id: REPLACEMENT_UNIT_ID,
    })),
  };
  const refunds = {
    lockCompletedForOrder: vi.fn(async () => ({
      id: REFUND_ID,
      orderId: ORDER_ID,
      paymentId: null,
      amount: '1000000',
      method: 'BANK_TRANSFER',
      completedAt: NOW,
    })),
  };
  const warranty = {
    id: WARRANTY_ID,
    warrantyCode: 'RPH-W-20260825-23456789',
    orderItemId: ITEM_ID,
    customerId: id(30),
    inventoryUnitId: ORIGINAL_UNIT_ID,
    policyId: null,
    daysSnapshot: 90,
    termsSnapshot: 'Bảo hành 90 ngày.',
    startAt: new Date('2026-08-20T00:00:00.000Z'),
    endAt: new Date('2026-11-18T00:00:00.000Z'),
    status: 'ACTIVE',
    voidReason: null,
    voidedById: null,
    voidedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  } as const;
  const warranties = {
    lockById: vi.fn(async () => warranty),
    moveToReplacementUnit: vi.fn(async () => ({
      ...warranty,
      inventoryUnitId: REPLACEMENT_UNIT_ID,
    })),
    voidActive: vi.fn(async () => ({ ...warranty, status: 'VOIDED' })),
  };
  const audit = { write: vi.fn(async () => undefined) };
  const runner = {
    run: vi.fn(
      async <T>(
        _operation: string,
        work: (client: Prisma.TransactionClient) => Promise<T>,
      ): Promise<T> => work(transaction),
    ),
  };
  const clock = { now: vi.fn(() => NOW) };
  const service = new AfterSalesBackofficeCommandService(
    runner as unknown as SerializableTransactionRunner,
    repository as unknown as AfterSalesCommandRepository,
    orders as unknown as AfterSalesOrderGateway,
    inventory as unknown as AfterSalesInventoryGateway,
    refunds as unknown as AfterSalesRefundGateway,
    warranties as unknown as WarrantyTransactionGateway,
    audit as unknown as AuditWriter,
    clock,
  );
  return { service, transaction, repository, orders, inventory, refunds, warranties, audit };
}

function request(overrides: Partial<AfterSalesCommandRecord> = {}): AfterSalesCommandRecord {
  return {
    id: CASE_ID,
    requestNumber: 'RPH-AS-20260825-234567',
    warrantyId: WARRANTY_ID,
    orderItemId: ITEM_ID,
    customerId: id(30),
    type: 'WARRANTY',
    status: 'REQUESTED',
    assignedToId: null,
    receivedLocationId: null,
    receivedById: null,
    receiveNote: null,
    inspectionSummary: null,
    inventoryInspectionId: id(20),
    decisionNote: null,
    decidedById: null,
    decidedAt: null,
    resolutionType: null,
    resolutionNote: null,
    replacementInventoryUnitId: null,
    refundId: null,
    resolvedById: null,
    returnNote: null,
    requestedAt: new Date('2026-08-25T08:00:00.000Z'),
    receivedAt: null,
    inspectedAt: null,
    resolvedAt: null,
    returnedAt: null,
    cancelledAt: null,
    updatedAt: new Date('2026-08-25T08:00:00.000Z'),
    ...overrides,
  };
}

function iphoneItem(): AfterSalesOrderItemContext {
  return {
    ...baseOrderItem(),
    inventoryUnitId: ORIGINAL_UNIT_ID,
    productTypeSnapshot: 'IPHONE',
    productNameSnapshot: 'iPhone 15',
    variantNameSnapshot: '128GB',
    inventoryCodeSnapshot: 'RPH-U-001',
    warranty: {
      id: WARRANTY_ID,
      warrantyCode: 'RPH-W-20260825-23456789',
      inventoryUnitId: ORIGINAL_UNIT_ID,
      status: 'ACTIVE',
      startAt: new Date('2026-08-20T00:00:00.000Z'),
      endAt: new Date('2026-11-18T00:00:00.000Z'),
    },
  };
}

function accessoryItem(): AfterSalesOrderItemContext {
  return {
    ...baseOrderItem(),
    productId: 'product-accessory',
    variantId: 'variant-accessory',
    inventoryUnitId: null,
    productTypeSnapshot: 'ACCESSORY',
    productNameSnapshot: 'Ốp lưng',
    variantNameSnapshot: 'Màu đen',
    inventoryCodeSnapshot: null,
    quantity: 2,
    warranty: null,
  };
}

function baseOrderItem() {
  return {
    id: ITEM_ID,
    orderId: ORDER_ID,
    productId: 'product-iphone',
    variantId: 'variant-iphone',
    quantity: 1,
    lineTotal: 20_000_000n as never,
    order: {
      id: ORDER_ID,
      orderNumber: 'RPH-20260825-23456789',
      customerId: id(30),
      guestAccessTokenHash: null,
      status: 'COMPLETED' as const,
      completedAt: NOW,
      sourceCart: {
        status: 'CONVERTED' as const,
        guestTokenHash: null,
        expiresAt: null,
      },
    },
  };
}

function inventoryUnit(lifecycleStatus: 'INSPECTING' | 'SOLD') {
  return {
    id: ORIGINAL_UNIT_ID,
    variantId: 'variant-iphone',
    locationId: LOCATION_ID,
    inventoryCode: 'RPH-U-001',
    lifecycleStatus,
    soldAt: NOW,
    location: { status: 'ACTIVE' },
    variant: {
      productId: 'product-iphone',
      inventoryMode: 'SERIALIZED',
      status: 'ACTIVE',
      product: { type: 'IPHONE', status: 'ACTIVE' },
    },
    _count: { reservations: 0 },
  };
}

function id(suffix: number): string {
  return `0198e700-0000-7000-8000-${suffix.toString().padStart(12, '0')}`;
}
