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

describe('StockService shipment return', () => {
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
    updateLevel: vi.fn(async () => stockLevel({ quantityOnHand: 9 })),
    createMovement: vi.fn(async () => returnMovement()),
    ...overrides,
  } as unknown as StockRepository;
  return new StockService(repository, runner.runner, {
    write: overrides.auditWrite ?? vi.fn(async () => undefined),
  } as unknown as AuditWriter);
}

function transactionFixture(
  overrides: { fulfillmentStatus?: string } = {},
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
    createdAt: new Date('2026-08-23T10:00:00.000Z'),
    ...overrides,
  };
}

function cryptoId(suffix: number): string {
  return `0198e5b0-0000-7000-8000-${suffix.toString().padStart(12, '0')}`;
}
