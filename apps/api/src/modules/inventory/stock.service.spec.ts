/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../common/errors/api-error.js';
import type { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import type { ReturnStockDto } from './stock.dto.js';
import type { StockRepository, StockLevelRecord } from './stock.repository.js';
import { StockService } from './stock.service.js';

const VARIANT_ID = cryptoId(1);
const LOCATION_ID = cryptoId(2);
const SHIPMENT_ID = cryptoId(3);
const AFTER_SALES_ID = cryptoId(7);
const MOVEMENT_ID = cryptoId(4);
const USER_ID = cryptoId(5);
const input: ReturnStockDto = {
  variantId: VARIANT_ID,
  locationId: LOCATION_ID,
  quantity: 2,
  referenceType: 'SHIPMENT',
  referenceId: SHIPMENT_ID,
  reason: 'Hang hoan con nguyen ven',
};
const actor = { actorUserId: USER_ID } as AuditActorContext;
const afterSalesInput: ReturnStockDto = {
  variantId: VARIANT_ID,
  locationId: LOCATION_ID,
  quantity: 2,
  referenceType: 'AFTER_SALES_REQUEST',
  referenceId: AFTER_SALES_ID,
  reason: 'Hang hoan con nguyen ven',
};

describe('StockService shipment return', () => {
  it('projects product, variant, location and staff summaries for stock screens', async () => {
    const repository = {
      listLevels: vi.fn(async () => ({ items: [stockLevel()], totalItems: 1 })),
      listMovements: vi.fn(async () => ({ items: [returnMovement()], totalItems: 1 })),
    } as unknown as StockRepository;
    const service = new StockService(repository, runnerFixture().runner, {
      write: vi.fn(),
    });

    const levels = await service.listLevels({ page: 1, pageSize: 20 });
    const movements = await service.listMovements({ page: 1, pageSize: 20 });

    expect(levels).toMatchObject({
      items: [
        {
          product: { name: 'Ốp lưng MagSafe' },
          variant: { displayName: 'Op lung den' },
          location: { name: 'Kho HCM' },
        },
      ],
    });
    expect(movements).toMatchObject({
      items: [
        {
          product: { name: 'Ốp lưng MagSafe' },
          variant: { displayName: 'Ốp lưng đen' },
          fromLocation: null,
          toLocation: { name: 'Kho HCM' },
          createdBy: { fullName: 'Nhân viên Demo', employeeCode: 'NV-001' },
        },
      ],
    });
    expect(JSON.stringify({ levels, movements })).not.toMatch(
      /acquisitionCost|additionalCost|salePrice|compareAtPrice/,
    );
  });

  it('returns an exact replay without incrementing stock or duplicating audit', async () => {
    const updateLevel = vi.fn();
    const auditWrite = vi.fn();
    const runner = runnerFixture();
    const service = stockService(runner, {
      findShipmentReturn: vi.fn(async () => returnMovement()),
      updateLevel,
      auditWrite,
    });

    await expect(service.returnStock(input, actor)).resolves.toMatchObject({
      movement: { id: MOVEMENT_ID, referenceType: 'SHIPMENT', referenceId: SHIPMENT_ID },
      affectedLevels: [{ quantityOnHand: 7 }],
    });
    expect(updateLevel).not.toHaveBeenCalled();
    expect(auditWrite).not.toHaveBeenCalled();
    expect(runner.retryable?.({ code: 'P2002' })).toBe(true);
    expect(runner.retryable?.(new ApiError('DUPLICATE_RESOURCE'))).toBe(false);
  });

  it('maps a mismatched replay to DUPLICATE_RESOURCE before stock mutation', async () => {
    const updateLevel = vi.fn();
    const service = stockService(runnerFixture(), {
      findShipmentReturn: vi.fn(async () =>
        returnMovement({ toLocationId: cryptoId(9), quantity: 1 }),
      ),
      updateLevel,
    });

    await expect(service.returnStock(input, actor)).rejects.toMatchObject({
      code: 'DUPLICATE_RESOURCE',
    } satisfies Partial<ApiError>);
    expect(updateLevel).not.toHaveBeenCalled();
  });

  it('requires a RETURNED shipping order aligned to the return location and accessory item', async () => {
    const updateLevel = vi.fn();
    const transaction = transactionFixture({ fulfillmentStatus: 'FAILED' });
    const service = stockService(runnerFixture(transaction), {
      findShipmentReturn: vi.fn(async () => null),
      updateLevel,
    });

    await expect(service.returnStock(input, actor)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    } satisfies Partial<ApiError>);
    expect(updateLevel).not.toHaveBeenCalled();
  });

  it('creates one audited RETURN after validating a matching Shipment reference', async () => {
    const updateLevel = vi.fn(async () => stockLevel({ quantityOnHand: 9 }));
    const createMovement = vi.fn(async () => returnMovement());
    const auditWrite = vi.fn(async () => undefined);
    const service = stockService(runnerFixture(), {
      findShipmentReturn: vi.fn(async () => null),
      updateLevel,
      createMovement,
      auditWrite,
    });

    await expect(service.returnStock(input, actor)).resolves.toMatchObject({
      movement: { id: MOVEMENT_ID, type: 'RETURN' },
      affectedLevels: [{ quantityOnHand: 9 }],
    });
    expect(updateLevel).toHaveBeenCalledOnce();
    expect(createMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'RETURN',
        referenceType: 'SHIPMENT',
        referenceId: SHIPMENT_ID,
      }),
      expect.anything(),
    );
    expect(auditWrite).toHaveBeenCalledOnce();
  });

  it('returns an exact AFTER_SALES_REQUEST replay without incrementing stock', async () => {
    const updateLevel = vi.fn();
    const auditWrite = vi.fn();
    const service = stockService(runnerFixture(), {
      findAfterSalesReturn: vi.fn(async () =>
        returnMovement({
          referenceType: 'AFTER_SALES_REQUEST',
          referenceId: AFTER_SALES_ID,
        }),
      ),
      updateLevel,
      auditWrite,
    });

    await expect(service.returnStock(afterSalesInput, actor)).resolves.toMatchObject({
      movement: { referenceType: 'AFTER_SALES_REQUEST', referenceId: AFTER_SALES_ID },
    });
    expect(updateLevel).not.toHaveBeenCalled();
    expect(auditWrite).not.toHaveBeenCalled();
  });

  it('creates an idempotent accessory return for a resolved after-sales case', async () => {
    const updateLevel = vi.fn(async () => stockLevel({ quantityOnHand: 9 }));
    const createMovement = vi.fn(async () =>
      returnMovement({
        referenceType: 'AFTER_SALES_REQUEST',
        referenceId: AFTER_SALES_ID,
      }),
    );
    const service = stockService(runnerFixture(), {
      findAfterSalesReturn: vi.fn(async () => null),
      updateLevel,
      createMovement,
    });

    await expect(service.returnStock(afterSalesInput, actor)).resolves.toMatchObject({
      movement: { type: 'RETURN', referenceType: 'AFTER_SALES_REQUEST' },
      affectedLevels: [{ quantityOnHand: 9 }],
    });
    expect(createMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceType: 'AFTER_SALES_REQUEST',
        referenceId: AFTER_SALES_ID,
      }),
      expect.anything(),
    );
  });

  it('rejects an after-sales stock return before the accessory case is resolved', async () => {
    const updateLevel = vi.fn();
    const service = stockService(
      runnerFixture(transactionFixture({ afterSalesStatus: 'APPROVED' })),
      {
        findAfterSalesReturn: vi.fn(async () => null),
        updateLevel,
      },
    );

    await expect(service.returnStock(afterSalesInput, actor)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    } satisfies Partial<ApiError>);
    expect(updateLevel).not.toHaveBeenCalled();
  });
});

interface RunnerFixture {
  runner: SerializableTransactionRunner;
  retryable: ((error: unknown) => boolean) | undefined;
}

function runnerFixture(
  transaction: Prisma.TransactionClient = transactionFixture(),
): RunnerFixture {
  const fixture: RunnerFixture = {
    runner: {
      run: vi.fn(
        async <T>(
          _operation: string,
          work: (client: Prisma.TransactionClient) => Promise<T>,
          retryable?: (error: unknown) => boolean,
        ): Promise<T> => {
          fixture.retryable = retryable;
          return work(transaction);
        },
      ),
    } as unknown as SerializableTransactionRunner,
    retryable: undefined,
  };
  return fixture;
}

function stockService(
  runner: RunnerFixture,
  overrides: {
    findShipmentReturn?: object;
    findAfterSalesReturn?: object;
    updateLevel?: object;
    createMovement?: object;
    auditWrite?: object;
  },
): StockService {
  const repository = {
    ensureLevel: vi.fn(async () => ({ id: cryptoId(6) })),
    lockLevels: vi.fn(async () => undefined),
    findLevel: vi.fn(async () => stockLevel()),
    findShipmentReturn: vi.fn(async () => null),
    findAfterSalesReturn: vi.fn(async () => null),
    updateLevel: vi.fn(async () => stockLevel({ quantityOnHand: 9 })),
    createMovement: vi.fn(async () => returnMovement()),
    ...overrides,
  } as unknown as StockRepository;
  return new StockService(repository, runner.runner, {
    write: overrides.auditWrite ?? vi.fn(async () => undefined),
  } as unknown as AuditWriter);
}

function transactionFixture(
  overrides: { fulfillmentStatus?: string; afterSalesStatus?: string } = {},
): Prisma.TransactionClient {
  return {
    productVariant: {
      findUnique: vi.fn(async () => ({
        status: 'ACTIVE',
        inventoryMode: 'QUANTITY',
        product: { type: 'ACCESSORY', status: 'ACTIVE' },
      })),
    },
    inventoryLocation: {
      findMany: vi.fn(async () => [{ id: LOCATION_ID, status: 'ACTIVE' }]),
    },
    shipment: {
      findUnique: vi.fn(async () => ({
        status: 'RETURNED',
        returnedToLocationId: LOCATION_ID,
        returnedToLocation: { status: 'ACTIVE', type: 'WAREHOUSE' },
        order: {
          fulfillmentType: 'SHIPPING',
          fulfillmentStatus: overrides.fulfillmentStatus ?? 'RETURNED',
          items: [{ quantity: input.quantity }],
        },
      })),
    },
    afterSalesRequest: {
      findUnique: vi.fn(async () => ({
        status: overrides.afterSalesStatus ?? 'RESOLVED',
        resolutionType: 'REFUNDED',
        receivedLocationId: LOCATION_ID,
        inspectionSummary: 'Phụ kiện đã được kiểm tra và đủ điều kiện nhập lại kho.',
        receivedLocation: { status: 'ACTIVE', type: 'WAREHOUSE' },
        orderItem: {
          variantId: VARIANT_ID,
          inventoryUnitId: null,
          productTypeSnapshot: 'ACCESSORY',
          quantity: input.quantity,
        },
      })),
    },
  } as unknown as Prisma.TransactionClient;
}

function stockLevel(overrides: Record<string, unknown> = {}): StockLevelRecord {
  return {
    id: cryptoId(6),
    variantId: VARIANT_ID,
    locationId: LOCATION_ID,
    quantityOnHand: 7,
    quantityReserved: 0,
    reorderThreshold: 1,
    updatedAt: new Date('2026-08-23T10:00:00.000Z'),
    variant: {
      id: VARIANT_ID,
      sku: 'CASE-001',
      displayName: 'Op lung den',
      status: 'ACTIVE',
      product: {
        id: cryptoId(7),
        name: 'Ốp lưng MagSafe',
        slug: 'op-lung-magsafe',
        status: 'ACTIVE',
      },
    },
    location: {
      id: LOCATION_ID,
      code: 'HCM-WH-01',
      name: 'Kho HCM',
      type: 'WAREHOUSE',
      status: 'ACTIVE',
    },
    ...overrides,
  } as StockLevelRecord;
}

function returnMovement(overrides: Record<string, unknown> = {}) {
  return {
    id: MOVEMENT_ID,
    variantId: VARIANT_ID,
    fromLocationId: null,
    toLocationId: LOCATION_ID,
    type: 'RETURN' as const,
    quantity: input.quantity,
    referenceType: 'SHIPMENT',
    referenceId: SHIPMENT_ID,
    reason: input.reason,
    createdById: USER_ID,
    variant: {
      id: VARIANT_ID,
      sku: 'CASE-001',
      displayName: 'Ốp lưng đen',
      status: 'ACTIVE',
      product: {
        id: cryptoId(7),
        name: 'Ốp lưng MagSafe',
        slug: 'op-lung-magsafe',
        status: 'ACTIVE',
      },
    },
    fromLocation: null,
    toLocation: {
      id: LOCATION_ID,
      code: 'HCM-WH-01',
      name: 'Kho HCM',
      type: 'WAREHOUSE',
      status: 'ACTIVE',
    },
    createdBy: { id: USER_ID, fullName: 'Nhân viên Demo', employeeCode: 'NV-001' },
    createdAt: new Date('2026-08-23T10:00:00.000Z'),
    ...overrides,
  };
}

function cryptoId(suffix: number): string {
  return `0198e5b0-0000-7000-8000-${suffix.toString().padStart(12, '0')}`;
}
