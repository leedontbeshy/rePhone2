/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service.js';
import { InspectionRepository } from './inspection.repository.js';
import { InventoryRepository } from './inventory.repository.js';
import { StockRepository } from './stock.repository.js';

const ID = '0198e5b0-0000-7000-8000-000000000001';

describe('FE06 inventory projection repositories', () => {
  it('loads receiving choices from eligible catalog variants independently of stock rows', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(7);
    const prisma = { productVariant: { findMany, count } } as unknown as PrismaService;

    const result = await new StockRepository(prisma).listVariants({ page: 2, pageSize: 3 });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        inventoryMode: 'QUANTITY',
        status: { not: 'ARCHIVED' },
        archivedAt: null,
        product: { type: 'ACCESSORY', status: { not: 'ARCHIVED' }, archivedAt: null },
      },
      select: {
        id: true,
        sku: true,
        displayName: true,
        status: true,
        product: { select: { id: true, name: true, slug: true, status: true } },
      },
      orderBy: [
        { product: { name: 'asc' } },
        { displayName: 'asc' },
        { sku: 'asc' },
        { id: 'asc' },
      ],
      skip: 3,
      take: 3,
    });
    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        inventoryMode: 'QUANTITY',
        status: { not: 'ARCHIVED' },
        archivedAt: null,
        product: { type: 'ACCESSORY', status: { not: 'ARCHIVED' }, archivedAt: null },
      }),
    });
    expect(result).toEqual({ items: [], totalItems: 7 });
  });

  it('loads ordered public unit media and draft counts only for detail projections', async () => {
    const findUnique = vi.fn(async () => null);
    const prisma = { inventoryUnit: { findUnique } } as unknown as PrismaService;

    await new InventoryRepository(prisma).findUnit(ID);

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: ID },
      include: expect.objectContaining({
        media: {
          where: { visibility: 'PUBLIC' },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        },
        _count: {
          select: expect.objectContaining({
            inspections: { where: { status: 'DRAFT' } },
          }),
        },
      }),
    });
  });

  it('checks for an active transfer destination without returning location details', async () => {
    const count = vi.fn(async () => 1);
    const prisma = { inventoryLocation: { count } } as unknown as PrismaService;

    await expect(new InventoryRepository(prisma).hasActiveTransferTarget(ID)).resolves.toBe(true);
    expect(count).toHaveBeenCalledWith({
      where: { id: { not: ID }, status: 'ACTIVE' },
    });
  });

  it('loads stock movement display relations in the same paginated query', async () => {
    const findMany = vi.fn(async () => []);
    const count = vi.fn(async () => 0);
    const prisma = { stockMovement: { findMany, count } } as unknown as PrismaService;

    await new StockRepository(prisma).listMovements({ page: 1, pageSize: 20 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          variant: { include: { product: true } },
          fromLocation: true,
          toLocation: true,
          createdBy: { select: { id: true, fullName: true, employeeCode: true } },
        },
      }),
    );
  });

  it('loads inspector display fields for inspection lists', async () => {
    const findMany = vi.fn(async () => []);
    const count = vi.fn(async () => 0);
    const prisma = {
      inventoryInspection: { findMany, count },
    } as unknown as PrismaService;

    await new InspectionRepository(prisma).list(ID, 1, 20);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          inspector: { select: { id: true, fullName: true, employeeCode: true } },
        },
      }),
    );
  });
});
