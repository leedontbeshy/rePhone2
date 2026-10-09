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
  status: 'ACTIVE' | 'RELEASED' | 'EXPIRED' | 'CONSUMED';
  holdReason: 'DEPOSIT' | 'REVIEW' | 'PICKUP' | 'FULFILLMENT' | 'DEALER_PAYMENT' | 'DEALER_BALANCE';
  expiresAt: Date | null;
  consumedAt: Date | null;
  orderItem: {
    id: string;
    orderId: string;
    inventoryUnitId: string | null;
    variantId: string;
    quantity: number;
  };
  inventoryUnit: { locationId: string; variantId: string } | null;
  stockLevel: { locationId: string; variantId: string } | null;
}

export interface FulfillmentStockMovement {
  id: string;
  variantId: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  type:
    'RECEIPT' | 'SALE' | 'RETURN' | 'TRANSFER' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'WRITE_OFF';
  quantity: number;
  referenceType: string | null;
  referenceId: string | null;
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
        status: true,
        holdReason: true,
        expiresAt: true,
        consumedAt: true,
        orderItem: {
          select: {
            id: true,
            orderId: true,
            inventoryUnitId: true,
            variantId: true,
            quantity: true,
          },
        },
        inventoryUnit: { select: { locationId: true, variantId: true } },
        stockLevel: { select: { locationId: true, variantId: true } },
      },
      orderBy: { id: 'asc' },
    });
  }

  public async lockShippingCompletionProof(
    orderId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<{
    reservations: FulfillmentReservation[];
    movements: FulfillmentStockMovement[];
  }> {
    await transaction.$queryRaw`
      SELECT id
      FROM inventory_reservations
      WHERE order_id = ${orderId}::uuid AND status IN ('ACTIVE', 'CONSUMED')
      ORDER BY id
      FOR UPDATE
    `;
    const reservations = await transaction.inventoryReservation.findMany({
      where: { orderId, status: { in: ['ACTIVE', 'CONSUMED'] } },
      select: {
        id: true,
        orderId: true,
        orderItemId: true,
        inventoryUnitId: true,
        stockLevelId: true,
        quantity: true,
        status: true,
        holdReason: true,
        expiresAt: true,
        consumedAt: true,
        orderItem: {
          select: {
            id: true,
            orderId: true,
            inventoryUnitId: true,
            variantId: true,
            quantity: true,
          },
        },
        inventoryUnit: { select: { locationId: true, variantId: true } },
        stockLevel: { select: { locationId: true, variantId: true } },
      },
      orderBy: { id: 'asc' },
    });
    if (reservations.length === 0) return { reservations, movements: [] };

    await transaction.$queryRaw`
      SELECT movement.id
      FROM stock_movements AS movement
      INNER JOIN inventory_reservations AS reservation
        ON reservation.id = movement.reference_id
      WHERE movement.reference_type = 'INVENTORY_RESERVATION'
        AND reservation.order_id = ${orderId}::uuid
        AND reservation.status IN ('ACTIVE', 'CONSUMED')
      ORDER BY movement.id
      FOR UPDATE OF movement
    `;
    const movements = await transaction.stockMovement.findMany({
      where: {
        referenceType: 'INVENTORY_RESERVATION',
        referenceId: { in: reservations.map(({ id }) => id) },
      },
      select: {
        id: true,
        variantId: true,
        fromLocationId: true,
        toLocationId: true,
        type: true,
        quantity: true,
        referenceType: true,
        referenceId: true,
      },
      orderBy: { id: 'asc' },
    });
    return { reservations, movements };
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
          reservation.inventoryUnit.variantId !== expected.variantId ||
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

  public assertShippingHold(
    reservations: readonly FulfillmentReservation[],
    orderId: string,
    orderItems: readonly FulfillmentOrderItemTarget[],
    locationId: string,
  ): void {
    this.assertReservationTargets(reservations, orderId, orderItems, locationId);
    if (
      reservations.some(
        (reservation) => reservation.holdReason !== 'FULFILLMENT' || reservation.expiresAt !== null,
      )
    ) {
      throw new ApiError('INVALID_STATE_TRANSITION');
    }
  }

  public assertShippingCompletionProof(
    reservations: readonly FulfillmentReservation[],
    movements: readonly FulfillmentStockMovement[],
    orderId: string,
    orderItems: readonly FulfillmentOrderItemTarget[],
    locationId: string,
    shippedAt: Date,
  ): void {
    this.assertReservationTargets(reservations, orderId, orderItems, locationId);
    if (
      reservations.some(
        (reservation) =>
          reservation.status !== 'CONSUMED' ||
          reservation.holdReason !== 'FULFILLMENT' ||
          reservation.expiresAt !== null ||
          reservation.consumedAt?.getTime() !== shippedAt.getTime(),
      )
    ) {
      throw new ApiError('INVALID_STATE_TRANSITION');
    }

    const movementsByReservation = new Map<string, FulfillmentStockMovement[]>();
    for (const movement of movements) {
      if (movement.referenceId === null) throw new ApiError('INVENTORY_NOT_AVAILABLE');
      const existing = movementsByReservation.get(movement.referenceId) ?? [];
      existing.push(movement);
      movementsByReservation.set(movement.referenceId, existing);
    }
    for (const reservation of reservations) {
      const matching = movementsByReservation.get(reservation.id) ?? [];
      if (reservation.inventoryUnitId !== null) {
        if (matching.length !== 0) throw new ApiError('INVENTORY_NOT_AVAILABLE');
        continue;
      }
      if (
        reservation.stockLevelId === null ||
        matching.length !== 1 ||
        matching[0]?.type !== 'SALE' ||
        matching[0].referenceType !== 'INVENTORY_RESERVATION' ||
        matching[0].variantId !== reservation.orderItem.variantId ||
        matching[0].fromLocationId !== locationId ||
        matching[0].toLocationId !== null ||
        matching[0].quantity !== reservation.quantity
      ) {
        throw new ApiError('INVENTORY_NOT_AVAILABLE');
      }
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

  public async transitionReservationHold(
    reservations: readonly FulfillmentReservation[],
    fromReason: 'DEPOSIT' | 'REVIEW',
    toReason: 'REVIEW' | 'FULFILLMENT',
    expiresAt: Date | null,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    if (reservations.length === 0) throw new ApiError('INVALID_STATE_TRANSITION');
    const updated = await transaction.inventoryReservation.updateMany({
      where: {
        id: { in: reservations.map(({ id }) => id) },
        status: 'ACTIVE',
        holdReason: fromReason,
      },
      data: { holdReason: toReason, expiresAt },
    });
    if (updated.count !== reservations.length) throw new ApiError('INVALID_STATE_TRANSITION');
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

  public async handoverShipping(
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
        const handedOver = await transaction.inventoryUnit.updateMany({
          where: {
            id: reservation.inventoryUnitId,
            locationId,
            lifecycleStatus: 'AVAILABLE',
          },
          data: { lifecycleStatus: 'IN_TRANSIT' },
        });
        if (handedOver.count !== 1) throw new ApiError('INVENTORY_NOT_AVAILABLE');
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

  public async completeShipping(
    orderItems: readonly FulfillmentOrderItemTarget[],
    locationId: string,
    now: Date,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    const unitIds = orderItems.flatMap(({ inventoryUnitId }) =>
      inventoryUnitId === null ? [] : [inventoryUnitId],
    );
    if (new Set(unitIds).size !== unitIds.length) throw new ApiError('INTERNAL_ERROR');
    await this.lockTargets(unitIds, [], transaction);
    for (const id of unitIds.sort()) {
      const sold = await transaction.inventoryUnit.updateMany({
        where: { id, locationId, lifecycleStatus: 'IN_TRANSIT' },
        data: { lifecycleStatus: 'SOLD', soldAt: now },
      });
      if (sold.count !== 1) throw new ApiError('INVENTORY_NOT_AVAILABLE');
    }
  }

  public async returnShipping(
    orderItems: readonly FulfillmentOrderItemTarget[],
    sourceLocationId: string,
    returnedToLocationId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    const unitIds = orderItems.flatMap(({ inventoryUnitId }) =>
      inventoryUnitId === null ? [] : [inventoryUnitId],
    );
    if (new Set(unitIds).size !== unitIds.length) throw new ApiError('INTERNAL_ERROR');
    await this.lockTargets(unitIds, [], transaction);
    for (const id of unitIds.sort()) {
      const returned = await transaction.inventoryUnit.updateMany({
        where: { id, locationId: sourceLocationId, lifecycleStatus: 'IN_TRANSIT' },
        data: { lifecycleStatus: 'INSPECTING', locationId: returnedToLocationId },
      });
      if (returned.count !== 1) throw new ApiError('INVENTORY_NOT_AVAILABLE');
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
