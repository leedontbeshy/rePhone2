import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

export interface CheckoutInventoryLine {
  cartItemId: string;
  inventoryUnitId: string | null;
  unitLocationId: string | null;
  variantId: string;
  quantity: number;
}

export interface CheckoutInventoryTarget {
  cartItemId: string;
  inventoryUnitId: string | null;
  stockLevelId: string | null;
  quantity: number;
}

export interface CheckoutInventoryAllocation {
  location: {
    id: string;
    code: string;
    name: string;
    type: 'STORE' | 'WAREHOUSE';
  };
  targets: CheckoutInventoryTarget[];
}

export interface ReserveCheckoutInventoryInput {
  orderId: string;
  orderItemIds: ReadonlyMap<string, string>;
  allocation: CheckoutInventoryAllocation;
  holdReason: 'DEPOSIT' | 'PICKUP' | 'FULFILLMENT';
  expiresAt: Date | null;
}

@Injectable()
export class CheckoutInventoryGateway {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async selectLocation(
    lines: readonly CheckoutInventoryLine[],
    fulfillmentType: 'PICKUP' | 'SHIPPING',
    transaction: Prisma.TransactionClient,
  ): Promise<CheckoutInventoryAllocation> {
    const locations = await transaction.inventoryLocation.findMany({
      where: {
        status: 'ACTIVE',
        ...(fulfillmentType === 'PICKUP' ? { type: 'STORE' as const } : {}),
      },
      select: { id: true, code: true, name: true, type: true },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
    const orderedLocations =
      fulfillmentType === 'SHIPPING'
        ? [...locations].sort((left, right) => {
            const leftRank = left.type === 'WAREHOUSE' ? 0 : 1;
            const rightRank = right.type === 'WAREHOUSE' ? 0 : 1;
            return (
              leftRank - rightRank ||
              left.code.localeCompare(right.code) ||
              left.id.localeCompare(right.id)
            );
          })
        : locations;
    if (orderedLocations.length === 0) throw new ApiError('CART_NOT_FULFILLABLE');

    const unitIds = lines.flatMap(({ inventoryUnitId }) =>
      inventoryUnitId === null ? [] : [inventoryUnitId],
    );
    const accessoryVariantIds = [
      ...new Set(
        lines.flatMap(({ inventoryUnitId, variantId }) =>
          inventoryUnitId === null ? [variantId] : [],
        ),
      ),
    ];
    const [units, stockLevels] = await Promise.all([
      unitIds.length === 0
        ? Promise.resolve([])
        : transaction.inventoryUnit.findMany({
            where: { id: { in: unitIds }, lifecycleStatus: 'AVAILABLE' },
            select: {
              id: true,
              locationId: true,
              reservations: { where: { status: 'ACTIVE' }, select: { id: true }, take: 1 },
            },
          }),
      accessoryVariantIds.length === 0
        ? Promise.resolve([])
        : transaction.stockLevel.findMany({
            where: {
              variantId: { in: accessoryVariantIds },
              locationId: { in: orderedLocations.map(({ id }) => id) },
            },
            select: {
              id: true,
              variantId: true,
              locationId: true,
              quantityOnHand: true,
              quantityReserved: true,
            },
          }),
    ]);
    const unitMap = new Map(units.map((unit) => [unit.id, unit]));
    const stockByLocationVariant = new Map(
      stockLevels.map((stock) => [`${stock.locationId}:${stock.variantId}`, stock]),
    );

    for (const line of lines) {
      if (line.inventoryUnitId !== null) {
        const unit = unitMap.get(line.inventoryUnitId);
        if (unit === undefined || unit.reservations.length !== 0 || line.quantity !== 1) {
          throw new ApiError('INVENTORY_NOT_AVAILABLE');
        }
      } else {
        const individuallyAvailable = stockLevels.some(
          (stock) =>
            stock.variantId === line.variantId &&
            stock.quantityOnHand - stock.quantityReserved >= line.quantity,
        );
        if (!individuallyAvailable) throw new ApiError('INVENTORY_NOT_AVAILABLE');
      }
    }

    for (const location of orderedLocations) {
      const targets: CheckoutInventoryTarget[] = [];
      let canFulfill = true;
      for (const line of lines) {
        if (line.inventoryUnitId !== null) {
          const unit = unitMap.get(line.inventoryUnitId);
          if (unit?.locationId !== location.id) {
            canFulfill = false;
            break;
          }
          targets.push({
            cartItemId: line.cartItemId,
            inventoryUnitId: line.inventoryUnitId,
            stockLevelId: null,
            quantity: 1,
          });
          continue;
        }
        const stock = stockByLocationVariant.get(`${location.id}:${line.variantId}`);
        if (stock === undefined || stock.quantityOnHand - stock.quantityReserved < line.quantity) {
          canFulfill = false;
          break;
        }
        targets.push({
          cartItemId: line.cartItemId,
          inventoryUnitId: null,
          stockLevelId: stock.id,
          quantity: line.quantity,
        });
      }
      if (canFulfill) return { location, targets };
    }

    throw new ApiError('CART_NOT_FULFILLABLE');
  }

  public async reserve(
    input: ReserveCheckoutInventoryInput,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    const unitIds = input.allocation.targets.flatMap(({ inventoryUnitId }) =>
      inventoryUnitId === null ? [] : [inventoryUnitId],
    );
    const stockIds = input.allocation.targets.flatMap(({ stockLevelId }) =>
      stockLevelId === null ? [] : [stockLevelId],
    );
    await this.lockTargets(unitIds, stockIds, transaction);

    for (const target of input.allocation.targets) {
      const orderItemId = input.orderItemIds.get(target.cartItemId);
      if (orderItemId === undefined) throw new ApiError('INTERNAL_ERROR');
      if (target.inventoryUnitId !== null) {
        const unit = await transaction.inventoryUnit.findFirst({
          where: {
            id: target.inventoryUnitId,
            locationId: input.allocation.location.id,
            lifecycleStatus: 'AVAILABLE',
            reservations: { none: { status: 'ACTIVE' } },
          },
          select: { id: true },
        });
        if (unit === null) throw new ApiError('INVENTORY_NOT_AVAILABLE');
      } else if (target.stockLevelId !== null) {
        const updated = await transaction.$executeRaw`
          UPDATE stock_levels
          SET quantity_reserved = quantity_reserved + ${target.quantity}, updated_at = now()
          WHERE id = ${target.stockLevelId}::uuid
            AND quantity_on_hand - quantity_reserved >= ${target.quantity}
        `;
        if (updated !== 1) throw new ApiError('INVENTORY_NOT_AVAILABLE');
      } else {
        throw new ApiError('INTERNAL_ERROR');
      }
      await transaction.inventoryReservation.create({
        data: {
          orderId: input.orderId,
          orderItemId,
          inventoryUnitId: target.inventoryUnitId,
          stockLevelId: target.stockLevelId,
          quantity: target.quantity,
          status: 'ACTIVE',
          holdReason: input.holdReason,
          expiresAt: input.expiresAt,
        },
      });
    }
  }

  public async releaseOrderReservations(
    orderId: string,
    now: Date,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    const reservations = await transaction.inventoryReservation.findMany({
      where: { orderId, status: 'ACTIVE' },
      select: { id: true, inventoryUnitId: true, stockLevelId: true, quantity: true },
      orderBy: { id: 'asc' },
    });
    await this.lockTargets(
      reservations.flatMap(({ inventoryUnitId }) =>
        inventoryUnitId === null ? [] : [inventoryUnitId],
      ),
      reservations.flatMap(({ stockLevelId }) => (stockLevelId === null ? [] : [stockLevelId])),
      transaction,
    );
    for (const reservation of reservations) {
      if (reservation.stockLevelId !== null) {
        const updated = await transaction.$executeRaw`
          UPDATE stock_levels
          SET quantity_reserved = quantity_reserved - ${reservation.quantity}, updated_at = now()
          WHERE id = ${reservation.stockLevelId}::uuid
            AND quantity_reserved >= ${reservation.quantity}
        `;
        if (updated !== 1) throw new ApiError('INTERNAL_ERROR');
      }
    }
    if (reservations.length > 0) {
      await transaction.inventoryReservation.updateMany({
        where: { id: { in: reservations.map(({ id }) => id) }, status: 'ACTIVE' },
        data: { status: 'RELEASED', releasedAt: now },
      });
    }
  }

  private async lockTargets(
    unitIds: readonly string[],
    stockIds: readonly string[],
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    for (const id of [...new Set(unitIds)].sort()) {
      await transaction.$queryRaw`SELECT id FROM inventory_units WHERE id = ${id}::uuid FOR UPDATE`;
    }
    for (const id of [...new Set(stockIds)].sort()) {
      await transaction.$queryRaw`SELECT id FROM stock_levels WHERE id = ${id}::uuid FOR UPDATE`;
    }
  }
}
