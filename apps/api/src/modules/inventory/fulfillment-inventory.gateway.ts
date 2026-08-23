import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import type { Prisma } from '../../generated/prisma/client.js';

export interface FulfillmentReservation {
  id: string;
  orderId: string;
  orderItemId: string;
  inventoryUnitId: string | null;
  stockLevelId: string | null;
  quantity: number;
  holdReason: 'DEPOSIT' | 'REVIEW' | 'PICKUP' | 'FULFILLMENT';
  expiresAt: Date | null;
  orderItem: {
    id: string;
    orderId: string;
    inventoryUnitId: string | null;
    variantId: string;
    quantity: number;
  };
  inventoryUnit: { locationId: string } | null;
  stockLevel: { locationId: string; variantId: string } | null;
}

export interface FulfillmentOrderItemTarget {
  id: string;
  inventoryUnitId: string | null;
  variantId: string;
  quantity: number;
}

@Injectable()
export class FulfillmentInventoryGateway {
  public async lockActiveReservations(
    orderId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<FulfillmentReservation[]> {
    await transaction.$queryRaw`
      SELECT id
      FROM inventory_reservations
      WHERE order_id = ${orderId}::uuid AND status = 'ACTIVE'
      ORDER BY id
      FOR UPDATE
    `;
    return transaction.inventoryReservation.findMany({
      where: { orderId, status: 'ACTIVE' },
      select: {
        id: true,
        orderId: true,
        orderItemId: true,
        inventoryUnitId: true,
        stockLevelId: true,
        quantity: true,
        holdReason: true,
        expiresAt: true,
        orderItem: {
          select: {
            id: true,
            orderId: true,
            inventoryUnitId: true,
            variantId: true,
            quantity: true,
          },
        },
        inventoryUnit: { select: { locationId: true } },
        stockLevel: { select: { locationId: true, variantId: true } },
      },
      orderBy: { id: 'asc' },
    });
  }

  public assertReservationTargets(
    reservations: readonly FulfillmentReservation[],
    orderId: string,
    orderItems: readonly FulfillmentOrderItemTarget[],
    locationId: string,
  ): void {
    if (reservations.length === 0 || reservations.length !== orderItems.length) {
      throw new ApiError('INVENTORY_NOT_AVAILABLE');
    }
    const expectedItems = new Map(orderItems.map((item) => [item.id, item]));
    if (expectedItems.size !== orderItems.length) throw new ApiError('INTERNAL_ERROR');
    const coveredItems = new Set<string>();
    for (const reservation of reservations) {
      const expected = expectedItems.get(reservation.orderItemId);
      if (
        expected === undefined ||
        coveredItems.has(reservation.orderItemId) ||
        reservation.orderId !== orderId ||
        reservation.orderItem.id !== expected.id ||
        reservation.orderItem.orderId !== orderId ||
        reservation.orderItem.inventoryUnitId !== expected.inventoryUnitId ||
        reservation.orderItem.variantId !== expected.variantId ||
        reservation.orderItem.quantity !== expected.quantity
      ) {
        throw new ApiError('INVENTORY_NOT_AVAILABLE');
      }
      coveredItems.add(reservation.orderItemId);

      if (expected.inventoryUnitId !== null) {
        if (
          reservation.inventoryUnitId !== expected.inventoryUnitId ||
          reservation.stockLevelId !== null ||
          reservation.quantity !== 1 ||
          expected.quantity !== 1 ||
          reservation.inventoryUnit?.locationId !== locationId ||
          reservation.stockLevel !== null
        ) {
          throw new ApiError('INVENTORY_NOT_AVAILABLE');
        }
      } else if (
        reservation.inventoryUnitId !== null ||
        reservation.stockLevelId === null ||
        reservation.quantity !== expected.quantity ||
        reservation.inventoryUnit !== null ||
        reservation.stockLevel?.variantId !== expected.variantId ||
        reservation.stockLevel.locationId !== locationId
      ) {
        throw new ApiError('INVENTORY_NOT_AVAILABLE');
      }
    }
  }

  public assertPickupHold(
    reservations: readonly FulfillmentReservation[],
    orderId: string,
    orderItems: readonly FulfillmentOrderItemTarget[],
    locationId: string,
    holdUntil: Date,
  ): void {
    this.assertReservationTargets(reservations, orderId, orderItems, locationId);
    if (
      reservations.some(
        (reservation) =>
          reservation.holdReason !== 'PICKUP' ||
          reservation.expiresAt?.getTime() !== holdUntil.getTime(),
      )
    ) {
      throw new ApiError('INVALID_STATE_TRANSITION');
    }
  }

  public async extendPickupHold(
    orderId: string,
    holdUntil: Date,
    expectedCount: number,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    const updated = await transaction.inventoryReservation.updateMany({
      where: { orderId, status: 'ACTIVE', holdReason: 'PICKUP' },
      data: { expiresAt: holdUntil },
    });
    if (updated.count !== expectedCount) throw new ApiError('INVALID_STATE_TRANSITION');
  }

  public async consumePickup(
    reservations: readonly FulfillmentReservation[],
    locationId: string,
    staffUserId: string,
    now: Date,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    const unitIds = reservations.flatMap(({ inventoryUnitId }) =>
      inventoryUnitId === null ? [] : [inventoryUnitId],
    );
    const stockIds = reservations.flatMap(({ stockLevelId }) =>
      stockLevelId === null ? [] : [stockLevelId],
    );
    await this.lockTargets(unitIds, stockIds, transaction);

    for (const reservation of reservations) {
      if (reservation.inventoryUnitId !== null) {
        if (
          reservation.stockLevelId !== null ||
          reservation.quantity !== 1 ||
          reservation.orderItem.quantity !== 1 ||
          reservation.orderItem.inventoryUnitId !== reservation.inventoryUnitId
        ) {
          throw new ApiError('INVENTORY_NOT_AVAILABLE');
        }
        const sold = await transaction.inventoryUnit.updateMany({
          where: {
            id: reservation.inventoryUnitId,
            locationId,
            lifecycleStatus: 'AVAILABLE',
          },
          data: { lifecycleStatus: 'SOLD', soldAt: now },
        });
        if (sold.count !== 1) throw new ApiError('INVENTORY_NOT_AVAILABLE');
      } else if (reservation.stockLevelId !== null) {
        if (
          reservation.orderItem.inventoryUnitId !== null ||
          reservation.orderItem.quantity !== reservation.quantity
        ) {
          throw new ApiError('INVENTORY_NOT_AVAILABLE');
        }
        const consumed = await transaction.$executeRaw`
          UPDATE stock_levels
          SET quantity_on_hand = quantity_on_hand - ${reservation.quantity},
              quantity_reserved = quantity_reserved - ${reservation.quantity},
              updated_at = ${now}
          WHERE id = ${reservation.stockLevelId}::uuid
            AND location_id = ${locationId}::uuid
            AND variant_id = ${reservation.orderItem.variantId}::uuid
            AND quantity_on_hand >= ${reservation.quantity}
            AND quantity_reserved >= ${reservation.quantity}
        `;
        if (consumed !== 1) throw new ApiError('INVENTORY_NOT_AVAILABLE');
        await transaction.stockMovement.create({
          data: {
            variantId: reservation.orderItem.variantId,
            fromLocationId: locationId,
            type: 'SALE',
            quantity: reservation.quantity,
            referenceType: 'INVENTORY_RESERVATION',
            referenceId: reservation.id,
            createdById: staffUserId,
          },
        });
      } else {
        throw new ApiError('INVENTORY_NOT_AVAILABLE');
      }
      const consumedReservation = await transaction.inventoryReservation.updateMany({
        where: { id: reservation.id, status: 'ACTIVE' },
        data: { status: 'CONSUMED', consumedAt: now },
      });
      if (consumedReservation.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
    }
  }

  public async expirePickup(
    reservations: readonly FulfillmentReservation[],
    now: Date,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    const unitIds = reservations.flatMap(({ inventoryUnitId }) =>
      inventoryUnitId === null ? [] : [inventoryUnitId],
    );
    const stockIds = reservations.flatMap(({ stockLevelId }) =>
      stockLevelId === null ? [] : [stockLevelId],
    );
    await this.lockTargets(unitIds, stockIds, transaction);
    for (const reservation of reservations) {
      if (reservation.stockLevelId !== null) {
        const released = await transaction.$executeRaw`
          UPDATE stock_levels
          SET quantity_reserved = quantity_reserved - ${reservation.quantity}, updated_at = ${now}
          WHERE id = ${reservation.stockLevelId}::uuid
            AND quantity_reserved >= ${reservation.quantity}
        `;
        if (released !== 1) throw new ApiError('INTERNAL_ERROR');
      }
      const expired = await transaction.inventoryReservation.updateMany({
        where: { id: reservation.id, status: 'ACTIVE' },
        data: { status: 'EXPIRED', releasedAt: now },
      });
      if (expired.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
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
