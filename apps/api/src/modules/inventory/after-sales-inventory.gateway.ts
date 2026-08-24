import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

type DbClient = PrismaService | Prisma.TransactionClient;

const afterSalesUnitSelect = {
  id: true,
  variantId: true,
  locationId: true,
  inventoryCode: true,
  lifecycleStatus: true,
  soldAt: true,
  location: { select: { status: true } },
  variant: {
    select: {
      productId: true,
      inventoryMode: true,
      status: true,
      product: { select: { type: true, status: true } },
    },
  },
  _count: { select: { reservations: { where: { status: 'ACTIVE' } } } },
} satisfies Prisma.InventoryUnitSelect;

const afterSalesInspectionSelect = {
  id: true,
  inventoryUnitId: true,
  inspectionType: true,
  status: true,
  overallResult: true,
  inspectorId: true,
  inspectedAt: true,
  isCurrent: true,
} satisfies Prisma.InventoryInspectionSelect;

export type AfterSalesInventoryUnit = Prisma.InventoryUnitGetPayload<{
  select: typeof afterSalesUnitSelect;
}>;
export type AfterSalesInspection = Prisma.InventoryInspectionGetPayload<{
  select: typeof afterSalesInspectionSelect;
}>;

@Injectable()
export class AfterSalesInventoryGateway {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public findUnit(id: string, client: DbClient = this.prisma) {
    return client.inventoryUnit.findUnique({ where: { id }, select: afterSalesUnitSelect });
  }

  public findActiveLocation(id: string, client: DbClient = this.prisma) {
    return client.inventoryLocation.findFirst({
      where: { id, status: 'ACTIVE' },
      select: { id: true, code: true, name: true, type: true },
    });
  }

  public async lockUnit(
    id: string,
    transaction: Prisma.TransactionClient,
  ): Promise<AfterSalesInventoryUnit | null> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM inventory_units WHERE id = ${id}::uuid FOR UPDATE
    `;
    if (rows.length !== 1) return null;
    return this.findUnit(id, transaction);
  }

  public async receiveSoldUnit(
    input: { unitId: string; receivedLocationId: string },
    transaction: Prisma.TransactionClient,
  ): Promise<AfterSalesInventoryUnit> {
    const location = await this.findActiveLocation(input.receivedLocationId, transaction);
    if (location === null) throw new ApiError('RESOURCE_NOT_FOUND');
    const unit = await this.lockUnit(input.unitId, transaction);
    if (
      unit === null ||
      unit.lifecycleStatus !== 'SOLD' ||
      unit.variant.product.type !== 'IPHONE' ||
      unit.variant.inventoryMode !== 'SERIALIZED' ||
      unit._count.reservations !== 0
    ) {
      throw new ApiError('INVALID_STATE_TRANSITION');
    }
    const updated = await transaction.inventoryUnit.updateMany({
      where: {
        id: input.unitId,
        lifecycleStatus: 'SOLD',
        reservations: { none: { status: 'ACTIVE' } },
      },
      data: { lifecycleStatus: 'INSPECTING', locationId: input.receivedLocationId },
    });
    if (updated.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
    return transaction.inventoryUnit.findUniqueOrThrow({
      where: { id: input.unitId },
      select: afterSalesUnitSelect,
    });
  }

  public async createInspectionDraft(
    input: {
      unitId: string;
      inspectionType: 'WARRANTY' | 'RETURN';
      inspectorId: string;
    },
    transaction: Prisma.TransactionClient,
  ): Promise<AfterSalesInspection> {
    const unit = await this.lockUnit(input.unitId, transaction);
    if (
      unit === null ||
      unit.lifecycleStatus !== 'INSPECTING' ||
      unit.variant.product.type !== 'IPHONE' ||
      unit.variant.inventoryMode !== 'SERIALIZED'
    ) {
      throw new ApiError('INVALID_STATE_TRANSITION');
    }
    const draft = await transaction.inventoryInspection.findFirst({
      where: { inventoryUnitId: input.unitId, status: 'DRAFT' },
      select: { id: true },
    });
    if (draft !== null) throw new ApiError('DUPLICATE_RESOURCE');
    return transaction.inventoryInspection.create({
      data: {
        inventoryUnitId: input.unitId,
        inspectionType: input.inspectionType,
        inspectorId: input.inspectorId,
        checks: { schemaVersion: 1, items: {} },
        status: 'DRAFT',
        overallResult: 'INCOMPLETE',
        isCurrent: false,
      },
      select: afterSalesInspectionSelect,
    });
  }

  public async lockInspection(
    id: string,
    transaction: Prisma.TransactionClient,
  ): Promise<AfterSalesInspection | null> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM inventory_inspections WHERE id = ${id}::uuid FOR UPDATE
    `;
    if (rows.length !== 1) return null;
    return transaction.inventoryInspection.findUnique({
      where: { id },
      select: afterSalesInspectionSelect,
    });
  }

  public async returnUnitToCustomer(
    unitId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<AfterSalesInventoryUnit> {
    const unit = await this.lockUnit(unitId, transaction);
    if (unit?.lifecycleStatus !== 'INSPECTING') throw new ApiError('INVALID_STATE_TRANSITION');
    const updated = await transaction.inventoryUnit.updateMany({
      where: { id: unitId, lifecycleStatus: 'INSPECTING' },
      data: { lifecycleStatus: 'SOLD' },
    });
    if (updated.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
    return transaction.inventoryUnit.findUniqueOrThrow({
      where: { id: unitId },
      select: afterSalesUnitSelect,
    });
  }

  public async allocateReplacement(
    input: { unitId: string; expectedProductId: string; now: Date },
    transaction: Prisma.TransactionClient,
  ): Promise<AfterSalesInventoryUnit> {
    const unit = await this.lockUnit(input.unitId, transaction);
    const effectiveWarrantyCount =
      unit === null
        ? 0
        : await transaction.warranty.count({
            where: {
              inventoryUnitId: input.unitId,
              status: 'ACTIVE',
              startAt: { lte: input.now },
              endAt: { gt: input.now },
            },
          });
    if (
      unit === null ||
      unit.lifecycleStatus !== 'AVAILABLE' ||
      unit.variant.productId !== input.expectedProductId ||
      unit.variant.product.type !== 'IPHONE' ||
      unit.variant.product.status !== 'ACTIVE' ||
      unit.variant.inventoryMode !== 'SERIALIZED' ||
      unit.variant.status !== 'ACTIVE' ||
      unit.location.status !== 'ACTIVE' ||
      unit._count.reservations !== 0 ||
      effectiveWarrantyCount !== 0
    ) {
      throw new ApiError('INVENTORY_NOT_AVAILABLE');
    }
    const updated = await transaction.inventoryUnit.updateMany({
      where: {
        id: input.unitId,
        lifecycleStatus: 'AVAILABLE',
        variant: {
          productId: input.expectedProductId,
          status: 'ACTIVE',
          product: { status: 'ACTIVE' },
        },
        location: { status: 'ACTIVE' },
        reservations: { none: { status: 'ACTIVE' } },
      },
      data: { lifecycleStatus: 'SOLD', soldAt: input.now },
    });
    if (updated.count !== 1) throw new ApiError('INVENTORY_NOT_AVAILABLE');
    return transaction.inventoryUnit.findUniqueOrThrow({
      where: { id: input.unitId },
      select: afterSalesUnitSelect,
    });
  }
}
