import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AfterSalesInventoryGateway } from './after-sales-inventory.gateway.js';

const UNIT_ID = '0198e5a0-0000-7000-8000-000000000001';
const VARIANT_ID = '0198e5a0-0000-7000-8000-000000000002';
const LOCATION_ID = '0198e5a0-0000-7000-8000-000000000003';
const STAFF_ID = '0198e5a0-0000-7000-8000-000000000004';

describe('AfterSalesInventoryGateway', () => {
  it('receives a sold serialized iPhone without creating stock movement or sellable stock', async () => {
    const updateMany = vi.fn<(input: unknown) => Promise<{ count: number }>>().mockResolvedValue({
      count: 1,
    });
    const stockLevelUpdate = vi.fn();
    const stockMovementCreate = vi.fn();
    const unit = iphoneUnit({ lifecycleStatus: 'SOLD' });
    const originalSoldAt = unit.soldAt;
    const transaction = {
      inventoryLocation: {
        findFirst: vi.fn().mockResolvedValue({ id: LOCATION_ID, status: 'ACTIVE' }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: UNIT_ID }]),
      inventoryUnit: {
        findUnique: vi.fn().mockResolvedValue(unit),
        updateMany,
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          ...unit,
          lifecycleStatus: 'INSPECTING',
          locationId: LOCATION_ID,
          soldAt: null,
        }),
      },
      stockLevel: { updateMany: stockLevelUpdate },
      stockMovement: { create: stockMovementCreate },
    } as unknown as Prisma.TransactionClient;
    const gateway = new AfterSalesInventoryGateway({} as PrismaService);

    await expect(
      gateway.receiveSoldUnit(
        { unitId: UNIT_ID, receivedLocationId: LOCATION_ID, originalSoldAt },
        transaction,
      ),
    ).resolves.toMatchObject({
      lifecycleStatus: 'INSPECTING',
      locationId: LOCATION_ID,
      soldAt: null,
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: UNIT_ID,
        lifecycleStatus: 'SOLD',
        soldAt: originalSoldAt,
        reservations: { none: { status: 'ACTIVE' } },
      },
      data: {
        lifecycleStatus: 'INSPECTING',
        locationId: LOCATION_ID,
        soldAt: null,
      },
    });
    expect(stockLevelUpdate).not.toHaveBeenCalled();
    expect(stockMovementCreate).not.toHaveBeenCalled();
  });

  it('rejects a sold iPhone that belongs to a different completed order', async () => {
    const unit = iphoneUnit({ lifecycleStatus: 'SOLD' });
    const updateMany = vi.fn();
    const transaction = {
      inventoryLocation: {
        findFirst: vi.fn().mockResolvedValue({ id: LOCATION_ID, status: 'ACTIVE' }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: UNIT_ID }]),
      inventoryUnit: {
        findUnique: vi.fn().mockResolvedValue(unit),
        updateMany,
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      new AfterSalesInventoryGateway({} as PrismaService).receiveSoldUnit(
        {
          unitId: UNIT_ID,
          receivedLocationId: LOCATION_ID,
          originalSoldAt: new Date('2026-08-23T00:00:00.000Z'),
        },
        transaction,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('restores the original sale timestamp when an inspected iPhone is returned', async () => {
    const originalSoldAt = new Date('2026-08-20T07:30:00.000Z');
    const updateMany = vi.fn<(input: unknown) => Promise<{ count: number }>>().mockResolvedValue({
      count: 1,
    });
    const unit = iphoneUnit({ lifecycleStatus: 'INSPECTING', soldAt: null });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: UNIT_ID }]),
      inventoryUnit: {
        findUnique: vi.fn().mockResolvedValue(unit),
        updateMany,
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          ...unit,
          lifecycleStatus: 'SOLD',
          soldAt: originalSoldAt,
        }),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      new AfterSalesInventoryGateway({} as PrismaService).returnUnitToCustomer(
        { unitId: UNIT_ID, originalSoldAt },
        transaction,
      ),
    ).resolves.toMatchObject({ lifecycleStatus: 'SOLD', soldAt: originalSoldAt });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: UNIT_ID, lifecycleStatus: 'INSPECTING' },
      data: { lifecycleStatus: 'SOLD', soldAt: originalSoldAt },
    });
  });

  it('creates a WARRANTY draft using the existing inspection aggregate shape', async () => {
    const create = vi.fn<(input: unknown) => Promise<Record<string, unknown>>>().mockResolvedValue({
      id: 'inspection-1',
      inventoryUnitId: UNIT_ID,
      inspectionType: 'WARRANTY',
      status: 'DRAFT',
    });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: UNIT_ID }]),
      inventoryUnit: { findUnique: vi.fn().mockResolvedValue(iphoneUnit()) },
      inventoryInspection: {
        findFirst: vi.fn().mockResolvedValue(null),
        create,
      },
    } as unknown as Prisma.TransactionClient;

    await new AfterSalesInventoryGateway({} as PrismaService).createInspectionDraft(
      { unitId: UNIT_ID, inspectionType: 'WARRANTY', inspectorId: STAFF_ID },
      transaction,
    );
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        inventoryUnitId: UNIT_ID,
        inspectionType: 'WARRANTY',
        inspectorId: STAFF_ID,
        checks: { schemaVersion: 1, items: {} },
        status: 'DRAFT',
        overallResult: 'INCOMPLETE',
        isCurrent: false,
      },
    });
  });

  it('allows an active replacement from another variant of the same Product', async () => {
    const now = new Date('2026-08-25T00:00:00.000Z');
    const updateMany = vi.fn<(input: unknown) => Promise<{ count: number }>>().mockResolvedValue({
      count: 1,
    });
    const replacement = iphoneUnit({
      variantId: 'different-variant',
      lifecycleStatus: 'AVAILABLE',
    });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: UNIT_ID }]),
      inventoryUnit: {
        findUnique: vi.fn().mockResolvedValue(replacement),
        updateMany,
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          ...replacement,
          lifecycleStatus: 'SOLD',
          soldAt: now,
        }),
      },
      warranty: { count: vi.fn().mockResolvedValue(0) },
    } as unknown as Prisma.TransactionClient;

    await expect(
      new AfterSalesInventoryGateway({} as PrismaService).allocateReplacement(
        { unitId: UNIT_ID, expectedProductId: 'product-1', now },
        transaction,
      ),
    ).resolves.toMatchObject({ lifecycleStatus: 'SOLD', soldAt: now });
    expect(updateMany.mock.calls[0]?.[0]).toMatchObject({
      data: { lifecycleStatus: 'SOLD', soldAt: now },
    });
  });

  it('rejects replacement allocation for another Product or an effective Warranty', async () => {
    const updateMany = vi.fn();
    const warrantyCount = vi.fn<() => Promise<number>>().mockResolvedValue(0);
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: UNIT_ID }]),
      inventoryUnit: {
        findUnique: vi.fn().mockResolvedValue(iphoneUnit({ lifecycleStatus: 'AVAILABLE' })),
        updateMany,
      },
      warranty: { count: warrantyCount },
    } as unknown as Prisma.TransactionClient;

    await expect(
      new AfterSalesInventoryGateway({} as PrismaService).allocateReplacement(
        { unitId: UNIT_ID, expectedProductId: 'another-product', now: new Date() },
        transaction,
      ),
    ).rejects.toMatchObject({ code: 'INVENTORY_NOT_AVAILABLE' });
    expect(updateMany).not.toHaveBeenCalled();

    warrantyCount.mockResolvedValueOnce(1);
    await expect(
      new AfterSalesInventoryGateway({} as PrismaService).allocateReplacement(
        { unitId: UNIT_ID, expectedProductId: 'product-1', now: new Date() },
        transaction,
      ),
    ).rejects.toMatchObject({ code: 'INVENTORY_NOT_AVAILABLE' });
  });
});

function iphoneUnit(overrides: Record<string, unknown> = {}) {
  return {
    id: UNIT_ID,
    variantId: VARIANT_ID,
    locationId: LOCATION_ID,
    inventoryCode: 'RPH-U-DEMO',
    lifecycleStatus: 'INSPECTING',
    soldAt: new Date('2026-08-24T00:00:00.000Z'),
    location: { status: 'ACTIVE' },
    variant: {
      productId: 'product-1',
      inventoryMode: 'SERIALIZED',
      status: 'ACTIVE',
      product: { type: 'IPHONE', status: 'ACTIVE' },
    },
    _count: { reservations: 0 },
    ...overrides,
  };
}
